import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { after, test } from "node:test"

import { SAMPLE_ROWS, readChatDbStats, readConversationCounts, readConversationSizes } from "./chat-db"

const roots: string[] = []

/** Build a throwaway database shaped like Cursor's real one. */
async function fixture(
  conversations: { id: string; lastUpdatedAt: number; isArchived?: boolean; isSubagent?: boolean }[],
  bubbles: { composerId: string; count: number; bytes?: number; value?: string }[] = [],
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cursor-manager-chatdb-"))
  roots.push(dir)
  const file = join(dir, "state.vscdb")
  const db = new DatabaseSync(file)
  db.exec("CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB)")
  db.exec(
    "CREATE TABLE composerHeaders (composerId TEXT, workspaceId TEXT, createdAt INTEGER, lastUpdatedAt INTEGER, isArchived INTEGER, isSubagent INTEGER, recency INTEGER, checkpointAt INTEGER, value BLOB)",
  )
  // Batched in one transaction: 1,600 unbatched inserts (the key-order test
  // below) measured 31,350 ms; the same inserts inside BEGIN/COMMIT measured
  // 24 ms. Without this, this file alone accounted for ~15s of the suite's
  // ~21s runtime.
  db.exec("BEGIN")
  const ins = db.prepare(
    "INSERT INTO composerHeaders (composerId, createdAt, lastUpdatedAt, isArchived, isSubagent) VALUES (?, ?, ?, ?, ?)",
  )
  for (const c of conversations) {
    ins.run(c.id, 0, c.lastUpdatedAt, c.isArchived ? 1 : 0, c.isSubagent ? 1 : 0)
  }
  const insB = db.prepare("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)")
  for (const b of bubbles) {
    for (let i = 0; i < b.count; i += 1) {
      insB.run(`bubbleId:${b.composerId}:${String(i).padStart(8, "0")}`, b.value ?? "x".repeat(b.bytes ?? 10))
    }
  }
  db.exec("COMMIT")
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

test("connection is opened with readOnly: true", async () => {
  const { readFileSync } = await import("node:fs")
  const { fileURLToPath } = await import("node:url")

  const chatDbPath = fileURLToPath(new URL("./chat-db.ts", import.meta.url))
  const moduleSource = readFileSync(chatDbPath, "utf8")

  const totalOpens = (moduleSource.match(/new\s+DatabaseSync\s*\(/g) ?? []).length
  const readOnlyOpens = (
    moduleSource.match(/new\s+DatabaseSync\s*\(\s*path\s*,\s*{\s*readOnly\s*:\s*true/g) ?? []
  ).length
  assert.ok(totalOpens > 0, "expected at least one DatabaseSync call in chat-db.ts")
  assert.equal(
    readOnlyOpens,
    totalOpens,
    "every new DatabaseSync(...) call site must open with { readOnly: true }",
  )
})

test("readConversationCounts counts every conversation's messages, not just a candidate set", async () => {
  const file = await fixture(
    [
      { id: "a", lastUpdatedAt: 1000 },
      { id: "b", lastUpdatedAt: 2000 },
    ],
    [
      { composerId: "a", count: 3 },
      { composerId: "b", count: 177 },
    ],
  )
  const counts = await readConversationCounts(file)
  assert.ok(counts)
  const byId = Object.fromEntries(counts.map((c) => [c.id, c.messages]))
  assert.equal(byId.a, 3)
  assert.equal(byId.b, 177)
})

test("readConversationCounts omits a conversation with no bubbles at all", async () => {
  const file = await fixture(
    [
      { id: "a", lastUpdatedAt: 1000 },
      { id: "empty", lastUpdatedAt: 2000 },
    ],
    [{ composerId: "a", count: 5 }],
  )
  const counts = await readConversationCounts(file)
  assert.ok(counts)
  assert.deepEqual(
    counts.map((c) => c.id),
    ["a"],
    "a conversation with zero bubble rows has nothing to GROUP BY, so it is simply absent",
  )
})

test("readConversationCounts on a missing database is unknown, not an error", async () => {
  assert.equal(await readConversationCounts(join(tmpdir(), "definitely-not-here.vscdb")), null)
})

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

/** Deterministic PRNG (mulberry32) so the shuffle below is reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates over 0..n-1, seeded so the same shuffle comes back every run. */
function shuffledIndices(n: number, seed: number): number[] {
  const rand = mulberry32(seed)
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

test("the sample takes the key-ordered head, which is unbiased because keys are random relative to content", async () => {
  // Real bubble keys end in a random UUID v4 — unrelated to insertion order
  // or message size. Reproduce that here: value size ramps with INSERTION
  // order (rowid), but each row's KEY position is an independent shuffle of
  // insertion order, exactly like a random UUID would be. A sampler that
  // reads by key order (the fix) should land near the true mean; a sampler
  // that reads by rowid/insertion order (the defect this replaced) would not
  // — the first SAMPLE_ROWS inserted are the SMALLEST SAMPLE_ROWS values.
  const dir = await mkdtemp(join(tmpdir(), "cursor-manager-chatdb-"))
  roots.push(dir)
  const file = join(dir, "keyorder.vscdb")
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
  const keyRank = shuffledIndices(total, 0x5eed1)
  // Batched: see the comment on the same pattern in fixture() above — this is
  // the loop that measured 31,350 ms unbatched.
  db.exec("BEGIN")
  for (let i = 0; i < total; i += 1) {
    // Inserted (rowid) order i has size i+1: true mean over all rows is
    // about total/2. keyRank[i] shuffles where this row lands in KEY order,
    // independent of i, standing in for a random UUID trailer.
    ins.run(`bubbleId:a:${String(keyRank[i]).padStart(8, "0")}`, "x".repeat(i + 1))
  }
  db.exec("COMMIT")
  db.close()

  const sizes = await readConversationSizes(file, ["a"])
  assert.ok(sizes)
  const trueMean = (total + 1) / 2
  assert.ok(
    Math.abs(sizes[0].sampledMeanBytes - trueMean) < trueMean * 0.1,
    `key-ordered sample should land within 10% of ${trueMean}, got ${sizes[0].sampledMeanBytes}`,
  )

  // Prove this test would catch the defect it replaced: a sampler reading
  // insertion (rowid) order instead of key order — i.e. the first SAMPLE_ROWS
  // rows ever inserted — would report a mean far below the true one, because
  // size ramps with insertion order here exactly as it did in the fixture
  // that motivated the original (wrong) striding fix.
  const rowidOrderMean = (SAMPLE_ROWS + 1) / 2
  assert.ok(
    Math.abs(rowidOrderMean - trueMean) > trueMean * 0.1,
    "sanity check: a rowid-ordered sample must be far enough off to fail the assertion above",
  )
})

test("size is measured in bytes, not characters — a multi-byte value is not undercounted", async () => {
  // SQLite's length() on a TEXT value counts CHARACTERS, not bytes — every
  // other fixture in this file inserts plain-ASCII "x" repeats, where the
  // two counts are equal and this file could never have caught a regression
  // back to length(value) instead of length(CAST(value AS BLOB)). This value
  // is chosen so the two genuinely differ (accented Latin, an em dash, and
  // an astral emoji all take more than one byte in UTF-8).
  const value = "héllo—🌍"
  const file = await fixture([{ id: "a", lastUpdatedAt: 1000 }], [{ composerId: "a", count: 3, value }])

  // Confirm, against this exact fixture and this exact SQLite build, that
  // length(value) and length(CAST(value AS BLOB)) actually diverge for this
  // value — so the assertion below is known to exercise the CAST, not pass
  // by coincidence.
  const probe = new DatabaseSync(file, { readOnly: true })
  const { chars, bytes } = probe
    .prepare("SELECT length(value) AS chars, length(CAST(value AS BLOB)) AS bytes FROM cursorDiskKV LIMIT 1")
    .get() as { chars: number; bytes: number }
  probe.close()
  assert.notEqual(chars, bytes, "fixture sanity check: this value must differ in char vs byte length")

  const sizes = await readConversationSizes(file, ["a"])
  assert.ok(sizes)
  assert.equal(
    sizes[0].sampledMeanBytes,
    bytes,
    "the reported size must be the BYTE length SQLite gives a BLOB, not the CHARACTER length it gives a TEXT value",
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
  // messages count differs between a (5) and b (9) on purpose: asserting
  // only sizes.length and sizes[0].id (both echoes of the input id, not of
  // what was actually read) cannot tell "b's own 9 rows" apart from "a's 5",
  // "b's 9 plus a's 5 summed", or any other cross-attribution — only
  // asserting the message COUNT that was actually read can.
  const file = await fixture(
    [
      { id: "a", lastUpdatedAt: 1000 },
      { id: "b", lastUpdatedAt: 2000 },
    ],
    [
      { composerId: "a", count: 5, bytes: 10 },
      { composerId: "b", count: 9, bytes: 10 },
    ],
  )
  const sizes = await readConversationSizes(file, ["b"])
  assert.ok(sizes)
  assert.equal(sizes.length, 1)
  assert.equal(sizes[0].id, "b")
  assert.equal(sizes[0].messages, 9, "must be b's own count, not a's, and not the two summed")
})

test("a conversation id that is a prefix of another's is not cross-attributed", async () => {
  // This is exactly the risk the explicit key-range bounds (key >= lo AND
  // key < hi) exist to handle, per the comment on readConversationSizes: "a"
  // is a literal prefix of "ab", so a naive prefix match (e.g. `LIKE
  // 'bubbleId:' || id || '%'` without the delimiting colon) would pull ab's
  // rows into a's result too.
  const file = await fixture(
    [
      { id: "a", lastUpdatedAt: 1000 },
      { id: "ab", lastUpdatedAt: 2000 },
    ],
    [
      { composerId: "a", count: 3, bytes: 10 },
      { composerId: "ab", count: 40, bytes: 10 },
    ],
  )
  const sizes = await readConversationSizes(file, ["a"])
  assert.ok(sizes)
  assert.equal(sizes.length, 1)
  assert.equal(sizes[0].id, "a")
  assert.equal(sizes[0].messages, 3, "\"a\"'s count must not include \"ab\"'s 40 rows")
})

test("a missing database is unknown", async () => {
  assert.equal(await readConversationSizes(join(tmpdir(), "nope.vscdb"), ["a"]), null)
})
