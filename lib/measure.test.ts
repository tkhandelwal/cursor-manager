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

test("exceeding the time cap while iterating a flat directory returns null", async () => {
  const root = await fixture()
  // Create multiple files to trigger stat() calls in the for loop
  for (let i = 0; i < 5; i += 1) {
    await writeFile(join(root, `f${i}.bin`), Buffer.alloc(100))
  }

  let callCount = 0
  const now = () => {
    callCount += 1
    if (callCount === 1) {
      // First call: stat() of root at the beginning (line 31)
      return 0
    }
    if (callCount === 2) {
      // Second call: while loop check (line 49), should still be under deadline
      return 100
    }
    // All subsequent calls: exceed the deadline
    return 2000
  }

  assert.equal(await measurePath(root, { maxMs: 1000, now }), null)
})
