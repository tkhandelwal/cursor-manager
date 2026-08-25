# Directory Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a growth rate for every metric the health panel grades, plus one install-wide rate, by recording the directory walk `/api/health` already performs on every panel load.

**Architecture:** A new app-owned sample file (`~/.cursor/cursor-manager/directory-samples.json`) keeps the app out of the plugin's `state.json`, so no bug here can cost a conversation record. `lib/trend.ts`'s `Sample` generalizes from `{ at, chatDbBytes }` to `{ at, bytes }` so one `summariseTrend` serves all five metrics; a new `lib/directory-samples.ts` holds the pure record/project logic. The install-wide figure is a sum of per-metric rates with an explicit coverage count, because the two writers sample on different cadences and no true install total is ever simultaneously observed.

**Tech Stack:** Next.js 16 (App Router route handlers), React 19, TypeScript, `node:test` run through `tsx`, `renderToStaticMarkup` for component tests, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-25-directory-trends-design.md`

## Global Constraints

- **The plugin is not modified by this work.** No file under `plugin/` changes. The plugin keeps exclusive write ownership of `state.json`.
- **`lib/measure.ts` caps are not modified.** `MAX_ENTRIES = 50_000` and `MAX_MS = 5_000` stay as they are.
- **A metric whose `bytes` is `null` is omitted from a sample row** — never stored as `0`, never as `null`.
- **New test files must be registered in the `test` script in `package.json`** or they do not run.
- **Sampling must never break the panel.** Every filesystem write in the route is wrapped in try/catch and fails silently.
- **Retention:** at most one sample per hour, keep the newest 180.
- **Dev server binds `0.0.0.0:43127`**, not 3000.
- Run the full suite with `npm test`. Baseline before this plan: **151 passing**.

---

### Task 1: Generalize the trend sample shape

`summariseTrend` is hard-wired to a field named `chatDbBytes`. Four more metrics need the same function, so the field becomes `bytes` and the plugin's on-disk rows are normalised at the read boundary. The plugin's file format does not change — only how the app reads it.

**Files:**
- Modify: `lib/trend.ts`
- Modify: `lib/trend.test.ts`
- Modify: `components/panels.test.tsx` (Trend fixtures only)

**Interfaces:**
- Consumes: nothing.
- Produces: `Sample = { at: number; bytes: number }`; `fromChatDbSamples(raw: unknown): unknown`. `Trend` keeps every existing field (`first`, `last`, `deltaBytes`, `spanMs`, `bytesPerDay`, `sampleCount`) with `first`/`last` now typed as the new `Sample`.

- [ ] **Step 1: Rename the field in the implementation**

In `lib/trend.ts`, change the type and the two places that read the field:

```ts
export type Sample = { at: number; bytes: number }
```

In `isSample`, change `Number.isFinite(candidate.chatDbBytes)` to `Number.isFinite(candidate.bytes)`.

In `summariseTrend`, change `const deltaBytes = last.chatDbBytes - first.chatDbBytes` to:

```ts
const deltaBytes = last.bytes - first.bytes
```

- [ ] **Step 2: Rename the field in the existing tests**

In `lib/trend.test.ts`, replace every occurrence of `chatDbBytes` with `bytes` (13 occurrences, including the two assertions `trend.first.chatDbBytes` / `trend.last.chatDbBytes` and the test titled `a valid at paired with a malformed chatDbBytes is dropped` — rename that title to `a valid at paired with a malformed bytes is dropped`).

In `components/panels.test.tsx`, replace `chatDbBytes` with `bytes` in every `Trend` fixture (the `growthTrend()` helper and any inline fixture below it).

`components/health-panel.tsx` needs no change — `TrendLine` reads `deltaBytes`, `spanMs`, `bytesPerDay`, `sampleCount`, and `last.at`, none of which are renamed.

- [ ] **Step 3: Run the suite to confirm the rename is complete**

Run: `npm test`
Expected: PASS, 151 tests. This step is a refactor, not a red-to-green cycle — the count must be unchanged. A TypeScript error naming `chatDbBytes` means a fixture was missed.

- [ ] **Step 4: Write the failing test for the adapter**

Append to `lib/trend.test.ts`:

```ts
test("fromChatDbSamples maps the plugin's field onto the shared shape", () => {
  const trend = summariseTrend(
    fromChatDbSamples([
      { at: 0, chatDbBytes: 1_000 },
      { at: DAY, chatDbBytes: 3_000 },
    ]),
  )
  assert.ok(trend)
  assert.equal(trend.deltaBytes, 2_000)
  assert.equal(trend.bytesPerDay, 2_000)
})

