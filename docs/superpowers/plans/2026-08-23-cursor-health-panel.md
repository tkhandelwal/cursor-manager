# Cursor Health Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a panel that measures the user's real Cursor install, flags what is bloated, and shows before/after deltas so the existing cleanup checklist becomes verifiable.

**Architecture:** Three pure `lib/` modules (grading, path resolution, filesystem sizing) with full unit tests, a thin Next route handler that glues them together and is the only piece performing I/O, and a client panel that fetches it. The pure/impure split means all judgment lives in testable code.

**Tech Stack:** Next.js 16 (App Router, route handlers), React 19, TypeScript, `node:test` run through `tsx`, `@testing-library/react` + `happy-dom` for component tests, Tailwind v4 + base-ui components.

**Spec:** `docs/superpowers/specs/2026-08-23-cursor-health-panel-design.md`

## Global Constraints

- **Never modify or delete user data.** The `guidance` field is display text only. No task adds a button that deletes anything, including caches described as "safe to clear".
- **A wrong path must never look like a healthy install.** Missing/unreadable path → `bytes: null` → severity `unknown`. Never `0 B`, never `ok`.
- **Thresholds are heuristics from one real install.** The UI must label them as rules of thumb, not Cursor guidance.
- **Traversal caps: 50,000 entries or 5,000 ms per metric**, whichever first. On hitting either, return `null` (`unknown`) — never a partial total presented as complete.
- **Every new test file must be added to the `test` script in `package.json`** or it silently never runs (AGENTS.md).
- **The app is local-only.** The route handler reads the machine it runs on.
- Verified platform path: Windows only. macOS/Linux are conventional assumptions.

