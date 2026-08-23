# Cursor health panel — design

Date: 2026-08-23
Status: approved, not yet implemented

## Problem

Cursor accumulates state and degrades over time — it slows down and crashes —
and ships no built-in way to see why. Cursor Manager cannot help today because
all four of its panels are **write-only**: `TWEAKS`, `MANUAL_STEPS`, the
cursorignore generator, and launch flags each end in "copy this, paste it
somewhere". The app states what a config *should* be and never inspects what it
*is*.

`MANUAL_STEPS` already tells the user to run **Delete Old Chats** and **GC Agent
KV Blobs**, but has no idea whether either is needed or whether it worked. That
is a checklist without a feedback loop.

## Evidence

Measured on the author's machine (Windows 11, Cursor 3.17.8), 2026-08-23:

| Path (under `%APPDATA%\Cursor`) | Size |
| --- | --- |
| `User/globalStorage/state.vscdb` | **17,827.6 MB** |
| `CachedData` | 402.8 MB |
| `User/workspaceStorage` (42 dirs) | 114.4 MB |
| `Cache` | 69.2 MB |
| `blob_storage` | 38.6 MB |
| `Backups`, `Code Cache`, `Crashpad`, `CachedExtensionVSIXs` | ~0 MB |

One file is roughly 30x everything else combined. `state.vscdb` is the SQLite
key-value store holding chat and composer history. An 18 GB store queried by the
renderer is a plausible direct cause of the reported slowness and crashes.

Two findings shaped the design by ruling things out:

- **`Crashpad/reports` contained 0 files.** Crash counting is not a viable
  metric and is excluded. Without measuring, it would have been designed in.
- **`~/.cursor/argv.json` exists.** Persistent launch flags are real on this
  platform. Out of scope here, but it reopens `--disable-gpu` persistence as a
  later option (see Deferred).

## Goals

1. Show the user, with real numbers, where their Cursor install is bloated.
2. Turn the existing `MANUAL_STEPS` cleanup entries into a verifiable loop by
   showing before/after deltas.
3. Never modify or delete user data.

## Non-goals

- **No cleanup actions.** Remediation stays the Cursor palette commands, which
  understand the schema. This app does not. The `guidance` field is display text
  only — the panel never offers a button that deletes anything, including for
  the caches it describes as safe to clear.
- **No writes to `state.vscdb`.** Its schema is undocumented and Cursor may hold
  the file open. Pruning it was considered and explicitly rejected: it is the
  only route to reclaiming the 17.8 GB automatically, and also the only one that
  can destroy real chat history.
- **No power-user score.** Separate concern, separate spec (see Deferred).
- **No trend history.** Point-in-time only for v1 (see Deferred).

## Architecture

Three units, split along the pure/impure line the repo already uses.

### `lib/health.ts` — pure grading, no I/O

Takes a raw measurement and returns graded findings. Touches no filesystem, so
it unit-tests with fixture numbers exactly as `guard.ts` and `tweaks.ts` do.

```ts
export type Measurement = {
  id: string           // "chat-db", "workspace-storage", ...
  label: string
  path: string         // resolved absolute path, for display
  bytes: number | null // null = path not found
  detail?: string      // optional per-metric note, e.g. "42 directories"
}

export type Severity = "ok" | "warn" | "critical" | "unknown"

export type Finding = Measurement & {
  severity: Severity
  guidance: string | null  // the palette command to run, when actionable
}

export type HealthReport = {
  findings: Finding[]
  installFound: boolean
  measuredAt: number
}

export function gradeMeasurements(m: Measurement[], at: number): HealthReport
export function totalBytes(r: HealthReport): number
export function formatBytes(bytes: number): string
```

### `app/api/health/route.ts` — the only I/O

The app's first server route. Resolves Cursor's data directories, stats them,
returns `Measurement[]` as JSON. `runtime = "nodejs"`,
`dynamic = "force-dynamic"`.

Path resolution is extracted as a **pure, exported function** so it is testable
per-platform without a filesystem:

```ts
export function cursorPaths(
  platform: NodeJS.Platform,
  home: string,
  appData?: string,
): {
  chatDb: string
  workspaceStorage: string
  cachedData: string
  cache: string
  blobStorage: string
}
```

### `components/health-panel.tsx`

Fetches `/api/health`, renders findings grouped by severity, a **Re-measure**
button, and the delta against the previous measurement.

### Data flow

