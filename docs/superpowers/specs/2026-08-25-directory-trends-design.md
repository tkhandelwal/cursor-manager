# Directory trends — design

Date: 2026-08-25
Status: approved, not yet implemented
Follows: `2026-08-24-health-trend-tracking-design.md`

## Problem

The health panel now shows a growth rate for `state.vscdb` and a bare size for
everything else. But `state.vscdb` is one of five metrics, and it is not the
only one that grows: workspace storage accumulates a directory per project and
never prunes them, and the caches grow with use.

A rate on one metric and a snapshot on the other four answers "is the chat
database growing" when the question was "is Cursor getting bloated".

## Reversing a non-goal

`2026-08-24-health-trend-tracking-design.md` ruled this out:

> **No directory trends.** Only `state.vscdb` is sampled. The directory metrics
> need a capped walk, which is too costly to run on every session start.

That reasoning is still correct, and this design does not overturn it. It rules
out one *sampling site* — the plugin's session-start hook — not the feature.
The walk stays out of session start. It happens where it already happens.

## What this is not

`/api/health` already runs a capped walk over all five paths on every panel
load and discards the numbers. This design records what it already measures. No
new walk is introduced, no walk is made more expensive, and no directory
traversal enters the plugin.

## Goals

1. Show a growth rate for every metric the panel grades, not just the chat
   database.
2. Show one install-wide rate that answers the bloat question directly.
3. Add no measurable cost to a panel load, and none at all to a Cursor session
   start.

## Non-goals

- **No projection.** Unchanged from the prior design. Growth rate yes; forecast
  no.
- **No new sampling cadence for the chat database.** The plugin is not modified
  by this work.
- **No backfill.** Directory history begins when this ships.
- **No changes to `lib/measure.ts` caps.** Raising `MAX_MS` so large
  directories complete more often would slow every panel load to improve a
  secondary feature.

## The sampling bias, named

The prior design closed with:

> The web app alone cannot produce a series, because it only runs when the user
> opens it — which is the sampling bias this design exists to avoid.

This design accepts that bias for directories, deliberately. The alternative is
a capped walk on session start, which costs the user latency in the editor
every time — and the editor is the thing the whole tool exists to keep fast.

The consequence is real and must not be hidden: directory series advance only
while the app is open, so they are irregular and sparser than the chat-db
series. A rate computed from them is a rate over the periods the user happened
to be looking, which is not the same as a rate over calendar time.

The honesty guards already in `summariseTrend` — at least 2 samples, at least
an hour of span — are what keep this from producing a confident number out of
two panel loads a minute apart.

## Data contract

New file, owned exclusively by the web app:
`~/.cursor/cursor-manager/directory-samples.json`

```json
{
  "samples": [
    {
      "at": 1756000000000,
      "bytes": {
        "workspace-storage": 4200000000,
        "cached-data": 1800000000
      }
    }
  ]
}
```

- `at` — epoch ms.
- `bytes` — threshold id to byte count. Ordered oldest to newest.

**A metric whose `measurePath` returned `null` is omitted from the row.** Not
stored as `0`, not stored as `null`. `measurePath` returns `null` for a
missing, unreadable, *or capped-out* walk precisely so that "a partial total
must never be presented as complete" (`lib/measure.ts`). Storing a capped total
would make the next complete walk look like sudden growth and the capped one
look like a shrink. Rows are therefore sparse, and sparseness is the correct
representation of "we do not know".

**Retention: at most one sample per hour, keep the newest 180.** Mirrors the
plugin's policy. The constants are separate from the plugin's on purpose:
coupling them would mean a change to one writer's frequency silently changed
the other's retention.

### Why a separate file

`state.json` is the plugin's, and the plugin read-modify-writes it on every
session start. A second writer risks a lost update, and a lost update there
does not cost a trend sample — it costs a conversation record.

Separate ownership makes that failure impossible rather than unlikely: the app
never writes `state.json`, so no bug in this feature can corrupt the plugin's
data. The cost is that history lives in two files, so a future "clear history"
must clear both.

## Architecture

### Pure logic

`lib/directory-samples.ts` — no clock, no filesystem:

```ts
export type DirectorySample = { at: number; bytes: Record<string, number> }
export type DirectoryStore = { samples: DirectorySample[] }

export const SAMPLE_INTERVAL_MS = 3_600_000
export const MAX_SAMPLES = 180

export function recordDirectorySample(
  store: unknown,
  measurements: Measurement[],
  now: number,
): DirectoryStore
```