**Deviation from the spec, deliberate:** the spec sketched `cursorPaths` inside `app/api/health/route.ts`. This plan puts it in `lib/cursor-paths.ts` and the filesystem walk in `lib/measure.ts`. Importing from a route handler into `node:test` pulls in Next's module resolution; `lib/` modules import cleanly. This matches AGENTS.md ("pure state/logic lives in `lib/`") and preserves the spec's intent — path logic testable without a filesystem.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/health.ts` | Thresholds table; grade `Measurement[]` → `HealthReport`. No I/O. |
| `lib/health.test.ts` | Grading boundaries, `unknown` handling, `formatBytes`. |
| `lib/cursor-paths.ts` | Resolve Cursor data paths per platform. Pure string logic. |
| `lib/cursor-paths.test.ts` | One case per platform. |
| `lib/measure.ts` | File/dir sizing with entry+time caps. Only module touching `fs`. |
| `lib/measure.test.ts` | Real temp-dir fixtures. |
| `app/api/health/route.ts` | Glue: paths → measure → grade → JSON. |
| `lib/storage.ts` | Add `loadHealthSnapshot` / `saveHealthSnapshot`. |
| `components/health-panel.tsx` | Fetch, render findings, Re-measure, delta. |
| `components/session-app.tsx` | Render `<HealthPanel />`. |
| `components/panels.test.tsx` | Static render + SessionApp wiring assertion. |
| `package.json` | Register the three new test files. |

---

### Task 1: Grading logic (`lib/health.ts`)

**Files:**
- Create: `lib/health.ts`
- Create: `lib/health.test.ts`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: types `Measurement`, `Severity`, `Finding`, `HealthReport`, `Threshold`; constant `THRESHOLDS: Threshold[]`; functions `gradeMeasurements(measurements: Measurement[], at: number): HealthReport`, `totalBytes(report: HealthReport): number`, `formatBytes(bytes: number): string`.

- [x] **Step 1: Write the failing test**

Create `lib/health.test.ts`:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  THRESHOLDS,
  formatBytes,
  gradeMeasurements,
  totalBytes,
  type Measurement,
} from "./health"

const GB = 1024 ** 3

function measurement(id: string, bytes: number | null): Measurement {
  return { id, label: id, path: `/fake/${id}`, bytes }
}

test("every threshold has a positive warn below its critical", () => {
  assert.ok(THRESHOLDS.length > 0)
  const ids = new Set<string>()
  for (const t of THRESHOLDS) {
    assert.ok(!ids.has(t.id), `duplicate threshold id ${t.id}`)
    ids.add(t.id)
    assert.ok(t.warnBytes > 0, `${t.id} warn must be positive`)
    assert.ok(t.criticalBytes > t.warnBytes, `${t.id} critical must exceed warn`)
    assert.ok(t.guidance.length > 0, `${t.id} needs guidance`)
  }
})

test("grades ok below warn, warn at the boundary, critical at the boundary", () => {
  const t = THRESHOLDS.find((entry) => entry.id === "chat-db")
  assert.ok(t)

  const report = gradeMeasurements(
    [
      measurement("chat-db", t.warnBytes - 1),
      measurement("workspace-storage", 0),
      measurement("cached-data", 0),
    ],
    1_000,
  )
  assert.equal(report.findings[0].severity, "ok")

  assert.equal(
    gradeMeasurements([measurement("chat-db", t.warnBytes)], 1_000).findings[0].severity,
    "warn",
  )
  assert.equal(
    gradeMeasurements([measurement("chat-db", t.criticalBytes)], 1_000).findings[0].severity,
    "critical",
  )
})

test("a null measurement is unknown, never ok", () => {
  const report = gradeMeasurements([measurement("chat-db", null)], 1_000)
  assert.equal(report.findings[0].severity, "unknown")
  assert.equal(report.findings[0].guidance, null)
})

test("guidance appears only when the metric is over a threshold", () => {
  const t = THRESHOLDS.find((entry) => entry.id === "chat-db")
  assert.ok(t)
  assert.equal(gradeMeasurements([measurement("chat-db", 0)], 1).findings[0].guidance, null)
  assert.equal(
    gradeMeasurements([measurement("chat-db", t.criticalBytes)], 1).findings[0].guidance,
    t.guidance,
  )
})

test("installFound is false when nothing could be measured", () => {
  const none = gradeMeasurements(
    [measurement("chat-db", null), measurement("cache", null)],
    1_000,
  )
  assert.equal(none.installFound, false)

  const some = gradeMeasurements(
    [measurement("chat-db", null), measurement("cache", 10)],
    1_000,
  )
  assert.equal(some.installFound, true)
})

test("an unrecognised id grades unknown rather than throwing", () => {
  const report = gradeMeasurements([measurement("not-a-metric", 5 * GB)], 1_000)
  assert.equal(report.findings[0].severity, "unknown")
})

test("totalBytes sums only measurable entries", () => {
  const report = gradeMeasurements(
    [measurement("chat-db", 100), measurement("cache", null), measurement("cached-data", 50)],
    1_000,
  )
  assert.equal(totalBytes(report), 150)
})

test("measuredAt is carried through", () => {
  assert.equal(gradeMeasurements([], 4_242).measuredAt, 4_242)
})

test("formatBytes scales and keeps one decimal above bytes", () => {
  assert.equal(formatBytes(0), "0 B")
  assert.equal(formatBytes(1023), "1023 B")
  assert.equal(formatBytes(1024), "1.0 KB")
  assert.equal(formatBytes(1024 ** 2), "1.0 MB")
  assert.equal(formatBytes(1024 ** 3), "1.0 GB")
  assert.equal(formatBytes(Math.round(17.4 * 1024 ** 3)), "17.4 GB")
})

test("formatBytes renders a dash for values it cannot show", () => {
  assert.equal(formatBytes(-1), "—")
  assert.equal(formatBytes(Number.NaN), "—")
})
```

- [x] **Step 2: Register the test file, then run it to verify it fails**

In `package.json`, add `lib/health.test.ts` to the `test` script immediately after `lib/launch-flags.test.ts`.

Run: `npx tsx --test lib/health.test.ts`
Expected: FAIL with `Cannot find module './health'`. If it fails for any other reason, fix that first — the failure must be the missing module.

- [x] **Step 3: Write minimal implementation**

Create `lib/health.ts`:

```ts
export type Measurement = {
  id: string
  label: string
  path: string
  bytes: number | null // null = not found, unreadable, or capped out
  detail?: string // optional per-metric note, e.g. "42 directories"
}

export type Severity = "ok" | "warn" | "critical" | "unknown"

export type Finding = Measurement & {
  severity: Severity
  guidance: string | null // display text only; never triggers an action
}

export type HealthReport = {
  findings: Finding[]
  installFound: boolean
  measuredAt: number
}

export type Threshold = {
  id: string
  label: string
  warnBytes: number
  criticalBytes: number
  guidance: string
}

const MB = 1024 ** 2
const GB = 1024 ** 3

/**
 * Rules of thumb, NOT Cursor guidance. Derived from a single real install
 * (17.8 GB state.vscdb, 2026-08-23). Revise here as more installs are seen,
 * and keep the UI honest that these are heuristics.
 */
export const THRESHOLDS: Threshold[] = [
  {
    id: "chat-db",
    label: "Chat history database",
    warnBytes: 1 * GB,
    criticalBytes: 5 * GB,
    guidance: "Palette → Developer: Delete Old Chats, then Developer: GC Agent KV Blobs",
  },
  {
    id: "workspace-storage",
    label: "Workspace storage",
    warnBytes: 500 * MB,
    criticalBytes: 2 * GB,
    guidance: "Remove stale workspace folders for repos you no longer have",
  },
  {
    id: "cached-data",
    label: "Cached data",
    warnBytes: 1 * GB,
    criticalBytes: 3 * GB,
    guidance: "Safe to clear while Cursor is closed; it regenerates",
  },
  {
    id: "cache",
    label: "Cache",
    warnBytes: 500 * MB,
    criticalBytes: 2 * GB,
    guidance: "Safe to clear while Cursor is closed; it regenerates",
  },
  {
    id: "blob-storage",
    label: "Blob storage",
    warnBytes: 500 * MB,
    criticalBytes: 2 * GB,
    guidance: "Safe to clear while Cursor is closed; it regenerates",
  },
]

export function gradeMeasurements(measurements: Measurement[], at: number): HealthReport {
  const findings: Finding[] = measurements.map((measurement) => {
    const threshold = THRESHOLDS.find((entry) => entry.id === measurement.id)
    if (measurement.bytes === null || !threshold) {
      return { ...measurement, severity: "unknown", guidance: null }
    }
    if (measurement.bytes >= threshold.criticalBytes) {
      return { ...measurement, severity: "critical", guidance: threshold.guidance }
    }
    if (measurement.bytes >= threshold.warnBytes) {
      return { ...measurement, severity: "warn", guidance: threshold.guidance }
    }
    return { ...measurement, severity: "ok", guidance: null }
  })

  return {
    findings,
    installFound: findings.some((finding) => finding.bytes !== null),
    measuredAt: at,
  }
}

export function totalBytes(report: HealthReport): number {
  return report.findings.reduce((sum, finding) => sum + (finding.bytes ?? 0), 0)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—"
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(1)} ${units[index]}`
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/health.test.ts`
Expected: PASS, 10 tests.

Then run the whole suite to confirm nothing regressed: `npm test`
Expected: 79 existing + 10 new = 89 pass, 0 fail.

- [x] **Step 5: Commit**

```bash
git add lib/health.ts lib/health.test.ts package.json
git commit -m "Add health grading logic with heuristic thresholds"
```

---

### Task 2: Platform path resolution (`lib/cursor-paths.ts`)

**Files:**
- Create: `lib/cursor-paths.ts`
- Create: `lib/cursor-paths.test.ts`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: type `CursorPaths = { chatDb: string; workspaceStorage: string; cachedData: string; cache: string; blobStorage: string }`; function `cursorPaths(platform: NodeJS.Platform, home: string, appData?: string): CursorPaths`.

Note: the implementation uses `path.win32` / `path.posix` explicitly rather than `path.join`, so that macOS and Linux paths can be asserted from a Windows test host and vice versa. Without this the tests only pass on one OS.

- [x] **Step 1: Write the failing test**

Create `lib/cursor-paths.test.ts`:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"

import { cursorPaths } from "./cursor-paths"

test("windows uses APPDATA when provided", () => {
  const paths = cursorPaths("win32", "C:\\Users\\me", "C:\\Users\\me\\AppData\\Roaming")
  assert.equal(paths.chatDb, "C:\\Users\\me\\AppData\\Roaming\\Cursor\\User\\globalStorage\\state.vscdb")
  assert.equal(paths.workspaceStorage, "C:\\Users\\me\\AppData\\Roaming\\Cursor\\User\\workspaceStorage")
  assert.equal(paths.cachedData, "C:\\Users\\me\\AppData\\Roaming\\Cursor\\CachedData")
  assert.equal(paths.cache, "C:\\Users\\me\\AppData\\Roaming\\Cursor\\Cache")
  assert.equal(paths.blobStorage, "C:\\Users\\me\\AppData\\Roaming\\Cursor\\blob_storage")
})

test("windows falls back to the conventional AppData location", () => {
  const paths = cursorPaths("win32", "C:\\Users\\me")
  assert.equal(paths.cache, "C:\\Users\\me\\AppData\\Roaming\\Cursor\\Cache")
})

test("macos uses Application Support", () => {
  const paths = cursorPaths("darwin", "/Users/me")
  assert.equal(paths.chatDb, "/Users/me/Library/Application Support/Cursor/User/globalStorage/state.vscdb")
  assert.equal(paths.cache, "/Users/me/Library/Application Support/Cursor/Cache")
})

test("linux uses .config", () => {
  const paths = cursorPaths("linux", "/home/me")
  assert.equal(paths.chatDb, "/home/me/.config/Cursor/User/globalStorage/state.vscdb")
  assert.equal(paths.cache, "/home/me/.config/Cursor/Cache")
})

test("an unknown platform is treated as linux rather than throwing", () => {
  const paths = cursorPaths("freebsd", "/home/me")
  assert.equal(paths.cache, "/home/me/.config/Cursor/Cache")
})

test("every path sits under the same root", () => {
  const paths = cursorPaths("linux", "/home/me")
  for (const value of Object.values(paths)) {
    assert.ok(value.startsWith("/home/me/.config/Cursor/"), `${value} escaped the root`)
  }
})
```

