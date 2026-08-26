# Chat Database Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show what is inside the Cursor chat database — which conversations are consuming it, ranked by size and grouped by how long they have been untouched — and prove that a cleanup worked on the cleanup's own timescale.

**Architecture:** A read-only SQLite reader (`lib/chat-db.ts`, the I/O half, mirroring `lib/measure.ts`) feeds a pure bucketing module (`lib/chat-report.ts`, mirroring `lib/health.ts`). Two tiers: a 0.1s query pair rides every measurement and is recorded into the existing sample store so verification tolerates lag; a ~12s ranking sits behind its own route and button. Nothing is ever written to `state.vscdb`.

**Tech Stack:** Next.js 16 (App Router route handlers), React 19, TypeScript, `node:sqlite` (built into Node 22+, no new dependency), `node:test` through `tsx`, `renderToStaticMarkup` for component tests.

**Spec:** `docs/superpowers/specs/2026-08-26-chat-db-breakdown-design.md`

## Amendments during execution

This plan is kept as written, as the record of what was planned. Three of its
decisions were withdrawn under measurement while executing it. **Where a code
listing below disagrees with the shipped code, the shipped code is correct and
the spec describes it**; these are the differences worth knowing about.

- **Ranking is by size, not by idleness.** The listings in Task 3 rank on
  `lastUpdatedAt` and `rankCandidates` takes only `stats`. Against the real
  database that returned twenty conversations holding zero messages — the most
  idle rows in `composerHeaders` are the empty ones. Shipped:
  `rankCandidates(stats, counts)` sorts by exact message count descending, and
  dormancy became the grouping applied afterward rather than the selection.
  *Cost if wrong: the feature names the wrong conversations, which is the
  entire feature.*

- **Sampling is key-ordered `LIMIT`, not strided.** Task 2's
  `ROW_NUMBER() OVER (ORDER BY key)` reads the `value` of every row in order to
  number it — ~1.4 GB per large conversation — and measured **88 seconds**,
  about 2.9× the whole analyze budget. A bubble key ends in a random UUID v4,
  so key order is already uncorrelated with write order and the first
  `SAMPLE_ROWS` rows are an unbiased sample. *Cost if wrong: a biased size
  estimate, which is why the equivalence is argued from the key format rather
  than assumed.*

- **Constants moved to `lib/chat-db-constants.ts`.** The panel needs
  `RANKED_LIMIT` and `SAMPLE_ROWS` to state its sampling method on screen, and a
  `"use client"` component that value-imports even one number from
  `lib/chat-db.ts` drags `node:sqlite` into the browser bundle, which Turbopack
  refuses to build. *Cost if wrong: `npm run build` fails while `npm test`
  stays green — `tsx` does not type-check, and this branch shipped a red build
  under a green suite twice before it was caught.*

The full rulings, including the ones that did not change the plan, are in
`.superpowers/sdd/2026-08-26-chat-db-breakdown/progress.md`.

## Global Constraints

- **Never write to `state.vscdb`.** Every connection opens with `{ readOnly: true }`. The panel names what is worth deleting; Cursor deletes it.
- **No file under `plugin/` changes.** `lib/measure.ts` caps are not modified.
- **No deletion, no projection, no forecast, no exact byte sizes.**
- **Fail closed:** missing, unreadable, locked, or over-budget returns `null` — never a partial result presented as complete.
- **`RANKED_LIMIT = 20`**, **`SAMPLE_ROWS = 400`**, **`CHEAP_CAP_MS = 2_000`**, **`ANALYZE_CAP_MS = 30_000`**.
- Sizes are rendered with a leading `~` and the sampling method stated on screen.
- New test files must be registered in the `test` script in `package.json`.
- Run the full suite with `npm test`. **Baseline before this plan: 175 passing** — verify this before Task 1 and stop if it differs.

## Two rulings that deviate from the spec's wording

Both were settled before this plan was written; implement the plan, not the spec's phrasing.

**1. `node:sqlite` is synchronous, so the cap is checked *between* queries, not within one.** The spec says a query exceeding its cap returns `null`. `DatabaseSync` offers no interrupt, and `GROUP BY` computes fully before yielding a first row, so a per-query abort is not implementable. The budget is therefore checked before each query is issued: if elapsed time already exceeds the cap, the remaining queries are skipped and `null` is returned. A single pathological query can still overrun. This is a real limitation and the code says so in a comment rather than implying a guarantee it cannot make.

**2. The exported functions keep their `Promise` return types even though their bodies are synchronous.** `DatabaseSync` blocks the event loop — about 12s for the analyze tier. Acceptable for a local single-user tool on an explicit button press, and the async signature means moving the work to a worker thread later changes no callers.

---

### Task 1: Read the cheap tier

**Files:**
- Create: `lib/chat-db.ts`
- Create: `lib/chat-db.test.ts`
- Modify: `package.json` (register the test file)

**Interfaces:**
- Consumes: nothing.
- Produces: `ChatDbConversation`, `ChatDbStats`; constants `CHEAP_CAP_MS`, `ANALYZE_CAP_MS`, `RANKED_LIMIT`, `SAMPLE_ROWS`; `readChatDbStats(path: string): Promise<ChatDbStats | null>`.

- [ ] **Step 1: Write the failing tests**

Create `lib/chat-db.test.ts`:

```ts
import assert from "node:assert/strict"
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { after, test } from "node:test"

import { readChatDbStats } from "./chat-db"

const roots: string[] = []

/** Build a throwaway database shaped like Cursor's real one. */
async function fixture(
  conversations: { id: string; lastUpdatedAt: number; isArchived?: boolean; isSubagent?: boolean }[],
  bubbles: { composerId: string; count: number; bytes?: number }[] = [],
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cursor-manager-chatdb-"))
  roots.push(dir)
  const file = join(dir, "state.vscdb")
  const db = new DatabaseSync(file)
  db.exec("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)")
  db.exec(
    "CREATE TABLE composerHeaders (composerId TEXT, workspaceId TEXT, createdAt INTEGER, lastUpdatedAt INTEGER, isArchived INTEGER, isSubagent INTEGER, recency INTEGER, checkpointAt INTEGER, value BLOB)",
  )
  const ins = db.prepare(
    "INSERT INTO composerHeaders (composerId, createdAt, lastUpdatedAt, isArchived, isSubagent) VALUES (?, ?, ?, ?, ?)",
  )
  for (const c of conversations) {
    ins.run(c.id, 0, c.lastUpdatedAt, c.isArchived ? 1 : 0, c.isSubagent ? 1 : 0)
  }
  const insB = db.prepare("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)")
  for (const b of bubbles) {
    for (let i = 0; i < b.count; i += 1) {
      insB.run(`bubbleId:${b.composerId}:${String(i).padStart(8, "0")}`, "x".repeat(b.bytes ?? 10))
    }
  }
  db.close()
  return file
}

after(async () => {
  for (const dir of roots) await rm(dir, { recursive: true, force: true })
})

test("reads page geometry and conversations", async () => {
  const file = await fixture([
    { id: "a", lastUpdatedAt: 1000 },
    { id: "b", lastUpdatedAt: 2000, isArchived: true },
    { id: "c", lastUpdatedAt: 3000, isSubagent: true },
  ])
  const stats = await readChatDbStats(file)
  assert.ok(stats)
  assert.ok(stats.pageCount > 0, "a real database has pages")
  assert.ok(stats.pageSize > 0)
  assert.ok(stats.freePages >= 0)
  assert.equal(stats.conversations.length, 3)
})

test("carries the archived and subagent flags as booleans", async () => {
  const file = await fixture([
    { id: "a", lastUpdatedAt: 1000 },
    { id: "b", lastUpdatedAt: 2000, isArchived: true },
    { id: "c", lastUpdatedAt: 3000, isSubagent: true },
  ])
  const stats = await readChatDbStats(file)
  assert.ok(stats)
  const byId = Object.fromEntries(stats.conversations.map((c) => [c.id, c]))
  assert.equal(byId.a.isArchived, false)
  assert.equal(byId.a.isSubagent, false)
  assert.equal(byId.b.isArchived, true)
  assert.equal(byId.c.isSubagent, true)
})

test("lastUpdatedAt survives as a number", async () => {
  const file = await fixture([{ id: "a", lastUpdatedAt: 1_756_000_000_000 }])
  const stats = await readChatDbStats(file)
  assert.ok(stats)
  assert.equal(stats.conversations[0].lastUpdatedAt, 1_756_000_000_000)
})

test("a missing database is unknown, not an error", async () => {
  assert.equal(await readChatDbStats(join(tmpdir(), "definitely-not-here.vscdb")), null)
})

test("a corrupt database is unknown, not a throw", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cursor-manager-chatdb-"))
  roots.push(dir)
  const file = join(dir, "corrupt.vscdb")
  await writeFile(file, "this is not a database")
  assert.equal(await readChatDbStats(file), null)
})

test("a database without composerHeaders is unknown, not a partial answer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cursor-manager-chatdb-"))
  roots.push(dir)
  const file = join(dir, "bare.vscdb")
  const db = new DatabaseSync(file)
  db.exec("CREATE TABLE unrelated (x INTEGER)")
  db.close()
  assert.equal(await readChatDbStats(file), null, "page counts without conversations is a partial answer")
})

test("reading does not modify the database file", async () => {
  const file = await fixture([{ id: "a", lastUpdatedAt: 1000 }])
  const before = (await stat(file)).mtimeMs
  const result = await readChatDbStats(file)
  assert.ok(result, "precondition: the read succeeded")
  assert.equal(
    (await stat(file)).mtimeMs,
    before,
    "a read-only connection must leave the file untouched",
  )
})
```

- [ ] **Step 2: Register the test file, then run it to verify it fails**

In `package.json`, add `lib/chat-db.test.ts` to the `test` script immediately after `lib/directory-samples.test.ts`.

Run: `npx tsx --test lib/chat-db.test.ts`
Expected: FAIL with `Cannot find module './chat-db'`. Any other failure must be fixed first.

- [ ] **Step 3: Write the implementation**

Create `lib/chat-db.ts`:

```ts
import { DatabaseSync } from "node:sqlite"

export type ChatDbConversation = {
  id: string
  lastUpdatedAt: number
  isArchived: boolean
  isSubagent: boolean
}

export type ChatDbStats = {
  pageCount: number
  pageSize: number
  freePages: number
  conversations: ChatDbConversation[]
}

/**
 * Budgets, deliberately separate from `lib/measure.ts`'s MAX_MS: they bound
 * different work and one must be free to change without moving the other.
 *
 * Note what these can and cannot do. `node:sqlite` is synchronous and offers no
 * interrupt, and GROUP BY computes fully before yielding a first row, so the
 * budget is checked BETWEEN queries, not within one. A single pathological
 * query can still overrun. This is a real limitation, not a guarantee.
 */
export const CHEAP_CAP_MS = 2_000
export const ANALYZE_CAP_MS = 30_000

/** Conversations ranked and sampled. The tail is long and uniformly small. */
export const RANKED_LIMIT = 20
/** Messages sampled per ranked conversation, strided across its whole life. */
export const SAMPLE_ROWS = 400

function scalar(db: DatabaseSync, sql: string): number {
  return Number(Object.values(db.prepare(sql).get() as Record<string, unknown>)[0])
}

/**
 * Page geometry and conversation metadata: two queries, about a tenth of a
 * second, no value bytes read.
 *
 * Returns null rather than a partial answer for any failure — missing file,
 * corrupt file, locked database, missing table, or an exhausted budget. A
 * partial total must never be presented as complete.
 */
export async function readChatDbStats(path: string): Promise<ChatDbStats | null> {
  const started = Date.now()
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(path, { readOnly: true })
    const pageCount = scalar(db, "PRAGMA page_count")
    const pageSize = scalar(db, "PRAGMA page_size")
    const freePages = scalar(db, "PRAGMA freelist_count")

    if (Date.now() - started > CHEAP_CAP_MS) {
      return null
    }

    const rows = db
      .prepare(
        "SELECT composerId, lastUpdatedAt, isArchived, isSubagent FROM composerHeaders",
      )
      .all() as Record<string, unknown>[]

    const conversations = rows
      .filter((row) => typeof row.composerId === "string" && Number.isFinite(Number(row.lastUpdatedAt)))
      .map((row) => ({
        id: String(row.composerId),
        lastUpdatedAt: Number(row.lastUpdatedAt),
        isArchived: Boolean(Number(row.isArchived)),
        isSubagent: Boolean(Number(row.isSubagent)),
      }))

    return { pageCount, pageSize, freePages, conversations }
  } catch {
    return null
  } finally {
    db?.close()
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 182 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/chat-db.ts lib/chat-db.test.ts package.json
git commit -m "Read chat database geometry and conversation metadata"
```

---

### Task 2: Rank and sample conversations

**Files:**
- Modify: `lib/chat-db.ts`
- Modify: `lib/chat-db.test.ts`

**Interfaces:**
- Consumes: `RANKED_LIMIT`, `SAMPLE_ROWS`, `ANALYZE_CAP_MS` (Task 1).
- Produces: `ConversationSize = { id: string; messages: number; sampledMeanBytes: number }`; `readConversationSizes(path: string, ids: string[]): Promise<ConversationSize[] | null>`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/chat-db.test.ts`, and **extend the file's existing
`from "./chat-db"` import line** to `import { SAMPLE_ROWS, readChatDbStats, readConversationSizes } from "./chat-db"`
rather than adding a second import statement — `no-duplicate-imports` would
flag it at Task 6's lint step.

```ts
test("counts messages exactly and averages their size", async () => {
  const file = await fixture(
    [{ id: "a", lastUpdatedAt: 1000 }],
    [{ composerId: "a", count: 50, bytes: 100 }],
  )
  const sizes = await readConversationSizes(file, ["a"])
  assert.ok(sizes)
  assert.equal(sizes[0].messages, 50, "message count is exact, never sampled")
  assert.equal(sizes[0].sampledMeanBytes, 100)
})

test("a conversation under the sample size is measured in full", async () => {
  const file = await fixture(
    [{ id: "a", lastUpdatedAt: 1000 }],
    [{ composerId: "a", count: 10, bytes: 250 }],
  )
  const sizes = await readConversationSizes(file, ["a"])
  assert.ok(sizes)
  assert.equal(sizes[0].messages, 10)
  assert.equal(sizes[0].sampledMeanBytes, 250, "fewer rows than SAMPLE_ROWS means no estimation at all")
})

test("the sample strides across the conversation rather than taking its opening", async () => {
  // Rows are inserted in key order with a size that grows with the index, so a
  // sample taken from the start alone reports a mean far below the true one.
  // This is the exact defect that made an early hand estimate wrong by 4.6x.
  const dir = await mkdtemp(join(tmpdir(), "cursor-manager-chatdb-"))
  roots.push(dir)
  const file = join(dir, "strided.vscdb")
  const db = new DatabaseSync(file)
  db.exec("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)")
  db.exec(
    "CREATE TABLE composerHeaders (composerId TEXT, workspaceId TEXT, createdAt INTEGER, lastUpdatedAt INTEGER, isArchived INTEGER, isSubagent INTEGER, recency INTEGER, checkpointAt INTEGER, value BLOB)",
  )
  db.prepare(
    "INSERT INTO composerHeaders (composerId, createdAt, lastUpdatedAt, isArchived, isSubagent) VALUES (?, ?, ?, ?, ?)",
  ).run("a", 0, 1000, 0, 0)
  const ins = db.prepare("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)")
  const total = SAMPLE_ROWS * 4
  for (let i = 0; i < total; i += 1) {
    // size ramps 1..total bytes; true mean is about total/2
    ins.run(`bubbleId:a:${String(i).padStart(8, "0")}`, "x".repeat(i + 1))
  }
  db.close()

  const sizes = await readConversationSizes(file, ["a"])
  assert.ok(sizes)
  const trueMean = (total + 1) / 2
  assert.ok(
    Math.abs(sizes[0].sampledMeanBytes - trueMean) < trueMean * 0.1,
    `strided sample should land within 10% of ${trueMean}, got ${sizes[0].sampledMeanBytes}`,
  )
  assert.ok(
    sizes[0].sampledMeanBytes > SAMPLE_ROWS,
    "a sample taken from the opening rows would report a mean below SAMPLE_ROWS",
  )
})