Drops measurements whose `bytes` is `null`, returns the store unchanged when
throttled or when no metric survived, and caps the series at `MAX_SAMPLES`.

The route passes only the four directory measurements. `chat-db` is excluded at
the call site, not inside the function: the plugin owns that series, and a
second copy written on a different cadence would be a second source of truth
for the same number. The function itself has no special case for any id.

`lib/trend.ts` — `Sample` generalizes from `{ at, chatDbBytes }` to
`{ at, bytes }`. `summariseTrend` is otherwise unchanged and is reused for
every metric. The plugin's on-disk rows keep their `chatDbBytes` field; the
route maps them at the read boundary, and malformed rows are still dropped by
the existing `isSample` guard, so validation stays inside `trend.ts`.

`summariseTotal(trends: Trend[]): TotalTrend | null` — sums `bytesPerDay`
across the metrics that have a trend and reports how many of how many that
covers:

```ts
export type TotalTrend = {
  bytesPerDay: number
  covered: number // metrics contributing a rate
  total: number // metrics the panel grades (5)
}
```

The input is **all five trends** — the chat-db trend from the plugin's series
plus the four directory trends — so the total answers the bloat question for
the whole install, not just the part this design adds. Returns `null` when
`covered` is 0.

### Why a summed rate, not a summed delta

There is no instant at which a true install-wide total exists. The chat-db
series is written hourly by the plugin; the directory series is written on
panel load by the app. Their timestamps never align, so differencing one
"total" against another would be differencing two numbers that were never
simultaneously true.

Summing per-metric rates is valid where differencing misaligned totals is not:
each rate is computed over its own series and its own span, and rates add.

The coverage count is load-bearing, not decoration. Without it, a metric
dropping out of the sum reads as the install growing more slowly.

### Route

`app/api/health/route.ts` records after building `measurements`, then reads
both series and returns `trend`, `directoryTrends`, and `totalTrend`.

The write is wrapped in try/catch and its failure is silent: a trend feature
must never turn a working panel into a 500. It writes to a temp file and
renames, so a concurrent panel load cannot observe a torn file. Last-writer-
wins on content is acceptable — the worst case is one lost sample.

### Panel

`TrendLine` is reused unchanged under every finding that has a trend.
`TotalTrendLine` renders above the findings. A metric without enough samples
renders nothing — no placeholder, no "collecting data" message, because empty
space is honest and a placeholder invites the user to wait for something that
may never arrive for a directory that always caps out.

**`TotalTrendLine` shows a rate and its coverage, not a total size.** The panel
does not display an install total today, and `totalBytes` cannot honestly
supply one here: it sums `finding.bytes ?? 0`, so a capped-out directory
silently reduces the total rather than making it unknown. That is the same
shape as the `0 B` and phantom-savings failures this codebase has already
removed. Adding an honest total size means giving `totalBytes` unknown-aware
semantics, which is a separate change to existing behaviour and out of scope
here.

## Data flow

1. Panel loads, `GET /api/health`.
2. Route walks all five paths (already the case today).
3. Route records the non-null results to `directory-samples.json`, throttled.
4. Route reads both sample files, summarises each metric, sums the rates.
5. Panel renders a total line, and a per-finding line wherever data supports one.

## Error handling

| Condition | Result |
| --- | --- |
| `directory-samples.json` missing or malformed | Treated as empty; no directory trends |
| Sample write fails (disk full, permissions) | Silent; panel renders normally |
| A metric capped out or unreadable | Omitted from the row; its trend has fewer samples |
| Every metric null for a load | No row written |
| Fewer than 2 samples, or span under 1 hour | That metric's trend is `null` |
| No metric has a trend | `totalTrend` is `null`; no total line |

## Testing

TDD, red verified for the right reason before each step.

- `lib/directory-samples.test.ts` — `recordDirectorySample`: appends, throttles
  inside the hour, caps at 180, omits null metrics, writes no row when all are
  null, tolerates a malformed store.
- `lib/trend.test.ts` — the `Sample` field rename; `summariseTotal` rate sum,
  coverage count, and null when no metric qualifies.
- `components/panels.test.tsx` — per-finding lines render; the total line
  renders; both are absent when there is no data.
- New test files must be registered in the `package.json` test script.

## Constraints

Directory trends require the user to open the app periodically. Unlike the
chat-db series, they do not accumulate in the background. A user who opens the
panel twice a month will see sizes and no directory rates, which is the correct
outcome for that amount of data.