- [x] **Step 2: Register the test file, then run it to verify it fails**

In `package.json`, add `lib/cursor-paths.test.ts` to the `test` script after `lib/health.test.ts`.

Run: `npx tsx --test lib/cursor-paths.test.ts`
Expected: FAIL with `Cannot find module './cursor-paths'`.

- [x] **Step 3: Write minimal implementation**

Create `lib/cursor-paths.ts`:

```ts
import path from "node:path"

export type CursorPaths = {
  chatDb: string
  workspaceStorage: string
  cachedData: string
  cache: string
  blobStorage: string
}

/**
 * Where Cursor keeps its data, per platform.
 *
 * Windows is verified (measured 2026-08-23). macOS and Linux are the
 * conventional Electron locations and are ASSUMPTIONS — if they are wrong the
 * caller must surface "not found", never a healthy-looking zero.
 */
export function cursorPaths(
  platform: NodeJS.Platform,
  home: string,
  appData?: string,
): CursorPaths {
  // Explicit win32/posix flavours so paths for one OS can be built (and
  // asserted) from a host running another.
  const p = platform === "win32" ? path.win32 : path.posix

  let root: string
  if (platform === "win32") {
    root = p.join(appData ?? p.join(home, "AppData", "Roaming"), "Cursor")
  } else if (platform === "darwin") {
    root = p.join(home, "Library", "Application Support", "Cursor")
  } else {
    root = p.join(home, ".config", "Cursor")
  }

  return {
    chatDb: p.join(root, "User", "globalStorage", "state.vscdb"),
    workspaceStorage: p.join(root, "User", "workspaceStorage"),
    cachedData: p.join(root, "CachedData"),
    cache: p.join(root, "Cache"),
    blobStorage: p.join(root, "blob_storage"),
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/cursor-paths.test.ts`
Expected: PASS, 6 tests.

Run: `npm test`
Expected: 95 pass, 0 fail.

- [x] **Step 5: Commit**

```bash
git add lib/cursor-paths.ts lib/cursor-paths.test.ts package.json
git commit -m "Add per-platform Cursor path resolution"
```