test("a conversation with no messages reports zero, not an error", async () => {
  const file = await fixture([{ id: "a", lastUpdatedAt: 1000 }])
  const sizes = await readConversationSizes(file, ["a"])
  assert.ok(sizes)
  assert.equal(sizes[0].messages, 0)
  assert.equal(sizes[0].sampledMeanBytes, 0)
})

test("only the requested conversations are read", async () => {
  const file = await fixture(
    [
      { id: "a", lastUpdatedAt: 1000 },
      { id: "b", lastUpdatedAt: 2000 },
    ],
    [
      { composerId: "a", count: 5, bytes: 10 },
      { composerId: "b", count: 5, bytes: 10 },
    ],
  )
  const sizes = await readConversationSizes(file, ["b"])
  assert.ok(sizes)
  assert.equal(sizes.length, 1)
  assert.equal(sizes[0].id, "b")
})

test("a missing database is unknown", async () => {
  assert.equal(await readConversationSizes(join(tmpdir(), "nope.vscdb"), ["a"]), null)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test lib/chat-db.test.ts`
Expected: FAIL — `readConversationSizes is not a function` (or a TypeScript error that it is not exported). Any other failure must be fixed first.

- [ ] **Step 3: Write the implementation**

Add to `lib/chat-db.ts`:

```ts
export type ConversationSize = {
  id: string
  messages: number
  sampledMeanBytes: number
}

/**
 * Exact message counts, plus each conversation's OWN mean message size.
 *
 * The sample is strided — every nth row across the conversation's whole life —
 * not the first N. Sampling in insertion order returns the oldest rows and
 * produced an estimate wrong by roughly 4.6x during investigation. A
 * conversation with fewer rows than SAMPLE_ROWS is measured in full.
 */
export async function readConversationSizes(
  path: string,
  ids: string[],
): Promise<ConversationSize[] | null> {
  const started = Date.now()
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(path, { readOnly: true })
    const countOf = db.prepare("SELECT COUNT(*) AS n FROM cursorDiskKV WHERE key LIKE ?")
    const meanOf = db.prepare(
      "SELECT AVG(length(value)) AS a FROM (" +
        "SELECT value, ROW_NUMBER() OVER (ORDER BY key) AS rn FROM cursorDiskKV WHERE key LIKE ?" +
        ") WHERE (rn - 1) % ? = 0",
    )

    const sizes: ConversationSize[] = []
    for (const id of ids) {
      if (Date.now() - started > ANALYZE_CAP_MS) {
        return null
      }
      const like = `bubbleId:${id}:%`
      const messages = Number((countOf.get(like) as { n: number }).n)
      if (messages === 0) {
        sizes.push({ id, messages: 0, sampledMeanBytes: 0 })
        continue
      }
      const stride = Math.max(1, Math.floor(messages / SAMPLE_ROWS))
      const mean = (meanOf.get(like, stride) as { a: number | null }).a
      sizes.push({ id, messages, sampledMeanBytes: Math.round(Number(mean ?? 0)) })
    }
    return sizes
  } catch {
    return null
  } finally {
    db?.close()
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 188 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/chat-db.ts lib/chat-db.test.ts
git commit -m "Rank conversations by message count with a strided size sample"
```

---

### Task 3: Bucket conversations by dormancy

The pure half. No clock, no filesystem, no database — every judgment about what the user sees lives here and is unit-testable.

**Files:**
- Create: `lib/chat-report.ts`
- Create: `lib/chat-report.test.ts`
- Modify: `package.json` (register the test file)

**Interfaces:**
- Consumes: `ChatDbStats`, `ChatDbConversation`, `ConversationSize`, `RANKED_LIMIT` from `lib/chat-db.ts` (Tasks 1-2).
- Produces: `RankedConversation`, `DormancyBucket`; `rankCandidates(stats: ChatDbStats): string[]`; `bucketByDormancy(stats: ChatDbStats, sizes: ConversationSize[], now: number): DormancyBucket[]`.

- [ ] **Step 1: Write the failing tests**

Create `lib/chat-report.test.ts`:

```ts
import assert from "node:assert/strict"
import { test } from "node:test"

import type { ChatDbStats, ConversationSize } from "./chat-db"
import { bucketByDormancy, rankCandidates } from "./chat-report"

const DAY = 24 * 3_600_000
const NOW = 1_800_000_000_000

function stats(conversations: ChatDbStats["conversations"]): ChatDbStats {
  return { pageCount: 1000, pageSize: 4096, freePages: 10, conversations }
}

function conv(id: string, daysIdle: number, extra: Partial<ChatDbStats["conversations"][0]> = {}) {
  return { id, lastUpdatedAt: NOW - daysIdle * DAY, isArchived: false, isSubagent: false, ...extra }
}

test("subagent conversations are never ranked", () => {
  const ids = rankCandidates(stats([conv("a", 30), conv("sub", 30, { isSubagent: true })]))
  assert.deepEqual(ids, ["a"], "deleting the parent takes its subagents, so listing them double-counts")
})

test("ranking is capped and ordered by idleness", () => {
  const many = Array.from({ length: 40 }, (_, i) => conv("c" + i, i + 1))
  const ids = rankCandidates(stats(many))
  assert.equal(ids.length, 20, "RANKED_LIMIT")
  assert.equal(ids[0], "c39", "the most idle conversation ranks first")
})

test("buckets split at three weeks and one week", () => {
  const buckets = bucketByDormancy(
    stats([conv("old", 30), conv("mid", 10), conv("fresh", 2)]),
    [
      { id: "old", messages: 100, sampledMeanBytes: 1000 },
      { id: "mid", messages: 200, sampledMeanBytes: 1000 },
      { id: "fresh", messages: 300, sampledMeanBytes: 1000 },
    ],
    NOW,
  )
  const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b]))
  assert.deepEqual(Object.keys(byLabel).length, 3)
  assert.equal(byLabel["Untouched 3+ weeks"].conversations[0].id, "old")
  assert.equal(byLabel["Untouched 1+ week"].conversations[0].id, "mid")
  assert.equal(byLabel["Active this week"].conversations[0].id, "fresh")
})

