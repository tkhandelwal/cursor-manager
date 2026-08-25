# Health trend tracking — design

Date: 2026-08-24
Status: implemented 2026-08-24 (cfc2031)
Follows: `2026-08-23-cursor-health-panel-design.md` (deferred "Trend over time")

## Problem

The health panel reports a size at one instant. "Cursor gets bloated after a
while" is a question about a *rate*, which a single reading cannot answer.

The gap is not hypothetical: `state.vscdb` measured 17.8 GB on 2026-08-23 and
18.87 GB the next day — roughly 1 GB in a day of ordinary use. The panel showed
both numbers and could say nothing about the trajectory between them.

## What this is not

The expensive machinery in `lib/measure.ts` — capped walks, bounded
concurrency, skip semantics — exists for *directories*. A trend needs only
`state.vscdb`, which is a single `fs.stat` costing ~5 ms. So the plugin does
not need `lib/measure.ts`, and this design does not port it.

Only path resolution is duplicated: roughly ten lines mirroring
`lib/cursor-paths.ts`, tested on both sides.

## Goals

1. Collect the chat-database size over time, automatically, while the user
   works — including when the web app is closed.
2. Show a growth rate that is honest about how much data backs it.
3. Never let sampling interfere with a Cursor session.

## Non-goals

- **No projection.** Extrapolating a threshold-crossing date ("hits 5 GB in
  ~8 days") from a short, noisy series manufactures a confident number the data
  has not earned. This codebase has twice removed exactly that failure: the
  healthy-looking `0 B`, and the phantom "Freed 114 MB". Growth rate yes;
  forecast no.
- **No directory trends.** Only `state.vscdb` is sampled. The directory metrics
  need a capped walk, which is too costly to run on every session start.
- **No backfill.** History begins when this ships.

## Data contract

`~/.cursor/cursor-manager/state.json`, additive so existing files keep working:

```json
{
  "conversations": { "...": {} },
  "health": {
    "samples": [
      { "at": 1756000000000, "chatDbBytes": 20263456789 }
    ]
  }
}
```

- `at` — epoch ms.
- `chatDbBytes` — size of `state.vscdb` in bytes.
- Ordered oldest to newest.

**Retention: at most one sample per hour, keep the newest 180.** Sessions start
far more often than the file changes meaningfully, so unthrottled sampling would
be mostly noise; 180 hourly samples is about a week of dense use and a few KB of
JSON. `loadState` already tolerates unknown shapes, so an older state file
simply reports no trend until samples accumulate.

## Architecture

### Plugin (the writer)

`plugin/scripts/lib.mjs` gains two pure, testable functions:

```js
cursorDataPaths(platform, home, appData) // -> { chatDb }
recordHealthSample(state, bytes, now)    // -> new state, dedupe + cap applied
```

`recordHealthSample` returns state unchanged when the newest sample is under an
hour old, and trims to the newest 180 otherwise. Being pure, both the dedupe and
the cap are unit-tested without touching a filesystem or a clock.

`plugin/scripts/session-start.mjs` stats the chat DB and appends a sample before
its existing `saveState`.

**Every failure is silent.** A hook that throws disrupts a Cursor session, so a
missing path, a failed stat, or an unreadable state file means no sample is
recorded and the hook still emits its normal cap message. Sampling is strictly
additive to behaviour that already works.

### Web app (the reader)

`lib/trend.ts`, pure:

```ts
export type Sample = { at: number; chatDbBytes: number }

export type Trend = {
  first: Sample
  last: Sample
  deltaBytes: number
  spanMs: number
  bytesPerDay: number
  sampleCount: number
}

export function summariseTrend(samples: unknown): Trend | null
```

It takes no clock: every value it reports is derived from the samples
themselves, so it is deterministic and needs no injected `now`.

Returns `null` — meaning "not enough to say anything" — when there are fewer
than 2 valid samples, or when the span between first and last is under one hour.
A delta across two samples 30 seconds apart is noise wearing a number's
clothes, and rendering it as a rate would be the same overreach as the
projection this design rejects.

`app/api/health/route.ts` reads `~/.cursor/cursor-manager/state.json`, passes
`health.samples` through `summariseTrend`, and includes `trend` in its response.
A missing or malformed file yields `trend: null`, never an error.

`components/health-panel.tsx` renders one line beneath the chat-history
finding when `trend` is non-null, e.g.
`+1.02 GB over 7 days · ≈150 MB/day · 32 samples`. When it is null the panel
says nothing — absence of a trend is not a state worth explaining.

### Data flow

```
Cursor session starts
  -> plugin sessionStart hook -> stat state.vscdb
  -> recordHealthSample -> state.json

user opens the app
  -> /api/health reads state.json -> summariseTrend -> panel
```

The two sides share only the JSON shape above. Neither imports the other.

## Error handling

| Condition | Result |
| --- | --- |
| Chat DB missing / stat fails (plugin) | No sample; hook output unchanged |
| `state.json` missing or malformed (app) | `trend: null` |
| Fewer than 2 valid samples | `trend: null` |
| Span under 1 hour | `trend: null` |
| Samples present but malformed entries | Malformed entries dropped, rest used |

## Testing

TDD, red verified for the right reason before each step.

- `plugin/scripts/lib.test.mjs` — `recordHealthSample`: appends when due,
  skips inside the hour, caps at 180, preserves order, leaves `conversations`
  untouched; `cursorDataPaths` per platform.
- `lib/trend.test.ts` — `summariseTrend`: null below 2 samples, null under the
  span floor, rate maths over a known span, malformed entries dropped, unsorted
  input handled.
- `components/panels.test.tsx` — panel renders the trend line when present and
  omits it when null.
- New test files must be registered in the `package.json` test script.

## Constraints

Trend collection requires the plugin to be installed and enabled. The web app
alone cannot produce a series, because it only runs when the user opens it —
which is the sampling bias this design exists to avoid.