---

### Task 3: Filesystem sizing with caps (`lib/measure.ts`)

**Files:**
- Create: `lib/measure.ts`
- Create: `lib/measure.test.ts`
- Modify: `package.json` (the `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: constants `MAX_ENTRIES = 50_000`, `MAX_MS = 5_000`; functions `measurePath(target: string, options?: { maxEntries?: number; maxMs?: number; now?: () => number }): Promise<number | null>` and `countDirectories(target: string): Promise<number | null>`.

The options parameter exists so tests can drive the caps with small numbers instead of building a 50,000-file fixture.

- [x] **Step 1: Write the failing test**

Create `lib/measure.test.ts`:

```ts
import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"

import { countDirectories, measurePath } from "./measure"

const roots: string[] = []

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cursor-manager-measure-"))
  roots.push(dir)
  return dir
}

after(async () => {
  for (const dir of roots) {
    await rm(dir, { recursive: true, force: true })
  }
})

test("measures a single file by its size", async () => {
  const root = await fixture()
  await writeFile(join(root, "a.bin"), Buffer.alloc(2048))
  assert.equal(await measurePath(join(root, "a.bin")), 2048)
})

test("sums a directory tree recursively", async () => {
  const root = await fixture()
  await writeFile(join(root, "a.bin"), Buffer.alloc(1000))
  await mkdir(join(root, "nested", "deeper"), { recursive: true })
  await writeFile(join(root, "nested", "b.bin"), Buffer.alloc(500))
  await writeFile(join(root, "nested", "deeper", "c.bin"), Buffer.alloc(250))
  assert.equal(await measurePath(root), 1750)
})

test("an empty directory measures zero, not null", async () => {
  const root = await fixture()
  await mkdir(join(root, "empty"))
  assert.equal(await measurePath(join(root, "empty")), 0)
})

test("a missing path measures null", async () => {
  const root = await fixture()
  assert.equal(await measurePath(join(root, "does-not-exist")), null)
})

test("exceeding the entry cap returns null rather than a partial total", async () => {
  const root = await fixture()
  for (let i = 0; i < 5; i += 1) {
    await writeFile(join(root, `f${i}.bin`), Buffer.alloc(100))
  }
  assert.equal(await measurePath(root, { maxEntries: 2 }), null)
})

test("exceeding the time cap returns null rather than a partial total", async () => {
  const root = await fixture()
  await writeFile(join(root, "a.bin"), Buffer.alloc(100))
  let ticks = 0
  const now = () => {
    ticks += 1
    return ticks * 10_000 // every check jumps 10s, blowing any deadline
  }
  assert.equal(await measurePath(root, { maxMs: 1, now }), null)
})

test("countDirectories counts only immediate subdirectories", async () => {
  const root = await fixture()
  await mkdir(join(root, "one"))
  await mkdir(join(root, "two"))
  await mkdir(join(root, "two", "nested"))
  await writeFile(join(root, "file.bin"), Buffer.alloc(10))
  assert.equal(await countDirectories(root), 2)
})

test("countDirectories returns null for a missing path", async () => {
  const root = await fixture()
  assert.equal(await countDirectories(join(root, "nope")), null)
})
```

- [x] **Step 2: Register the test file, then run it to verify it fails**

In `package.json`, add `lib/measure.test.ts` to the `test` script after `lib/cursor-paths.test.ts`.

Run: `npx tsx --test lib/measure.test.ts`
Expected: FAIL with `Cannot find module './measure'`.

- [x] **Step 3: Write minimal implementation**

Create `lib/measure.ts`:

```ts
import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"

/** Caps so a pathological tree cannot hang the request. */
export const MAX_ENTRIES = 50_000
export const MAX_MS = 5_000

export type MeasureOptions = {
  maxEntries?: number
  maxMs?: number
  now?: () => number
}

/**
 * Size of a file, or the recursive total of a directory.
 *
 * Returns null when the path is missing/unreadable OR when a cap is hit. A
 * partial total must never be presented as complete, so a capped walk is
 * reported as "unknown", not as a number.
 */