test("fromChatDbSamples leaves malformed rows for the sample guard to drop", () => {
  const trend = summariseTrend(
    fromChatDbSamples([
      { at: 0, chatDbBytes: 1_000 },
      { at: HOUR, chatDbBytes: "not a number" },
      null,
      { at: DAY, chatDbBytes: 2_000 },
    ]),
  )
  assert.ok(trend)
  assert.equal(trend.sampleCount, 2, "only the two well-formed rows survive")
})

test("fromChatDbSamples passes a non-array through untouched", () => {
  assert.equal(summariseTrend(fromChatDbSamples(null)), null)
  assert.equal(summariseTrend(fromChatDbSamples({ nope: true })), null)
})
```

Add `fromChatDbSamples` to the import at the top of the file:

```ts
import { MIN_SPAN_MS, fromChatDbSamples, summariseTrend } from "./trend"
```

- [ ] **Step 5: Run the new tests to verify they fail**

Run: `npx tsx --test lib/trend.test.ts`
Expected: FAIL — `fromChatDbSamples is not a function` (or a TypeScript error that it is not exported). If it fails for any other reason, fix that first; the failure must be the missing function.

- [ ] **Step 6: Implement the adapter**

Add to `lib/trend.ts`:

```ts
/**
 * The plugin's series stores { at, chatDbBytes }; every series the app writes
 * itself stores { at, bytes }. Normalise at the read boundary so trend.ts
 * knows exactly one shape.
 *
 * Returns `unknown` on purpose: rows are not validated here, so a malformed
 * row reaches `isSample` and is dropped by the guard that already exists
 * rather than by a second, divergent copy of that logic.
 */
export function fromChatDbSamples(raw: unknown): unknown {
  if (!Array.isArray(raw)) {
    return raw
  }
  return raw.map((row) => {
    if (!row || typeof row !== "object") {
      return row
    }
    const source = row as { at?: unknown; chatDbBytes?: unknown }
    return { at: source.at, bytes: source.chatDbBytes }
  })
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 154 tests.

- [ ] **Step 8: Commit**

```bash
git add lib/trend.ts lib/trend.test.ts components/panels.test.tsx
git commit -m "Generalise the trend sample shape to serve every metric"
```

---

### Task 2: Record and project directory samples

The pure half of the feature: deciding what enters the series and pulling one metric's series back out. No clock, no filesystem, so all of it is unit-testable.

**Files:**
- Create: `lib/directory-samples.ts`
- Create: `lib/directory-samples.test.ts`
- Modify: `package.json` (register the test file)

**Interfaces:**
- Consumes: `Measurement` from `lib/health.ts` (`{ id, label, path, bytes: number | null, detail?: string }`); `Sample` from `lib/trend.ts` (Task 1).
- Produces: `DirectorySample = { at: number; bytes: Record<string, number> }`; `DirectoryStore = { samples: DirectorySample[] }`; `SAMPLE_INTERVAL_MS`; `MAX_SAMPLES`; `recordDirectorySample(store: unknown, measurements: Measurement[], now: number): DirectoryStore`; `seriesFor(store: unknown, id: string): Sample[]`.

- [ ] **Step 1: Write the failing tests**

Create `lib/directory-samples.test.ts`:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  MAX_SAMPLES,
  SAMPLE_INTERVAL_MS,
  recordDirectorySample,
  seriesFor,
} from "./directory-samples"
import type { Measurement } from "./health"

