# Health Trend Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sample the Cursor chat-database size on every session start so the health panel can show a growth rate instead of a single instant reading.

**Architecture:** The plugin (plain `.mjs`, runs standalone from `~/.cursor/plugins`) stats one file and appends `{at, chatDbBytes}` to `~/.cursor/cursor-manager/state.json`. The web app reads that file through its existing route handler and summarises it. The two sides share only a JSON shape — neither imports the other. All judgment lives in pure functions on both sides.

**Tech Stack:** Node `node:test` — via `tsx` for TypeScript, directly for the plugin's `.mjs`. Next.js 16 route handler, React 19, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-24-health-trend-tracking-design.md`

## Global Constraints

- **A hook must never break a Cursor session.** Every sampling failure is silent: missing path, failed stat, unreadable state — no sample, hook still emits its normal output.
- **Retention: at most one sample per hour, keep the newest 180.**
- **No projection.** Growth rate only. No forecast, no threshold-crossing date, no "at this rate" extrapolation anywhere in the UI.
- **No trend below 2 valid samples, and none when the span is under 1 hour.** Render nothing rather than a number the data has not earned.
- **Only `state.vscdb` is sampled.** No directory walks in the plugin.
- `summariseTrend` takes no clock — every value derives from the samples.
- Every new test file must be added to the `test` script in `package.json` or it silently never runs (AGENTS.md).

**Baseline:** 123 tests passing, lint 0, build 0.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `plugin/scripts/lib.mjs` | Add `cursorDataPaths`, `recordHealthSample`; make `loadState` preserve `health`. |
| `plugin/scripts/lib.test.mjs` | Unit tests for both new pure functions and the `loadState` shape. |
| `plugin/scripts/session-start.mjs` | Stat the chat DB and append a sample before the existing save. |
| `lib/trend.ts` | `summariseTrend` — pure, no clock, no I/O. |
| `lib/trend.test.ts` | Boundaries: <2 samples, span floor, rate maths, malformed input. |
| `app/api/health/route.ts` | Read `state.json`, include `trend` in the response. |
| `components/health-panel.tsx` | Render one trend line under the chat-history finding. |
| `components/panels.test.tsx` | Trend line renders when present, absent when null. |
| `package.json` | Register `lib/trend.test.ts`. |

---

### Task 1: Plugin sampling primitives

**Files:**
- Modify: `plugin/scripts/lib.mjs`
- Modify: `plugin/scripts/lib.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `cursorDataPaths(platform, home, appData)` → `{ chatDb }`; `recordHealthSample(state, bytes, now)` → new state object; constants `SAMPLE_INTERVAL_MS` (3_600_000) and `MAX_SAMPLES` (180). `loadState()` now also returns `health: { samples: [...] }`.

**Critical:** `loadState` currently rebuilds the state object with only `conversations`, so anything else in `state.json` is discarded on the next read. Samples would never accumulate. Fixing that is part of this task, not an afterthought.

- [ ] **Step 1: Write the failing tests**

Add to `plugin/scripts/lib.test.mjs` — first extend the import line to:

```js
import {
  DEFAULT_SETTINGS,
  MAX_SAMPLES,
  SAMPLE_INTERVAL_MS,
  activeCount,
  capMessage,
  cursorDataPaths,
  recordHealthSample,
  statusReport,
} from "./lib.mjs"
```

Then append:

```js
const HOUR = 3_600_000

function emptyState() {
  return { conversations: {}, health: { samples: [] } }
}

test("cursorDataPaths points at the chat database per platform", () => {
  assert.equal(
    cursorDataPaths("win32", "C:\\Users\\me", "C:\\Users\\me\\AppData\\Roaming").chatDb,
    "C:\\Users\\me\\AppData\\Roaming\\Cursor\\User\\globalStorage\\state.vscdb",
  )
  assert.equal(
    cursorDataPaths("darwin", "/Users/me").chatDb,
    "/Users/me/Library/Application Support/Cursor/User/globalStorage/state.vscdb",
  )
  assert.equal(
    cursorDataPaths("linux", "/home/me").chatDb,
    "/home/me/.config/Cursor/User/globalStorage/state.vscdb",
  )
})