export async function measurePath(
  target: string,
  options: MeasureOptions = {},
): Promise<number | null> {
  const maxEntries = options.maxEntries ?? MAX_ENTRIES
  const maxMs = options.maxMs ?? MAX_MS
  const now = options.now ?? Date.now

  let info
  try {
    info = await stat(target)
  } catch {
    return null
  }

  if (info.isFile()) {
    return info.size
  }
  if (!info.isDirectory()) {
    return null
  }

  const deadline = now() + maxMs
  let entries = 0
  let total = 0
  const stack = [target]

  while (stack.length > 0) {
    if (now() > deadline) {
      return null
    }
    const dir = stack.pop() as string

    let items
    try {
      items = await readdir(dir, { withFileTypes: true })
    } catch {
      continue // unreadable subdirectory: skip it, keep the rest of the total
    }

    for (const item of items) {
      entries += 1
      if (entries > maxEntries) {
        return null
      }
      const full = join(dir, item.name)
      if (item.isDirectory()) {
        stack.push(full)
      } else if (item.isFile()) {
        try {
          total += (await stat(full)).size
        } catch {
          // vanished mid-walk; ignore
        }
      }
    }
  }

  return total
}

/** Number of immediate subdirectories, or null if the path is unreadable. */
export async function countDirectories(target: string): Promise<number | null> {
  try {
    const items = await readdir(target, { withFileTypes: true })
    return items.filter((item) => item.isDirectory()).length
  } catch {
    return null
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test lib/measure.test.ts`
Expected: PASS, 8 tests.

Run: `npm test`
Expected: 103 pass, 0 fail.

- [x] **Step 5: Commit**

```bash
git add lib/measure.ts lib/measure.test.ts package.json
git commit -m "Add capped filesystem sizing helpers"
```

---

### Task 4: Route handler (`app/api/health/route.ts`)

**Files:**
- Create: `app/api/health/route.ts`

**Interfaces:**
- Consumes: `cursorPaths` + `CursorPaths` (Task 2), `measurePath` + `countDirectories` (Task 3), `THRESHOLDS`, `gradeMeasurements`, `Measurement`, `HealthReport` (Task 1).
- Produces: `GET /api/health` returning a JSON `HealthReport`.

This is the app's first server route. It has no unit test — all its logic lives in the tested `lib/` modules, and it is verified by running it. Do not add filesystem mocking here; if you feel the need to, the logic belongs in `lib/`.

- [x] **Step 1: Write the implementation**

Create `app/api/health/route.ts`:

```ts
import { homedir } from "node:os"

import { NextResponse } from "next/server"

import { cursorPaths, type CursorPaths } from "@/lib/cursor-paths"
import { THRESHOLDS, gradeMeasurements, type Measurement } from "@/lib/health"
import { countDirectories, measurePath } from "@/lib/measure"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Threshold id -> which resolved path it measures. */
const PATH_BY_ID: Record<string, keyof CursorPaths> = {
  "chat-db": "chatDb",
  "workspace-storage": "workspaceStorage",
  "cached-data": "cachedData",
  cache: "cache",
  "blob-storage": "blobStorage",
}

export async function GET() {
  const paths = cursorPaths(process.platform, homedir(), process.env.APPDATA)

  const measurements: Measurement[] = await Promise.all(
    THRESHOLDS.map(async (threshold) => {
      const key = PATH_BY_ID[threshold.id]
      const target = paths[key]
      const bytes = await measurePath(target)

      let detail: string | undefined
      if (threshold.id === "workspace-storage") {
        const count = await countDirectories(target)
        detail = count === null ? undefined : `${count} folder${count === 1 ? "" : "s"}`
      }

      return { id: threshold.id, label: threshold.label, path: target, bytes, detail }
    }),
  )

  return NextResponse.json(gradeMeasurements(measurements, Date.now()))
}
```

- [x] **Step 2: Verify it against your real install**

```bash
npm run dev
```

In another terminal:

```bash
curl -s http://localhost:43127/api/health
```

Expected: JSON with five findings, `installFound: true`, and a `chat-db` entry whose `bytes` is a real number. Confirm the `path` values point at your actual Cursor directories.

- [x] **Step 3: Verify the not-found path renders as unknown**

Temporarily change the `homedir()` argument to a bogus path (e.g. `"/nope"`), re-request, and confirm every finding comes back `severity: "unknown"` with `installFound: false` — **not** `0 B` / `ok`. Then revert the change.

This checks the single most important behaviour in the spec; do not skip it.

- [x] **Step 4: Confirm the suite and build still pass**

Run: `npm test` → 103 pass.
Run: `npm run build` → exit 0. Confirm the route appears in the build output as a dynamic route.

- [x] **Step 5: Commit**

```bash
git add app/api/health/route.ts
git commit -m "Add /api/health route measuring the local Cursor install"
```

---

### Task 5: Health panel and wiring

**Files:**
- Modify: `lib/storage.ts` (add the snapshot pair)
- Create: `components/health-panel.tsx`
- Modify: `components/session-app.tsx` (import + render)
- Modify: `components/panels.test.tsx` (panel render test + SessionApp assertion)

**Interfaces:**
- Consumes: `HealthReport`, `Finding`, `formatBytes`, `totalBytes` (Task 1); `GET /api/health` (Task 4).
- Produces: `LaunchFlags`-style export `HealthPanel`; storage functions `loadHealthSnapshot(): HealthReport | null` and `saveHealthSnapshot(report: HealthReport): void`.

- [x] **Step 1: Write the failing test**

In `components/panels.test.tsx`, add the import beside the existing panel imports:

```tsx
import { HealthPanel } from "@/components/health-panel"
```

Append this test:

```tsx
test("HealthPanel renders its heading and the heuristic disclaimer", () => {
  const html = renderToStaticMarkup(<HealthPanel />)
  assert.match(html, /Install health/)
  assert.match(html, /rules of thumb/i)
  assert.match(html, /Measure/)
})
```

And extend the existing `SessionApp renders the seeded dashboard end to end` test by adding one assertion beside the other panel assertions:

```tsx
  assert.match(html, /Install health/)
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --import ./test/setup-dom.ts --test components/panels.test.tsx`
Expected: FAIL with `Cannot find module '@/components/health-panel'`.

- [x] **Step 3: Add the storage pair**

In `lib/storage.ts`, add the import beside the other lib imports:

```ts
import { type HealthReport } from "./health"
```

Add the key beside the others:

```ts
const HEALTH_SNAPSHOT_KEY = "session-guard:health-snapshot"
```

Append the functions:

```ts
export function loadHealthSnapshot(): HealthReport | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(HEALTH_SNAPSHOT_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as HealthReport
    return Array.isArray(parsed?.findings) ? parsed : null
  } catch {
    return null
  }
}

export function saveHealthSnapshot(report: HealthReport): void {
  window.localStorage.setItem(HEALTH_SNAPSHOT_KEY, JSON.stringify(report))
}
```

- [x] **Step 4: Write the panel**

Create `components/health-panel.tsx`:

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import { Activity, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { loadHealthSnapshot, saveHealthSnapshot } from "@/lib/storage"
import { formatBytes, totalBytes, type Finding, type HealthReport } from "@/lib/health"

const SEVERITY_CLASS: Record<Finding["severity"], string> = {
  ok: "border-border",
  warn: "border-amber-500/60",
  critical: "border-destructive/70",
  unknown: "border-dashed opacity-60",
}

const SEVERITY_LABEL: Record<Finding["severity"], string> = {
  ok: "ok",
  warn: "large",
  critical: "bloated",
  unknown: "not found",
}

export function HealthPanel() {
  const [report, setReport] = useState<HealthReport | null>(null)
  const [previous, setPrevious] = useState<HealthReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore localStorage after mount */
    setPrevious(loadHealthSnapshot())
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const measure = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/health")
      if (!response.ok) {
        throw new Error(`/api/health responded ${response.status}`)
      }
      const next = (await response.json()) as HealthReport
      setPrevious(report ?? loadHealthSnapshot())
      setReport(next)
      saveHealthSnapshot(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not measure this install.")
    } finally {
      setLoading(false)
    }
  }, [report])

  const delta =
    report && previous ? totalBytes(report) - totalBytes(previous) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4" />
          Install health
        </CardTitle>
        <CardDescription>
          Measures the Cursor data directories on this machine. Nothing is deleted or changed —
          cleanup stays with Cursor&apos;s own palette commands. Size limits below are rules of
          thumb, not official Cursor guidance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={loading} onClick={measure}>
            <RefreshCw />
            {report ? "Re-measure" : "Measure this install"}
          </Button>
          {delta !== null ? (
            <span className="text-xs text-muted-foreground">
              {delta === 0
                ? "No change since the last measurement."
                : `${delta < 0 ? "Freed" : "Grew"} ${formatBytes(Math.abs(delta))} since the last measurement.`}
            </span>
          ) : null}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {report && !report.installFound ? (
          <p className="text-xs text-muted-foreground">
            No Cursor install found at the expected location. Nothing could be measured.
          </p>
        ) : null}

        {report?.installFound ? (
          <div className="space-y-2">
            {report.findings.map((finding) => (
              <div
                key={finding.id}
                className={`rounded-xl border px-3 py-2 ${SEVERITY_CLASS[finding.severity]}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{finding.label}</span>
                  <span className="font-mono text-sm">
                    {finding.bytes === null ? "not found" : formatBytes(finding.bytes)}
                  </span>
                </div>
                <p className="font-mono text-xs break-all text-muted-foreground">{finding.path}</p>
                <p className="text-xs text-muted-foreground">
                  {SEVERITY_LABEL[finding.severity]}
                  {finding.detail ? ` · ${finding.detail}` : ""}
                </p>
                {finding.guidance ? (
                  <p className="mt-1 text-xs">{finding.guidance}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
```

- [x] **Step 5: Wire it into the dashboard**

In `components/session-app.tsx`, add beside the other panel imports:

```tsx
import { HealthPanel } from "@/components/health-panel"
```

And render it immediately after `<LaunchFlags />`:

```tsx
      <LaunchFlags />

      <HealthPanel />
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `npx tsx --import ./test/setup-dom.ts --test components/panels.test.tsx`
Expected: PASS, 6 tests.

Run: `npm test`
Expected: 104 pass, 0 fail.

Run: `npm run lint` → exit 0.
Run: `npm run build` → exit 0.

- [x] **Step 7: Verify in the running app**

```bash
npm run dev
```

Open `http://localhost:43127`, scroll to **Install health**, click **Measure this install**. Confirm real sizes appear and `chat-db` is flagged if it is over 1 GB. Click **Re-measure** and confirm the delta line appears.

**Look at the page, do not just check that it did not error.** A panel that renders zeros for everything means the paths are wrong.

- [x] **Step 8: Commit**

```bash
git add lib/storage.ts components/health-panel.tsx components/session-app.tsx components/panels.test.tsx
git commit -m "Add install health panel with before/after deltas"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: grading + thresholds → Task 1; platform paths → Task 2; error handling caps → Task 3; route handler + the wrong-path check → Task 4; storage, panel, delta, heuristic disclaimer → Task 5. The spec's non-goals are enforced by omission — no task writes to the filesystem or offers a delete control. Deferred items (trends, power-user score, safe cleanup, `argv.json`) are correctly absent.

**Placeholder scan.** No TBD/TODO. Every code step carries real code; every test step carries real assertions; every run step names the exact command and the expected result.

**Type consistency.** `Measurement`, `Finding`, `HealthReport`, `Severity`, `Threshold`, `CursorPaths` are defined in Tasks 1–2 and used with identical names and shapes in Tasks 4–5. `measurePath` / `countDirectories` signatures in Task 3 match their call sites in Task 4. `loadHealthSnapshot` / `saveHealthSnapshot` in Task 5 Step 3 match their use in Step 4. Threshold ids in `THRESHOLDS` match the keys of `PATH_BY_ID` exactly: `chat-db`, `workspace-storage`, `cached-data`, `cache`, `blob-storage`.

**Test count arithmetic.** Baseline 79 → 89 (Task 1) → 95 (Task 2) → 103 (Task 3) → 104 (Task 5). Task 4 adds none by design.
