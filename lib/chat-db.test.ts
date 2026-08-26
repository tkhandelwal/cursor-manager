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