const HOUR = 3_600_000

function measurement(id: string, bytes: number | null): Measurement {
  return { id, label: id, path: `/tmp/${id}`, bytes }
}

const TWO = [measurement("cache", 100), measurement("blob-storage", 200)]

test("the first sample is appended to an empty store", () => {
  const store = recordDirectorySample(null, TWO, 1_000)
  assert.equal(store.samples.length, 1)
  assert.deepEqual(store.samples[0], { at: 1_000, bytes: { cache: 100, "blob-storage": 200 } })
})

test("a sample taken inside the interval is skipped", () => {
  const first = recordDirectorySample(null, TWO, 0)
  const second = recordDirectorySample(first, TWO, SAMPLE_INTERVAL_MS - 1)
  assert.equal(second.samples.length, 1, "the panel can be reloaded far more often than the hour")
})

test("a sample is recorded once the interval has passed", () => {
  const first = recordDirectorySample(null, TWO, 0)
  const second = recordDirectorySample(first, TWO, SAMPLE_INTERVAL_MS)
  assert.equal(second.samples.length, 2)
})

test("a backward clock jump does not freeze sampling", () => {
  const first = recordDirectorySample(null, TWO, 10 * HOUR)
  const second = recordDirectorySample(first, TWO, 0)
  assert.equal(second.samples.length, 2, "a clock moved backwards must not stall the series")
})

test("a metric that could not be measured is omitted, not stored as zero", () => {
  const store = recordDirectorySample(
    null,
    [measurement("cache", null), measurement("blob-storage", 200)],
    1_000,
  )
  assert.deepEqual(store.samples[0].bytes, { "blob-storage": 200 })
  assert.equal("cache" in store.samples[0].bytes, false, "a capped walk must not enter the series")
})

test("no row is written when every metric is unmeasurable", () => {
  const store = recordDirectorySample(null, [measurement("cache", null)], 1_000)
  assert.equal(store.samples.length, 0)
})

test("the series is capped at MAX_SAMPLES, keeping the newest", () => {
  let store = recordDirectorySample(null, TWO, 0)
  for (let i = 1; i <= MAX_SAMPLES + 5; i += 1) {
    store = recordDirectorySample(store, [measurement("cache", i)], i * SAMPLE_INTERVAL_MS)
  }
  assert.equal(store.samples.length, MAX_SAMPLES)
  assert.equal(store.samples[store.samples.length - 1].bytes.cache, MAX_SAMPLES + 5)
})

test("a malformed store is treated as empty rather than throwing", () => {
  assert.equal(recordDirectorySample({ samples: "nope" }, TWO, 0).samples.length, 1)
  assert.equal(recordDirectorySample("garbage", TWO, 0).samples.length, 1)
})

test("seriesFor pulls one metric out and skips the rows that lack it", () => {
  const store = {
    samples: [
      { at: 0, bytes: { cache: 100, "blob-storage": 1 } },
      { at: HOUR, bytes: { "blob-storage": 2 } },
      { at: 2 * HOUR, bytes: { cache: 300 } },
    ],
  }
  assert.deepEqual(seriesFor(store, "cache"), [
    { at: 0, bytes: 100 },
    { at: 2 * HOUR, bytes: 300 },
  ])
})