test("an unknown platform falls back to the linux layout rather than throwing", () => {
  assert.equal(
    cursorDataPaths("freebsd", "/home/me").chatDb,
    "/home/me/.config/Cursor/User/globalStorage/state.vscdb",
  )
})

test("recordHealthSample appends the first sample", () => {
  const next = recordHealthSample(emptyState(), 1000, 5 * HOUR)
  assert.deepEqual(next.health.samples, [{ at: 5 * HOUR, chatDbBytes: 1000 }])
})

test("recordHealthSample skips a sample taken inside the interval", () => {
  const state = recordHealthSample(emptyState(), 1000, 5 * HOUR)
  const next = recordHealthSample(state, 2000, 5 * HOUR + SAMPLE_INTERVAL_MS - 1)
  assert.equal(next.health.samples.length, 1, "must not record twice within the interval")
  assert.equal(next.health.samples[0].chatDbBytes, 1000)
})

test("recordHealthSample records again once the interval has passed", () => {
  const state = recordHealthSample(emptyState(), 1000, 5 * HOUR)
  const next = recordHealthSample(state, 2000, 5 * HOUR + SAMPLE_INTERVAL_MS)
  assert.equal(next.health.samples.length, 2)
  assert.deepEqual(next.health.samples[1], { at: 5 * HOUR + SAMPLE_INTERVAL_MS, chatDbBytes: 2000 })
})

test("recordHealthSample caps the series at MAX_SAMPLES, keeping the newest", () => {
  let state = emptyState()
  for (let index = 0; index < MAX_SAMPLES + 25; index += 1) {
    state = recordHealthSample(state, index, index * SAMPLE_INTERVAL_MS)
  }
  assert.equal(state.health.samples.length, MAX_SAMPLES)
  assert.equal(
    state.health.samples[state.health.samples.length - 1].chatDbBytes,
    MAX_SAMPLES + 24,
    "the newest sample must survive the cap",
  )
  assert.ok(
    state.health.samples[0].chatDbBytes > 0,
    "the oldest samples are the ones dropped",
  )
})

test("recordHealthSample leaves conversations untouched", () => {
  const state = { conversations: { a: { startedAt: 1 } }, health: { samples: [] } }
  const next = recordHealthSample(state, 10, HOUR)
  assert.deepEqual(next.conversations, { a: { startedAt: 1 } })
})

test("recordHealthSample tolerates a state with no health key", () => {
  const next = recordHealthSample({ conversations: {} }, 10, HOUR)
  assert.equal(next.health.samples.length, 1)
})