```
route handler --stat--> ~/.cursor, %APPDATA%\Cursor
      |
      +--Measurement[]--> lib/health.ts --HealthReport--> panel
                                                            |
                              previous report (localStorage) +--> delta
```

Storage follows the existing pattern: `loadHealthSnapshot` /
`saveHealthSnapshot` in `lib/storage.ts`, key `session-guard:health-snapshot`,
holding the previous `HealthReport` so the panel can render
`17.8 GB -> 2.1 GB` after a cleanup.

## Metrics and thresholds

| id | Path | warn | critical | Guidance when over |
| --- | --- | --- | --- | --- |
| `chat-db` | `User/globalStorage/state.vscdb` | 1 GB | 5 GB | Palette → Developer: Delete Old Chats, then GC Agent KV Blobs |
| `workspace-storage` | `User/workspaceStorage` | 500 MB | 2 GB | Remove stale workspace dirs for repos you no longer have |
| `cached-data` | `CachedData` | 1 GB | 3 GB | Safe to clear; Cursor regenerates it |
| `cache` | `Cache` | 500 MB | 2 GB | Safe to clear; Cursor regenerates it |
| `blob-storage` | `blob_storage` | 500 MB | 2 GB | Safe to clear; Cursor regenerates it |

**These thresholds are heuristics, not Cursor guidance.** They derive from one
real data point. The UI must label them as rules of thumb. The repo forbids
inventing Cursor setting IDs; the same honesty applies to invented numbers.

Thresholds live in one exported table in `lib/health.ts` so they can be revised
in a single place as more real installs are seen.

## Platform paths

| Platform | Root | Verified |
| --- | --- | --- |
| Windows | `%APPDATA%\Cursor` | **Yes** — measured 2026-08-23 |
| macOS | `~/Library/Application Support/Cursor` | No — conventional Electron location |
| Linux | `~/.config/Cursor` | No — conventional Electron location |

All three are implemented. The two unverified ones are assumptions, not facts:
if a path is absent the panel says so explicitly rather than implying health.

## Error handling

The governing rule: **a wrong path must never look like a healthy install.**

- Missing path → `bytes: null`, severity `unknown`, panel shows
  "not found at &lt;path&gt;". Never `0 B`, never `ok`.
- No paths found at all → `installFound: false`, panel shows a single
  "No Cursor install found" state instead of a list of zeros.
- Permission error on stat → same as missing, with the error surfaced.
- Directory sizing is a bounded recursive walk. `state.vscdb` is a single file
  stat and therefore fast; directory totals stop after **50,000 entries or 5
  seconds per metric**, whichever comes first, so a pathological tree cannot
  hang the request. On hitting either limit the entry is `unknown`, never a
  partial number presented as complete.
- The route never throws to the client; it returns a report with `unknown`
  entries.

## Testing

TDD, with red verified for the right reason before each implementation step.

- `lib/health.test.ts` — grading at each threshold boundary; `null` bytes yield
  `unknown` not `ok`; `installFound: false` when everything is null;
  `formatBytes` at KB/MB/GB boundaries.
- `cursorPaths` — one case per platform, asserting the documented locations.
- `components/health-panel.tsx` — render test with a stubbed fetch covering the
  healthy, bloated, and no-install states.
- New test files must be added to the `test` script in `package.json`, or they
  silently never run (see AGENTS.md).

## Constraints

**This makes the app local-only.** A route handler reading `~/.cursor` is
meaningful only when the server runs on the user's own machine, which is how
this app is used (`npm run dev` on :43127). If it were ever deployed, the health
panel would report the *server's* filesystem. Any future deployment must
disable this panel rather than ship it broken.

## Deferred

- **Trend over time.** "It gets bloated after a while" is a rate question a
  single number cannot answer. The plugin's `sessionStart` / `sessionEnd` hooks
  already fire and could sample sizes cheaply. `HealthReport` is shaped so a
  `history: HealthReport[]` can be added to the plugin's `state.json` without
  reworking the grading layer.
- **Power-user score.** The user's other question: grade real settings against
  the recommended set. Much of it exists already via `importSettings` /
  `diffSettings`. Its own spec.
- **Safe cleanup.** Clearing only regenerable caches. Rejected for v1 on value:
  it would recover roughly 600 MB of an 18 GB problem, about 3%.
- **`argv.json` persistent flags.** Confirmed to exist; would extend the launch
  flags panel rather than this one.