test("seriesFor returns an empty series for an unknown metric or malformed store", () => {
  assert.deepEqual(seriesFor({ samples: [{ at: 0, bytes: { cache: 1 } }] }, "nope"), [])
  assert.deepEqual(seriesFor(null, "cache"), [])
})
```

- [ ] **Step 2: Register the test file, then run it to verify it fails**

In `package.json`, add `lib/directory-samples.test.ts` to the `test` script immediately after `lib/trend.test.ts`.

Run: `npx tsx --test lib/directory-samples.test.ts`
Expected: FAIL with `Cannot find module './directory-samples'`. Any other failure must be fixed first.

- [ ] **Step 3: Write the implementation**

Create `lib/directory-samples.ts`:

```ts
import type { Measurement } from "./health"
import type { Sample } from "./trend"

export type DirectorySample = { at: number; bytes: Record<string, number> }
export type DirectoryStore = { samples: DirectorySample[] }

/**
 * Deliberately separate from the plugin's constants of the same name. Coupling
 * them would mean a change to one writer's frequency silently changed the
 * other's retention.
 */
export const SAMPLE_INTERVAL_MS = 3_600_000
export const MAX_SAMPLES = 180

function samplesOf(store: unknown): DirectorySample[] {
  const candidate = store as DirectoryStore | null
  return candidate &&
    typeof candidate === "object" &&
    Array.isArray(candidate.samples)
    ? candidate.samples
    : []
}

/**
 * Append a row of the metrics that were measurable, unless one was taken
 * within the interval.
 *
 * A metric whose walk was missing, unreadable, or capped out arrives as
 * `bytes: null` and is left out of the row entirely. Storing it as 0 would
 * make the next complete walk look like sudden growth; storing the capped
 * total would make it look like a shrink. A sparse row is the honest record of
 * "we do not know".
 */
export function recordDirectorySample(
  store: unknown,
  measurements: Measurement[],
  now: number,
): DirectoryStore {
  const samples = samplesOf(store)
  const newest = samples[samples.length - 1]

  // Absolute difference, matching the plugin: a clock that jumped backwards
  // would otherwise freeze the series until real time caught up.
  if (newest && Math.abs(now - newest.at) < SAMPLE_INTERVAL_MS) {
    return { samples }
  }

  const bytes: Record<string, number> = {}
  for (const measurement of measurements) {
    if (measurement.bytes !== null && Number.isFinite(measurement.bytes)) {
      bytes[measurement.id] = measurement.bytes
    }
  }
  if (Object.keys(bytes).length === 0) {
    return { samples }
  }

  return { samples: [...samples, { at: now, bytes }].slice(-MAX_SAMPLES) }
}