test("recordHealthSample ignores a non-finite size rather than storing junk", () => {
  const next = recordHealthSample(emptyState(), Number.NaN, HOUR)
  assert.equal(next.health.samples.length, 0)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test plugin/scripts/lib.test.mjs`
Expected: FAIL — `cursorDataPaths`, `recordHealthSample`, `MAX_SAMPLES`, `SAMPLE_INTERVAL_MS` are not exported. If it fails for another reason, fix that first.

- [ ] **Step 3: Implement in `plugin/scripts/lib.mjs`**

Add `path` to the existing imports at the top of the file:

```js
import path from "node:path"
```

Append these exports:

```js
/** At most one sample per hour; keep the newest 180 (about a week of dense use). */
export const SAMPLE_INTERVAL_MS = 3_600_000
export const MAX_SAMPLES = 180

/**
 * Where Cursor keeps its data, per platform. Mirrors lib/cursor-paths.ts —
 * duplicated deliberately because this file runs standalone from
 * ~/.cursor/plugins and cannot import the app's TypeScript.
 *
 * Uses explicit win32/posix flavours so paths for one OS can be built and
 * asserted from a host running another.
 */
export function cursorDataPaths(platform, home, appData) {
  const p = platform === "win32" ? path.win32 : path.posix
  let root
  if (platform === "win32") {
    root = p.join(appData ?? p.join(home, "AppData", "Roaming"), "Cursor")
  } else if (platform === "darwin") {
    root = p.join(home, "Library", "Application Support", "Cursor")
  } else {
    root = p.join(home, ".config", "Cursor")
  }
  return { chatDb: p.join(root, "User", "globalStorage", "state.vscdb") }
}

/**
 * Append a size sample, honouring the interval and the cap. Pure: returns a
 * new state rather than mutating, and takes `now` so the throttle is testable
 * without a clock.
 */
export function recordHealthSample(state, bytes, now) {
  const samples = Array.isArray(state?.health?.samples) ? state.health.samples : []
  if (!Number.isFinite(bytes) || bytes < 0) {
    return { ...state, health: { samples } }
  }

  const newest = samples[samples.length - 1]
  if (newest && now - newest.at < SAMPLE_INTERVAL_MS) {
    return { ...state, health: { samples } }
  }

  const next = [...samples, { at: now, chatDbBytes: bytes }]
  return { ...state, health: { samples: next.slice(-MAX_SAMPLES) } }
}
```

Then fix `loadState` so it stops discarding everything but `conversations`. Replace the existing function body with:

```js
export async function loadState() {
  const file = join(dataDir(), "state.json")
  const saved = await readJson(file, { conversations: {} })
  return {
    conversations:
      saved.conversations && typeof saved.conversations === "object" ? saved.conversations : {},
    // Without this the samples written on one session start are dropped on the
    // next read, and the series never grows past one entry.
    health: {
      samples: Array.isArray(saved.health?.samples) ? saved.health.samples : [],
    },
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test plugin/scripts/lib.test.mjs`
Expected: PASS — 10 existing plus 9 new.

Run: `npm test`
Expected: 132 pass, 0 fail.

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugin/scripts/lib.mjs plugin/scripts/lib.test.mjs
git commit -m "Add chat-db sampling primitives to the plugin"
```

---

### Task 2: Sample on session start

**Files:**
- Modify: `plugin/scripts/session-start.mjs`

**Interfaces:**
- Consumes: `cursorDataPaths`, `recordHealthSample`, `loadState`, `saveState` (Task 1).
- Produces: samples accumulating in `~/.cursor/cursor-manager/state.json`.

This hook script has **no unit test**, matching the repo's existing convention — importing a hook script executes it, so only the pure helpers in `lib.mjs` are unit-tested (AGENTS.md). It is verified by running it the way Cursor runs it.

- [ ] **Step 1: Implement the sampling**

In `plugin/scripts/session-start.mjs`, extend the import from `./lib.mjs` to include `cursorDataPaths` and `recordHealthSample`, and add `stat` at the top:

```js
import { stat } from "node:fs/promises"
import { homedir } from "node:os"
```

Then, after the existing `const state = await loadState()` line, add:

```js
// Sampling is strictly additive to behaviour that already works: any failure
// here must leave the hook's normal output intact. A hook that throws
// disrupts the Cursor session it was meant to help.
let sampled = state
try {
  const { chatDb } = cursorDataPaths(process.platform, homedir(), process.env.APPDATA)
  const info = await stat(chatDb)
  sampled = recordHealthSample(state, info.size, Date.now())
} catch {
  /* no chat database, or it could not be read: skip this sample */
}
```

Change the existing conversation-tracking block to operate on `sampled` instead of `state`, and always save when a sample was added:

```js
if (id) {
  sampled.conversations[id] = {
    startedAt: Date.now(),
    mode: input.composer_mode ?? "agent",
    background: Boolean(input.is_background_agent),
  }
}
if (id || sampled !== state) {
  await saveState(sampled)
}

writeHook({ additional_context: capMessage(activeCount(sampled), settings) })
```

- [ ] **Step 2: Back up your real state file before exercising the hook**

This writes to your actual `~/.cursor/cursor-manager/state.json`.

```bash
cp ~/.cursor/cursor-manager/state.json ~/.cursor/cursor-manager/state.json.bak 2>/dev/null || echo "no existing state file"
```

- [ ] **Step 3: Run the hook the way Cursor runs it**

```bash
echo '{"conversation_id":"plan-test-1"}' | node plugin/scripts/session-start.mjs
```

Expected: it prints a JSON object containing `additional_context` with the usual cap message — unchanged from before.

Then inspect the state file:

```bash
node -e "const s=require(require('os').homedir()+'/.cursor/cursor-manager/state.json'); console.log('samples:', JSON.stringify(s.health?.samples))"
```

Expected: exactly one sample, with a plausible `chatDbBytes` (a large number — the author's chat DB is ~20 billion bytes).

- [ ] **Step 4: Verify the interval throttle against the real file**

Run the same hook command twice more:

```bash
echo '{"conversation_id":"plan-test-2"}' | node plugin/scripts/session-start.mjs
echo '{"conversation_id":"plan-test-3"}' | node plugin/scripts/session-start.mjs
node -e "const s=require(require('os').homedir()+'/.cursor/cursor-manager/state.json'); console.log('samples:', s.health.samples.length)"
```

Expected: still **1** sample. Three session starts within an hour must produce one sample, which is the whole point of the throttle.

- [ ] **Step 5: Verify a missing chat database does not break the hook**

Temporarily change the `cursorDataPaths(...)` call in the try block to `{ chatDb: "/definitely/not/here" }`, then:

```bash
echo '{"conversation_id":"plan-test-4"}' | node plugin/scripts/session-start.mjs
```

Expected: still prints the normal `additional_context` JSON and exits 0 — no stack trace, no non-zero exit. This is the "a hook must never break a Cursor session" constraint, and it is the single most important behaviour in this task. **Then revert the change.**

- [ ] **Step 6: Clean up the test conversations and confirm the suite**

```bash
node -e "
const fs=require('fs'), os=require('os');
const f=os.homedir()+'/.cursor/cursor-manager/state.json';
const s=JSON.parse(fs.readFileSync(f,'utf8'));
for (const k of Object.keys(s.conversations)) if (k.startsWith('plan-test-')) delete s.conversations[k];
fs.writeFileSync(f, JSON.stringify(s,null,2)+'\n');
console.log('removed plan-test conversations; samples kept:', s.health.samples.length);
"
```

Run: `npm test` → 132 pass. Run: `npm run lint` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add plugin/scripts/session-start.mjs
git commit -m "Sample the chat database size on session start"
```

---

### Task 3: Summarise the series

**Files:**
- Create: `lib/trend.ts`
- Create: `lib/trend.test.ts`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: nothing (pure; takes the raw `samples` array).
- Produces: types `Sample`, `Trend`; constants `MIN_SAMPLES` (2), `MIN_SPAN_MS` (3_600_000); function `summariseTrend(samples: unknown): Trend | null`.

- [ ] **Step 1: Write the failing test**

Create `lib/trend.test.ts`:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"

import { MIN_SPAN_MS, summariseTrend } from "./trend"

const HOUR = 3_600_000
const DAY = 24 * HOUR

test("no trend from fewer than two samples", () => {
  assert.equal(summariseTrend([]), null)
  assert.equal(summariseTrend([{ at: 0, chatDbBytes: 100 }]), null)
})

test("no trend when the span is under the floor", () => {
  const samples = [
    { at: 0, chatDbBytes: 100 },
    { at: MIN_SPAN_MS - 1, chatDbBytes: 900 },
  ]
  assert.equal(summariseTrend(samples), null, "a huge delta over seconds is noise, not a rate")
})

test("a trend at exactly the span floor is reported", () => {
  const trend = summariseTrend([
    { at: 0, chatDbBytes: 100 },
    { at: MIN_SPAN_MS, chatDbBytes: 200 },
  ])
  assert.ok(trend)
  assert.equal(trend.spanMs, MIN_SPAN_MS)
})

test("delta and rate are computed over the full span", () => {
  const trend = summariseTrend([
    { at: 0, chatDbBytes: 1_000 },
    { at: DAY, chatDbBytes: 3_000 },
    { at: 2 * DAY, chatDbBytes: 5_000 },
  ])
  assert.ok(trend)
  assert.equal(trend.deltaBytes, 4_000)
  assert.equal(trend.spanMs, 2 * DAY)
  assert.equal(trend.bytesPerDay, 2_000)
  assert.equal(trend.sampleCount, 3)
  assert.equal(trend.first.chatDbBytes, 1_000)
  assert.equal(trend.last.chatDbBytes, 5_000)
})

test("a shrinking series reports a negative delta", () => {
  const trend = summariseTrend([
    { at: 0, chatDbBytes: 5_000 },
    { at: DAY, chatDbBytes: 1_000 },
  ])
  assert.ok(trend)
  assert.equal(trend.deltaBytes, -4_000)
  assert.equal(trend.bytesPerDay, -4_000)
})

test("out-of-order samples are sorted before summarising", () => {
  const trend = summariseTrend([
    { at: 2 * DAY, chatDbBytes: 5_000 },
    { at: 0, chatDbBytes: 1_000 },
  ])
  assert.ok(trend)
  assert.equal(trend.deltaBytes, 4_000)
  assert.equal(trend.first.at, 0)
})

test("malformed entries are dropped, and the rest still summarise", () => {
  const trend = summariseTrend([
    { at: 0, chatDbBytes: 1_000 },
    { at: "nope", chatDbBytes: 2_000 },
    { chatDbBytes: 3_000 },
    null,
    "garbage",
    { at: DAY, chatDbBytes: 2_000 },
  ] as unknown)
  assert.ok(trend)
  assert.equal(trend.sampleCount, 2)
  assert.equal(trend.deltaBytes, 1_000)
})

test("non-array input yields no trend rather than throwing", () => {
  assert.equal(summariseTrend(undefined), null)
  assert.equal(summariseTrend(null), null)
  assert.equal(summariseTrend({ samples: [] }), null)
})
```

- [ ] **Step 2: Register the test file, then run it to verify it fails**

In `package.json`, add `lib/trend.test.ts` to the `test` script immediately after `lib/manifest.test.ts`.

Run: `npx tsx --test lib/trend.test.ts`
Expected: FAIL with `Cannot find module './trend'`.

- [ ] **Step 3: Write the implementation**

Create `lib/trend.ts`:

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

/** Below these, a "rate" would be noise wearing a number's clothes. */
export const MIN_SAMPLES = 2
export const MIN_SPAN_MS = 3_600_000

const DAY_MS = 24 * 3_600_000

function isSample(value: unknown): value is Sample {
  const candidate = value as Sample | null
  return (
    !!candidate &&
    typeof candidate === "object" &&
    Number.isFinite(candidate.at) &&
    Number.isFinite(candidate.chatDbBytes)
  )
}

/**
 * Reduce a sample series to a growth rate, or null when the data does not
 * support one. Takes no clock: every value derives from the samples, so it is
 * deterministic.
 *
 * Deliberately reports no projection. Extrapolating a threshold-crossing date
 * from a short, noisy series manufactures a confident number the data has not
 * earned.
 */
export function summariseTrend(samples: unknown): Trend | null {
  if (!Array.isArray(samples)) {
    return null
  }

  const valid = samples.filter(isSample).sort((a, b) => a.at - b.at)
  if (valid.length < MIN_SAMPLES) {
    return null
  }

  const first = valid[0]
  const last = valid[valid.length - 1]
  const spanMs = last.at - first.at
  if (spanMs < MIN_SPAN_MS) {
    return null
  }

  const deltaBytes = last.chatDbBytes - first.chatDbBytes
  return {
    first,
    last,
    deltaBytes,
    spanMs,
    bytesPerDay: (deltaBytes / spanMs) * DAY_MS,
    sampleCount: valid.length,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test lib/trend.test.ts`
Expected: PASS, 8 tests.

Run: `npm test`
Expected: 140 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add lib/trend.ts lib/trend.test.ts package.json
git commit -m "Add trend summarisation for the health sample series"
```

---

### Task 4: Surface the trend in the panel

**Files:**
- Modify: `app/api/health/route.ts`
- Modify: `components/health-panel.tsx`
- Modify: `components/panels.test.tsx`

**Interfaces:**
- Consumes: `summariseTrend`, `Trend` (Task 3); `formatBytes` from `lib/health.ts`; the `health.samples` written by Tasks 1–2.
- Produces: `trend: Trend | null` on the `/api/health` response body; a trend line in the panel.

- [ ] **Step 1: Write the failing test**

In `components/panels.test.tsx`, append:

```tsx
test("HealthPanel renders no trend line before any measurement", () => {
  const html = renderToStaticMarkup(<HealthPanel />)
  assert.doesNotMatch(html, /per day/, "a trend must not appear before there is data")
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --import ./test/setup-dom.ts --test components/panels.test.tsx`
Expected: PASS immediately — the panel has no trend markup yet.

This one is a guard rather than a driver: it locks in "nothing before data", which is the behaviour most at risk of regressing once the trend line exists. Note it in the report as a regression guard rather than claiming a red-to-green cycle.

- [ ] **Step 3: Extend the route**

In `app/api/health/route.ts`, add these imports:

```ts
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { summariseTrend } from "@/lib/trend"
```

Add this helper above `GET`:

```ts
/** The plugin's sample store. Absent or malformed simply means no trend. */
async function readSamples(home: string): Promise<unknown> {
  try {
    const file = join(home, ".cursor", "cursor-manager", "state.json")
    const parsed = JSON.parse(await readFile(file, "utf8")) as { health?: { samples?: unknown } }
    return parsed?.health?.samples
  } catch {
    return null
  }
}
```

In `GET`, capture the home directory once and include the trend in the response. Replace the `homedir()` call and the final return so they read:

```ts
  const home = homedir()
  const paths = cursorPaths(process.platform, home, process.env.APPDATA || undefined)
```

```ts
  const report = gradeMeasurements(measurements, Date.now())
  return NextResponse.json({ ...report, trend: summariseTrend(await readSamples(home)) })
```

- [ ] **Step 4: Render it in the panel**

In `components/health-panel.tsx`, extend the health import to include `formatBytes` (already imported) and add:

```tsx
import type { Trend } from "@/lib/trend"
```

Change the report state type so it carries the trend:

```tsx
  const [report, setReport] = useState<(HealthReport & { trend?: Trend | null }) | null>(null)
```

Add this component above `HealthPanel`:

```tsx
function TrendLine({ trend }: { trend: Trend }) {
  const days = trend.spanMs / (24 * 3_600_000)
  const span = days >= 1 ? `${days.toFixed(days >= 10 ? 0 : 1)} days` : `${Math.round(trend.spanMs / 3_600_000)} hours`
  const direction = trend.deltaBytes < 0 ? "smaller" : "larger"
  return (
    <p className="text-xs text-muted-foreground">
      {formatBytes(Math.abs(trend.deltaBytes))} {direction} over {span} · ≈
      {formatBytes(Math.abs(trend.bytesPerDay))} per day · {trend.sampleCount} samples
    </p>
  )
}
```

Render it inside the `chat-db` finding block. In the `report.findings.map(...)` body, immediately after the `finding.guidance` paragraph, add:

```tsx
                {finding.id === "chat-db" && report.trend ? (
                  <TrendLine trend={report.trend} />
                ) : null}
```

- [ ] **Step 5: Run the tests, lint, and build**

Run: `npm test` → 141 pass, 0 fail.
Run: `npm run lint` → exit 0.
Run: `npm run build` → exit 0.

- [ ] **Step 6: Verify against a real series**

The throttle means a genuine two-sample series takes an hour to accumulate. To verify the rendering now, write a synthetic series into your state file, check the panel, then restore:

```bash
cp ~/.cursor/cursor-manager/state.json ~/.cursor/cursor-manager/state.json.bak
node -e "
const fs=require('fs'), os=require('os');
const f=os.homedir()+'/.cursor/cursor-manager/state.json';
const s=JSON.parse(fs.readFileSync(f,'utf8'));
const now=Date.now(), DAY=86400000;
s.health={samples:[{at:now-2*DAY,chatDbBytes:17800000000},{at:now-DAY,chatDbBytes:18300000000},{at:now,chatDbBytes:18870000000}]};
fs.writeFileSync(f, JSON.stringify(s,null,2)+'\n');
console.log('synthetic 3-sample series written');
"
```

```bash
npm run dev
curl -s http://localhost:43127/api/health | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('trend:',JSON.stringify(j.trend))})"
```

Expected: a trend with `sampleCount: 3`, `deltaBytes` about 1.07e9, `bytesPerDay` about 5.35e8.

Then open `http://localhost:43127`, click **Measure this install**, and **look at the panel**. The chat-history row must show a line like `1.0 GB larger over 2.0 days · ≈510.0 MB per day · 3 samples`. A panel showing the size but no trend line means the wiring is wrong.

Stop the dev server, then restore:

```bash
mv ~/.cursor/cursor-manager/state.json.bak ~/.cursor/cursor-manager/state.json
```

- [ ] **Step 7: Commit**

```bash
git add app/api/health/route.ts components/health-panel.tsx components/panels.test.tsx
git commit -m "Show the chat-database growth rate in the health panel"
```

---

## Self-Review

**Spec coverage.** Data contract → Task 1 (`recordHealthSample`, `loadState`). Retention rules → Task 1 tests, verified against the real file in Task 2 Step 4. Silent failure → Task 2 Steps 1 and 5. `summariseTrend` with both honesty guards → Task 3. Route and panel → Task 4. Non-goals are enforced by omission: no projection appears in any task, no directory walk enters the plugin, no backfill is written. The spec's "constraints" section (plugin must be installed) needs no code.

**Placeholder scan.** No TBD/TODO. Every code step carries real code; every run step names the command and the expected result.

**Type consistency.** `Sample`/`Trend` defined in Task 3 are used with identical field names in Task 4. `cursorDataPaths` returns `{ chatDb }` in Task 1 and is destructured as `{ chatDb }` in Task 2. `recordHealthSample(state, bytes, now)` matches its Task 2 call site. `SAMPLE_INTERVAL_MS` (Task 1) and `MIN_SPAN_MS` (Task 3) are both 3_600_000 but deliberately separate constants — one throttles writing, the other gates display; coupling them would mean a change to sampling frequency silently changed what the UI is willing to show.

**Test count arithmetic.** 123 baseline → 132 (Task 1, +9) → 132 (Task 2, +0 by design) → 140 (Task 3, +8) → 141 (Task 4, +1).

**Known weakness.** Task 4 Step 2 is a guard, not a red-to-green driver — the assertion passes before the feature exists. It is included because "no trend line before there is data" is the behaviour most likely to regress, and the plan says plainly that it is a guard rather than pretending otherwise.