test("estimated bytes are messages times that conversation's own mean", () => {
  const buckets = bucketByDormancy(
    stats([conv("a", 30)]),
    [{ id: "a", messages: 1000, sampledMeanBytes: 7896 }],
    NOW,
  )
  assert.equal(buckets[0].conversations[0].estimatedBytes, 7_896_000)
  assert.equal(buckets[0].totalEstimatedBytes, 7_896_000)
})

test("an empty bucket is omitted, not shown empty", () => {
  const buckets = bucketByDormancy(
    stats([conv("a", 30)]),
    [{ id: "a", messages: 10, sampledMeanBytes: 10 }],
    NOW,
  )
  assert.equal(buckets.length, 1)
  assert.equal(buckets[0].label, "Untouched 3+ weeks")
})

test("a conversation with no size entry still appears, with no size claimed", () => {
  const buckets = bucketByDormancy(stats([conv("a", 30)]), [], NOW)
  assert.equal(buckets[0].conversations[0].messages, 0)
  assert.equal(buckets[0].conversations[0].estimatedBytes, 0)
})

test("the archived flag survives into the rendered shape", () => {
  const buckets = bucketByDormancy(
    stats([conv("a", 30, { isArchived: true })]),
    [{ id: "a", messages: 10, sampledMeanBytes: 10 }],
    NOW,
  )
  assert.equal(buckets[0].conversations[0].isArchived, true)
})

test("a future lastUpdatedAt is treated as active, not as negative idleness", () => {
  const buckets = bucketByDormancy(
    stats([conv("a", -5)]),
    [{ id: "a", messages: 10, sampledMeanBytes: 10 }],
    NOW,
  )
  assert.equal(buckets[0].label, "Active this week", "a clock skew must not manufacture a stale chat")
})
```

- [ ] **Step 2: Register the test file, then run it to verify it fails**

In `package.json`, add `lib/chat-report.test.ts` to the `test` script immediately after `lib/chat-db.test.ts`.

Run: `npx tsx --test lib/chat-report.test.ts`
Expected: FAIL with `Cannot find module './chat-report'`.

- [ ] **Step 3: Write the implementation**

Create `lib/chat-report.ts`:

```ts
import { RANKED_LIMIT, type ChatDbStats, type ConversationSize } from "./chat-db"

export type RankedConversation = {
  id: string
  messages: number
  estimatedBytes: number
  lastUpdatedAt: number
  isArchived: boolean
}

export type DormancyBucket = {
  label: string
  minDaysIdle: number
  conversations: RankedConversation[]
  totalEstimatedBytes: number
}

const DAY_MS = 24 * 3_600_000

const TIERS = [
  { label: "Untouched 3+ weeks", minDaysIdle: 21 },
  { label: "Untouched 1+ week", minDaysIdle: 7 },
  { label: "Active this week", minDaysIdle: 0 },
]

/**
 * Which conversations are worth the expensive size sample.
 *
 * Subagent conversations are excluded: they are children of a parent, and
 * deleting the parent takes them with it, so listing them separately would
 * double-count the reclaim.
 */
export function rankCandidates(stats: ChatDbStats): string[] {
  return stats.conversations
    .filter((conversation) => !conversation.isSubagent)
    .sort((a, b) => a.lastUpdatedAt - b.lastUpdatedAt)
    .slice(0, RANKED_LIMIT)
    .map((conversation) => conversation.id)
}

/**
 * Group the ranked conversations by how long they have been untouched.
 *
 * Takes `now` rather than reading a clock, so the buckets are deterministic
 * and testable. Empty tiers are omitted: an empty bucket invites the reader to
 * wonder what belongs in it.
 */