/** One metric's series, skipping the rows where that metric was unknown. */
export function seriesFor(store: unknown, id: string): Sample[] {
  return samplesOf(store)
    .filter(
      (sample) =>
        sample &&
        typeof sample === "object" &&
        sample.bytes &&
        typeof sample.bytes === "object" &&
        Number.isFinite(sample.bytes[id]),
    )
    .map((sample) => ({ at: sample.at, bytes: sample.bytes[id] }))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 164 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/directory-samples.ts lib/directory-samples.test.ts package.json
git commit -m "Add directory sample recording and per-metric projection"
```

---

### Task 3: Sum the per-metric rates

The install-wide figure. It sums rates rather than differencing totals, because the plugin and the app sample on different cadences and no instant exists at which a true install total was simultaneously observed.

**Files:**
- Modify: `lib/trend.ts`
- Modify: `lib/trend.test.ts`

**Interfaces:**
- Consumes: `Trend` (existing).
- Produces: `TotalTrend = { bytesPerDay: number; covered: number; total: number }`; `summariseTotal(trends: (Trend | null)[]): TotalTrend | null`.

**Note on the signature.** The spec wrote `summariseTotal(trends: Trend[])`. It takes `(Trend | null)[]` instead so that `total` can be the number of metrics the panel grades rather than the number that happened to qualify — the caller passes all five, nulls included, and the function reports the coverage.

- [ ] **Step 1: Write the failing test**

Append to `lib/trend.test.ts`:

```ts
function rate(bytesPerDay: number): Trend {
  return {
    first: { at: 0, bytes: 0 },
    last: { at: DAY, bytes: bytesPerDay },
    deltaBytes: bytesPerDay,
    spanMs: DAY,
    bytesPerDay,
    sampleCount: 2,
  }
}

test("summariseTotal sums the rates of the metrics that have one", () => {
  const total = summariseTotal([rate(100), rate(250), null, null, rate(50)])
  assert.ok(total)
  assert.equal(total.bytesPerDay, 400)
})

test("summariseTotal reports coverage against every metric it was given", () => {
  const total = summariseTotal([rate(100), null, null, null, null])
  assert.ok(total)
  assert.equal(total.covered, 1)
  assert.equal(total.total, 5, "coverage is what stops a dropped metric reading as slower growth")
})

test("summariseTotal is null when no metric qualifies", () => {
  assert.equal(summariseTotal([null, null, null]), null)
  assert.equal(summariseTotal([]), null)
})

test("summariseTotal lets a shrinking metric offset a growing one", () => {
  const total = summariseTotal([rate(500), rate(-200)])
  assert.ok(total)
  assert.equal(total.bytesPerDay, 300)
  assert.equal(total.covered, 2)
})
```

Extend the import at the top of the file:

```ts
import { MIN_SPAN_MS, fromChatDbSamples, summariseTotal, summariseTrend, type Trend } from "./trend"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test lib/trend.test.ts`
Expected: FAIL — `summariseTotal is not a function`.

- [ ] **Step 3: Implement it**

Add to `lib/trend.ts`:

```ts
export type TotalTrend = {
  bytesPerDay: number
  /** Metrics contributing a rate. */
  covered: number
  /** Metrics the panel grades, whether or not they have a rate. */
  total: number
}

/**
 * Sum the per-metric rates into one install-wide rate.
 *
 * Deliberately not a summed delta. The plugin writes the chat-db series
 * hourly, the app writes the directory series on panel load, so their
 * timestamps never align and there is no instant at which a true install total
 * existed to difference against another. Rates are computed over each metric's
 * own span, and rates add.
 *
 * `covered` is load-bearing: without it, a metric dropping out of the sum
 * reads as the install growing more slowly.
 */
export function summariseTotal(trends: (Trend | null)[]): TotalTrend | null {
  const present = trends.filter((trend): trend is Trend => trend !== null)
  if (present.length === 0) {
    return null
  }
  return {
    bytesPerDay: present.reduce((sum, trend) => sum + trend.bytesPerDay, 0),
    covered: present.length,
    total: trends.length,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 168 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/trend.ts lib/trend.test.ts
git commit -m "Sum per-metric rates into an install-wide trend"
```

---

### Task 4: Record and serve the samples from the route

The only task that touches the filesystem. It has **no unit test**, matching the repo convention that route handlers are not unit-tested — it is verified by running the app and inspecting the file it writes, including an explicit check that a failed write leaves the panel working.

**Files:**
- Modify: `app/api/health/route.ts`

**Interfaces:**
- Consumes: `recordDirectorySample`, `seriesFor` (Task 2); `summariseTrend`, `summariseTotal`, `fromChatDbSamples` (Tasks 1 and 3).
- Produces: the `GET` response gains `directoryTrends: Record<string, Trend | null>` and `totalTrend: TotalTrend | null` alongside the existing `trend`.

- [ ] **Step 1: Extend the imports**

In `app/api/health/route.ts`, replace the two node imports and the trend import:

```ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
```

```ts
import { recordDirectorySample, seriesFor } from "@/lib/directory-samples"
import { fromChatDbSamples, summariseTotal, summariseTrend, type Trend } from "@/lib/trend"
```

- [ ] **Step 2: Add the store read and write helpers**

Add below the existing `readSamples` function:

```ts
function directoryFile(home: string) {
  return join(home, ".cursor", "cursor-manager", "directory-samples.json")
}

/** The app's own sample store. Absent or malformed simply means no trend. */
async function readDirectoryStore(home: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(directoryFile(home), "utf8"))
  } catch {
    return null
  }
}

/**
 * Persist the store, or do nothing at all.
 *
 * Writes to a temp file and renames, so a concurrent panel load can never
 * observe a torn file; last-writer-wins on content is fine, because the worst
 * case is one lost sample. Every failure is swallowed on purpose: a trend
 * feature must never turn a working panel into a 500.
 *
 * The directory is created when missing so directory trends work without the
 * plugin installed — unlike the chat-db series, they do not depend on it.
 */
async function writeDirectoryStore(home: string, store: unknown): Promise<void> {
  try {
    const file = directoryFile(home)
    const temp = `${file}.${process.pid}.tmp`
    await mkdir(dirname(file), { recursive: true })
    await writeFile(temp, JSON.stringify(store), "utf8")
    await rename(temp, file)
  } catch {
    // Intentionally ignored.
  }
}
```

- [ ] **Step 3: Record and summarise in the handler**

In `GET`, replace the final two lines (`const report = ...` and the `return NextResponse.json(...)`) with:

```ts
  const report = gradeMeasurements(measurements, Date.now())

  // chat-db is excluded here, not inside recordDirectorySample: the plugin owns
  // that series, and a second copy written on a different cadence would be a
  // second source of truth for the same number.
  const directoryMeasurements = measurements.filter((measurement) => measurement.id !== "chat-db")
  const store = recordDirectorySample(
    await readDirectoryStore(home),
    directoryMeasurements,
    Date.now(),
  )
  await writeDirectoryStore(home, store)

  const trend = summariseTrend(fromChatDbSamples(await readSamples(home)))
  const directoryTrends: Record<string, Trend | null> = {}
  for (const measurement of directoryMeasurements) {
    directoryTrends[measurement.id] = summariseTrend(seriesFor(store, measurement.id))
  }

  const totalTrend = summariseTotal([trend, ...Object.values(directoryTrends)])
  return NextResponse.json({ ...report, trend, directoryTrends, totalTrend })
```

- [ ] **Step 4: Clear any running dev server before starting one**

Per the working agreement, never start a second copy on top of a first — a leftover holds the port and the build output, and the resulting failure reads as a code error.

Run: `netstat -ano | findstr :43127`
If a PID is listed, stop that process before continuing. If nothing is listed, continue.

- [ ] **Step 5: Verify the file is written**

Run: `npm run dev`, then in a second shell:

```bash
curl -s http://localhost:43127/api/health | head -c 400
cat ~/.cursor/cursor-manager/directory-samples.json
```

Expected: the JSON response contains `directoryTrends` and `totalTrend` (both may be `null`/empty on a first run — one sample is not a trend). `directory-samples.json` exists and holds exactly one row whose `bytes` object omits any metric the walk could not complete.

- [ ] **Step 6: Verify the hourly throttle against the real file**

Run: `curl -s http://localhost:43127/api/health > /dev/null` twice more, then `cat ~/.cursor/cursor-manager/directory-samples.json`

Expected: still exactly one row. Panel loads happen far more often than the hour, and the file must not grow with them.

- [ ] **Step 7: Verify a failed write does not break the panel**

Make the store path unwritable and confirm the endpoint still answers:

```bash
mv ~/.cursor/cursor-manager/directory-samples.json ~/.cursor/cursor-manager/directory-samples.json.bak
mkdir ~/.cursor/cursor-manager/directory-samples.json
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:43127/api/health
rmdir ~/.cursor/cursor-manager/directory-samples.json
mv ~/.cursor/cursor-manager/directory-samples.json.bak ~/.cursor/cursor-manager/directory-samples.json
```

Expected: `200`. A directory where the file belongs makes every write fail; the panel must not notice. Stop the dev server when done.

- [ ] **Step 8: Run the suite and the build**

Run: `npm test`
Expected: PASS, 168 tests — this task adds none.

Run: `npm run build`
Expected: success. The route is typed, so a mismatch between `directoryTrends` and its consumers surfaces here.

- [ ] **Step 9: Commit**

```bash
git add app/api/health/route.ts
git commit -m "Record the directory walk the health route already performs"
```

---

### Task 5: Show the trends in the panel

**Files:**
- Modify: `components/health-panel.tsx`
- Modify: `components/panels.test.tsx`

**Interfaces:**
- Consumes: `Trend`, `TotalTrend` (Tasks 1 and 3); the route's `directoryTrends` and `totalTrend` (Task 4); `formatBytes` from `lib/health.ts`.
- Produces: exported `TotalTrendLine({ total }: { total: TotalTrend })`.

- [ ] **Step 1: Write the failing test**

Append to `components/panels.test.tsx`:

```ts
test("TotalTrendLine states the install-wide rate and its coverage", () => {
  const html = renderToStaticMarkup(
    <TotalTrendLine total={{ bytesPerDay: 511.4, covered: 4, total: 5 }} />,
  )
  assert.match(html, /≈511 B/, "the fractional rate must be rounded before formatting")
  assert.match(html, /larger per day/)
  assert.match(html, /4 of 5 metrics/, "coverage must be shown, not implied")
})

test("TotalTrendLine reads a net shrink as smaller, not as growth", () => {
  const html = renderToStaticMarkup(
    <TotalTrendLine total={{ bytesPerDay: -2_000, covered: 5, total: 5 }} />,
  )
  assert.match(html, /smaller per day/)
  assert.doesNotMatch(html, /larger/)
})

test("TotalTrendLine does not claim a total size it cannot compute honestly", () => {
  const html = renderToStaticMarkup(
    <TotalTrendLine total={{ bytesPerDay: 1_000, covered: 2, total: 5 }} />,
  )
  assert.doesNotMatch(html, /Total:/, "totalBytes counts an unmeasured metric as zero")
})
```

Extend the imports at the top of the file:

```ts
import { HealthPanel, TotalTrendLine, TrendLine } from "@/components/health-panel"
import type { Trend, TotalTrend } from "@/lib/trend"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --import ./test/setup-dom.ts --test components/panels.test.tsx`
Expected: FAIL — `TotalTrendLine is not exported` (or is not a function).

- [ ] **Step 3: Add the component**

In `components/health-panel.tsx`, add below `TrendLine`:

```tsx
export function TotalTrendLine({ total }: { total: TotalTrend }) {
  const direction = total.bytesPerDay < 0 ? "smaller" : "larger"
  // No total size here on purpose: totalBytes sums `finding.bytes ?? 0`, so an
  // unmeasured metric would quietly shrink the headline instead of making it
  // unknown — the same shape as the 0 B and phantom-savings failures already
  // removed from this codebase.
  return (
    <p className="text-xs text-muted-foreground">
      Whole install: ≈{formatBytes(Math.round(Math.abs(total.bytesPerDay)))} {direction} per day ·
      across {total.covered} of {total.total} metrics
    </p>
  )
}
```

Extend the trend import at the top of the file:

```ts
import type { Trend, TotalTrend } from "@/lib/trend"
```

- [ ] **Step 4: Widen the report state and render both lines**

Change the `report` state type and the `response.json()` cast — both currently read `HealthReport & { trend?: Trend | null }` — to:

```ts
type HealthResponse = HealthReport & {
  trend?: Trend | null
  directoryTrends?: Record<string, Trend | null>
  totalTrend?: TotalTrend | null
}
```

Use `HealthResponse` in `useState<HealthResponse | null>(null)` and in the `as` cast where the response is parsed.

Inside the `report?.installFound` block, render the total immediately above `{report.findings.map(...)}`:

```tsx
{report.totalTrend ? <TotalTrendLine total={report.totalTrend} /> : null}
```

Then replace the chat-db-only trend line at the bottom of each finding:

```tsx
{finding.bytes !== null && (finding.id === "chat-db" ? report.trend : report.directoryTrends?.[finding.id]) ? (
  <TrendLine
    trend={(finding.id === "chat-db" ? report.trend : report.directoryTrends?.[finding.id]) as Trend}
  />
) : null}
```

- [ ] **Step 5: Run the tests, lint, and build**

Run: `npm test`
Expected: PASS, 172 tests. The existing `HealthPanel renders no trend line before any measurement` guard must still pass — with no data, neither line may appear.

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Verify against a real series**

The hourly throttle means a real trend takes an hour to appear. To see both lines without waiting, hand-write a second row an hour older into the store, then load the panel:

```bash
node -e "const f=require('os').homedir()+'/.cursor/cursor-manager/directory-samples.json';const s=JSON.parse(require('fs').readFileSync(f,'utf8'));const n=s.samples[s.samples.length-1];const older={at:n.at-7200000,bytes:Object.fromEntries(Object.entries(n.bytes).map(([k,v])=>[k,Math.round(v*0.9)]))};s.samples.unshift(older);require('fs').writeFileSync(f,JSON.stringify(s))"
```

Clear any dev server on 43127 first (`netstat -ano | findstr :43127`), then run `npm run dev` and open `http://localhost:43127`.

Expected: a "Whole install" line above the findings, and a per-row trend line under each directory that had both samples. A directory that capped out on one of the loads shows no line — confirm that rather than treating it as a bug.

Restore the file afterwards by deleting the injected row, or delete the file entirely to start a clean series:

```bash
rm ~/.cursor/cursor-manager/directory-samples.json
```

Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add components/health-panel.tsx components/panels.test.tsx
git commit -m "Show a trend for every metric, and one for the whole install"
```

---

## Self-Review

**Spec coverage.** Data contract → Task 2 (`recordDirectorySample`, null omission, retention). Separate-file ownership → Task 4 (`directoryFile`, and the plugin untouched throughout). Sample-shape generalization → Task 1. Summed rate with coverage → Task 3. Route wiring and silent-failure rule → Task 4 Steps 2, 3, 7. Panel rendering, including the deliberate absence of a total size → Task 5. The spec's "sampling bias, named" section needs no code; it is a constraint on what the UI may claim, enforced by Task 5's coverage assertion and by `TrendLine` already dating its output.

**Placeholder scan.** No TBD/TODO. Every code step carries the actual code; every run step names the command and the expected result.

**Type consistency.** `Sample` is `{ at, bytes }` from Task 1 onward and is used with that shape in Task 2's `seriesFor` return and Task 3's `rate()` fixture. `DirectorySample.bytes` is `Record<string, number>` in Task 2 and indexed as such in Task 4. `TotalTrend` has the same three fields in Task 3, Task 4's response, and Task 5's component. `summariseTotal` takes `(Trend | null)[]` in Task 3 and is called with `[trend, ...Object.values(directoryTrends)]` in Task 4, which is exactly that type. `SAMPLE_INTERVAL_MS` and `MAX_SAMPLES` exist in both `lib/directory-samples.ts` and `plugin/scripts/lib.mjs` with equal values but no shared import, per the spec.

**Test count arithmetic.** 151 baseline → 154 (Task 1, +3) → 164 (Task 2, +10) → 168 (Task 3, +4) → 168 (Task 4, +0 by design) → 172 (Task 5, +4).

**Known weakness.** Task 4 has no automated test, so the throttle, the temp-file rename, and the silent-failure guarantee rest on the manual steps. Steps 6 and 7 exist because those two behaviours — not growing the file on every reload, and not 500-ing when the disk refuses — are the ones whose regression would be least visible. A route-handler test harness would be better, and the repo does not have one; adding it is a larger change than this feature warrants.
