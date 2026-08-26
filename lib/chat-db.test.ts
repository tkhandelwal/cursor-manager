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