export function bucketByDormancy(
  stats: ChatDbStats,
  sizes: ConversationSize[],
  now: number,
): DormancyBucket[] {
  const sizeById = new Map(sizes.map((size) => [size.id, size]))
  const ranked = new Set(rankCandidates(stats))

  const buckets = TIERS.map((tier) => ({
    label: tier.label,
    minDaysIdle: tier.minDaysIdle,
    conversations: [] as RankedConversation[],
    totalEstimatedBytes: 0,
  }))

  for (const conversation of stats.conversations) {
    if (!ranked.has(conversation.id)) {
      continue
    }
    // Math.max against 0: a clock skew that puts lastUpdatedAt in the future
    // must read as active, never as a conversation idle for negative days.
    const daysIdle = Math.max(0, (now - conversation.lastUpdatedAt) / DAY_MS)
    const size = sizeById.get(conversation.id)
    const messages = size?.messages ?? 0
    const entry: RankedConversation = {
      id: conversation.id,
      messages,
      estimatedBytes: messages * (size?.sampledMeanBytes ?? 0),
      lastUpdatedAt: conversation.lastUpdatedAt,
      isArchived: conversation.isArchived,
    }
    const bucket = buckets.find((candidate) => daysIdle >= candidate.minDaysIdle)!
    bucket.conversations.push(entry)
    bucket.totalEstimatedBytes += entry.estimatedBytes
  }

  for (const bucket of buckets) {
    bucket.conversations.sort((a, b) => b.estimatedBytes - a.estimatedBytes)
  }
  return buckets.filter((bucket) => bucket.conversations.length > 0)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 196 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/chat-report.ts lib/chat-report.test.ts package.json
git commit -m "Bucket chat conversations by how long they have been untouched"
```

---

### Task 4: Record the cheap tier with every measurement

**Files:**
- Modify: `lib/directory-samples.ts`
- Modify: `lib/directory-samples.test.ts`
- Modify: `app/api/health/route.ts`

**Interfaces:**
- Consumes: `readChatDbStats` (Task 1); `recordDirectorySample` (existing).
- Produces: `DirectorySample` gains an optional `chatDb?: { pageCount: number; pageSize: number; freePages: number }`; `recordDirectorySample` gains a fourth parameter `chatDb?: DirectorySample["chatDb"]`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/directory-samples.test.ts`:

```ts
test("a chat-db reading rides along in the sample row", () => {
  const store = recordDirectorySample(null, TWO, 1_000, {
    pageCount: 4668163,
    pageSize: 4096,
    freePages: 302,
  })
  assert.deepEqual(store.samples[0].chatDb, { pageCount: 4668163, pageSize: 4096, freePages: 302 })
})

test("a row without a chat-db reading omits the key entirely", () => {
  const store = recordDirectorySample(null, TWO, 1_000)
  assert.equal("chatDb" in store.samples[0], false, "absent means unknown, the same as a capped directory")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test lib/directory-samples.test.ts`
Expected: FAIL — the fourth argument is ignored, so `chatDb` is `undefined` on the row.

- [ ] **Step 3: Extend the pure recorder**

In `lib/directory-samples.ts`, extend the type and the function:

```ts
export type DirectorySample = {
  at: number
  bytes: Record<string, number>
  /** Chat database geometry, when it could be read. Absent means unknown. */
  chatDb?: { pageCount: number; pageSize: number; freePages: number }
}
```

Change the signature to `recordDirectorySample(store: unknown, measurements: Measurement[], now: number, chatDb?: DirectorySample["chatDb"]): DirectoryStore`, and build the appended row as:

```ts
  const sample: DirectorySample = { at: now, bytes }
  if (chatDb) {
    sample.chatDb = chatDb
  }
  return { samples: [...samples, sample].slice(-MAX_SAMPLES) }
```

- [ ] **Step 4: Wire it into the route**

In `app/api/health/route.ts`, add the import:

```ts
import { readChatDbStats } from "@/lib/chat-db"
```

After `const report = gradeMeasurements(measurements, now)`, read the stats and pass them through:

```ts
  // The cheap tier: two queries, about a tenth of a second, no value bytes.
  // Null simply means no chat-db section, exactly like an unmeasurable metric.
  const chatStats = await readChatDbStats(paths.chatDb)
  const chatDb = chatStats
    ? { pageCount: chatStats.pageCount, pageSize: chatStats.pageSize, freePages: chatStats.freePages }
    : undefined
```

Pass `chatDb` as the fourth argument to `recordDirectorySample`, and add to the JSON response alongside the existing fields:

```ts
    chatDb: chatStats
      ? {
          bytes: chatStats.pageCount * chatStats.pageSize,
          freeBytes: chatStats.freePages * chatStats.pageSize,
          conversations: chatStats.conversations.filter((c) => !c.isSubagent).length,
        }
      : null,
```

- [ ] **Step 5: Run the suite and the build**

Run: `npm test`
Expected: PASS, 198 tests.

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add lib/directory-samples.ts lib/directory-samples.test.ts app/api/health/route.ts
git commit -m "Record chat database geometry with every measurement"
```

---

### Task 5: Serve the analyze tier from its own route

No unit test, matching the repo convention that route handlers are not unit-tested. It is verified by running the app.

**Files:**
- Create: `app/api/chat-db/analyze/route.ts`

**Interfaces:**
- Consumes: `readChatDbStats`, `readConversationSizes` (Tasks 1-2); `rankCandidates`, `bucketByDormancy` (Task 3); `cursorPaths` (existing).
- Produces: `GET /api/chat-db/analyze` returning `{ buckets: DormancyBucket[] } | { buckets: null }`.

- [ ] **Step 1: Write the route**

Create `app/api/chat-db/analyze/route.ts`:

```ts
import { homedir } from "node:os"

import { NextResponse } from "next/server"

import { readChatDbStats, readConversationSizes } from "@/lib/chat-db"
import { bucketByDormancy, rankCandidates } from "@/lib/chat-report"
import { cursorPaths } from "@/lib/cursor-paths"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The expensive tier, on its own route so a slow analysis can never delay a
 * measurement. Read-only throughout: this route never writes to state.vscdb.
 */
export async function GET() {
  const paths = cursorPaths(process.platform, homedir(), process.env.APPDATA || undefined)
  const stats = await readChatDbStats(paths.chatDb)
  if (!stats) {
    return NextResponse.json({ buckets: null })
  }
  const sizes = await readConversationSizes(paths.chatDb, rankCandidates(stats))
  if (!sizes) {
    return NextResponse.json({ buckets: null })
  }
  return NextResponse.json({ buckets: bucketByDormancy(stats, sizes, Date.now()) })
}
```

- [ ] **Step 2: Clear any running dev server before starting one**

Per the working agreement, never start a stack on top of its own leftovers — a leftover holds the port and its own build output, and the failure reads as a code error.

Run: `netstat -ano | findstr :43127`
Stop that specific process if one is listed. Do not blanket-kill node processes; other repos' dev servers may belong to the user.

- [ ] **Step 3: Verify against the real database**

Run `npm run dev`, then in a second shell:

```bash
curl -s http://localhost:43127/api/chat-db/analyze | head -c 600
```

Expected: JSON with a `buckets` array. Each bucket has `label`, `minDaysIdle`, `conversations`, `totalEstimatedBytes`. At most 20 conversations across all buckets. The request should return in roughly ten to fifteen seconds on a large database.

- [ ] **Step 4: Verify the measurement route is unaffected**

Run: `curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" http://localhost:43127/api/health`

Expected: `200` in about four to five seconds — the cheap tier adds about a tenth of a second, not twelve. If this takes as long as the analyze route, the expensive queries have leaked into the wrong tier.

- [ ] **Step 5: Stop the dev server**

The missing-database path needs no manual check here: Tasks 1 and 2 both assert
that `readChatDbStats` and `readConversationSizes` return `null` for a
nonexistent file, and this route's only response to `null` is the two
`return NextResponse.json({ buckets: null })` lines you just wrote.

Do **not** edit `lib/cursor-paths.ts` to fake a missing database. An uncommitted
edit to shared source is easy to leave behind, and it would buy no coverage the
unit tests do not already provide.

Stop the dev server.

- [ ] **Step 6: Run the suite and build**

Run: `npm test`
Expected: PASS, 198 tests — this task adds none.

Run: `npm run build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add app/api/chat-db/analyze/route.ts
git commit -m "Serve the conversation ranking from its own route"
```

---

### Task 6: Show the breakdown in the panel

**Files:**
- Modify: `components/health-panel.tsx`
- Modify: `components/panels.test.tsx`

**Interfaces:**
- Consumes: the `chatDb` field on `/api/health` (Task 4); `GET /api/chat-db/analyze` (Task 5); `DormancyBucket` (Task 3); `formatBytes` from `lib/health.ts`.
- Produces: exported `DormancyBuckets({ buckets }: { buckets: DormancyBucket[] })`.

- [ ] **Step 1: Write the failing test**

Append to `components/panels.test.tsx`. **Extend the file's existing
`@/components/health-panel` import line** to also pull in `DormancyBuckets` and
`ChatDbHeadline` — do not add a second import statement, because
`no-duplicate-imports` would fail the lint check at Step 5.

```tsx
// the existing import line becomes:
import { ChatDbHeadline, DormancyBuckets, HealthPanel, TotalTrendLine, TrendLine } from "@/components/health-panel"
import type { DormancyBucket } from "@/lib/chat-report"

const BUCKETS: DormancyBucket[] = [
  {
    label: "Untouched 3+ weeks",
    minDaysIdle: 21,
    totalEstimatedBytes: 1_000_000_000,
    conversations: [
      {
        id: "a",
        messages: 57670,
        estimatedBytes: 1_000_000_000,
        lastUpdatedAt: 1_786_000_000_000,
        isArchived: false,
      },
    ],
  },
]

test("DormancyBuckets marks every size as an estimate and states the method", () => {
  const html = renderToStaticMarkup(<DormancyBuckets buckets={BUCKETS} />)
  assert.match(html, /Untouched 3\+ weeks/)
  assert.match(html, /~/, "a sampled size must never be shown as exact")
  assert.match(html, /57,?670/, "the message count is exact and worth showing")
  assert.match(html, /sampled/i, "the panel states how the size was obtained")
})

test("DormancyBuckets marks an archived conversation rather than hiding it", () => {
  const archived = [
    { ...BUCKETS[0], conversations: [{ ...BUCKETS[0].conversations[0], isArchived: true }] },
  ]
  const html = renderToStaticMarkup(<DormancyBuckets buckets={archived} />)
  assert.match(html, /archived/i)
})

test("DormancyBuckets renders nothing for an empty list", () => {
  assert.equal(renderToStaticMarkup(<DormancyBuckets buckets={[]} />), "")
})

test("HealthPanel shows no conversation breakdown before analysis", () => {
  const html = renderToStaticMarkup(<HealthPanel />)
  assert.doesNotMatch(html, /Untouched/, "a breakdown must not appear before it has been fetched")
})

test("ChatDbHeadline reports true database size, free space, and conversation count", () => {
  const html = renderToStaticMarkup(
    <ChatDbHeadline chatDb={{ bytes: 19_120_795_648, freeBytes: 1_236_992, conversations: 1627 }} />,
  )
  assert.match(html, /17\.8 GB/, "pageCount x pageSize is the true database size")
  assert.match(html, /1,?627 conversations/)
  assert.match(html, /1\.2 MB/, "reclaimable free pages are worth naming")
})
```

The headline exists because the cheap tier already produces these three numbers
on every measurement; without it, the `chatDb` field the route returns is data
nobody reads.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --import ./test/setup-dom.ts --test components/panels.test.tsx`
Expected: FAIL — `DormancyBuckets is not exported`.

- [ ] **Step 3: Add the component**

In `components/health-panel.tsx`, add below `TotalTrendLine`:

```tsx
export function DormancyBuckets({ buckets }: { buckets: DormancyBucket[] }) {
  if (buckets.length === 0) {
    return null
  }
  return (
    <div className="space-y-3">
      {buckets.map((bucket) => (
        <div key={bucket.label}>
          <p className="text-xs font-medium">
            {bucket.label} — {bucket.conversations.length} chat
            {bucket.conversations.length === 1 ? "" : "s"}, ~
            {formatBytes(bucket.totalEstimatedBytes)}
          </p>
          {bucket.conversations.map((conversation) => (
            <p key={conversation.id} className="text-xs text-muted-foreground">
              ~{formatBytes(conversation.estimatedBytes)} · {conversation.messages.toLocaleString()} msgs ·{" "}
              {new Date(conversation.lastUpdatedAt).toLocaleDateString()}
              {conversation.isArchived ? " · archived" : ""}
            </p>
          ))}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Sizes sampled from up to 400 messages per conversation — actual may differ. Delete
        conversations in Cursor; this panel never modifies the database.
      </p>
    </div>
  )
}
```

Add the headline component beside it:

```tsx
export function ChatDbHeadline({
  chatDb,
}: {
  chatDb: { bytes: number; freeBytes: number; conversations: number }
}) {
  return (
    <p className="text-xs text-muted-foreground">
      Chat database: {formatBytes(chatDb.bytes)} · {chatDb.conversations.toLocaleString()}{" "}
      conversations · {formatBytes(chatDb.freeBytes)} reclaimable
    </p>
  )
}
```

`bytes` is `pageCount × pageSize` — the true database size, which is not the
file size on disk, because the file also carries a WAL that folds in only at
checkpoint.

Extend the imports at the top of the file:

```ts
import type { DormancyBucket } from "@/lib/chat-report"
```

- [ ] **Step 4: Wire the analyze action**

Add to `HealthPanel`'s state:

```tsx
  const [buckets, setBuckets] = useState<DormancyBucket[] | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
```

Add the callback beside the existing `measure` callback:

```tsx
  const analyze = useCallback(async () => {
    setAnalyzing(true)
    try {
      const response = await fetch("/api/chat-db/analyze")
      const data = (await response.json()) as { buckets: DormancyBucket[] | null }
      setBuckets(data.buckets)
    } catch {
      setBuckets(null)
    } finally {
      setAnalyzing(false)
    }
  }, [])
```

Inside the `report?.installFound` block, below the findings list, render the action and the result:

```tsx
            <Button variant="outline" size="sm" onClick={analyze} disabled={analyzing}>
              {analyzing ? "Analyzing conversations…" : "Analyze conversations"}
            </Button>
            {report.chatDb ? <ChatDbHeadline chatDb={report.chatDb} /> : null}
            {buckets ? <DormancyBuckets buckets={buckets} /> : null}
```

- [ ] **Step 5: Run the tests, lint, and build**

Run: `npm test`
Expected: PASS, 203 tests.

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Verify in the running app**

Clear any dev server on 43127 first (`netstat -ano | findstr :43127`), then run `npm run dev` and open `http://localhost:43127`.

Click **Measure this install**, then **Analyze conversations**.

Expected: dormancy buckets appear, every size prefixed with `~`, message counts exact, the sampling note visible, and the whole analysis returning in roughly ten to fifteen seconds. Confirm no conversation appears in more than one bucket, and that at most 20 appear in total.

Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add components/health-panel.tsx components/panels.test.tsx
git commit -m "Show which conversations are worth deleting, and how stale they are"
```

---

## Self-Review

**Spec coverage.** Cheap tier → Task 1 and Task 4. Analyze tier → Tasks 2 and 5. Strided sampling and the 4.6× lesson → Task 2 Step 1's third test, which fails under an opening-rows sample. Dormancy buckets, `isSubagent` exclusion, `isArchived` marking → Task 3. Data contract (`chatDb` optional on the sample row) → Task 4. Read-only and fail-closed → Tasks 1-2, asserted by the missing/corrupt/bare-database tests. Panel rendering with `~` and the sampling note → Task 6. Verification riding the sample series → Task 4 records the geometry; reading a trend from it needs no new code, because `summariseTrend` already consumes `{ at, bytes }` series.

**Placeholder scan.** No TBD/TODO. Every code step carries real code; every run step names the command and the expected result.

**Type consistency.** `ChatDbStats` and `ConversationSize` are defined in Task 1-2 and consumed with identical field names in Tasks 3-5. `DormancyBucket`'s four fields are identical in Task 3's definition, Task 5's response, and Task 6's component and fixtures. `recordDirectorySample`'s fourth parameter type matches `DirectorySample["chatDb"]` exactly. `RANKED_LIMIT` is used in Task 3 and asserted as 20 in its test.

**Test count arithmetic.** 175 baseline → 182 (Task 1, +7) → 188 (Task 2, +6) → 196 (Task 3, +8) → 198 (Task 4, +2) → 198 (Task 5, +0 by design) → 203 (Task 6, +5).

**Known weaknesses.** Two, both stated rather than hidden. Task 5 has no automated test, so the tier separation rests on Step 4's timing check — the one that catches expensive queries leaking into the measurement path. And the time caps cannot interrupt a single running query, only skip the next one; Task 1's implementation comment says so plainly instead of implying a guarantee the code cannot make.
