import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir, userInfo } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"

import { countDirectories, measurePath } from "./measure"

const roots: string[] = []

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cursor-manager-measure-"))
  roots.push(dir)
  return dir
}

// Windows has no chmod-based "unreadable directory" the way POSIX does, but
// denying "List folder / Read data" via icacls makes readdir() throw EPERM,
// which is what a locked-by-another-process or ACL-restricted Cursor cache
// directory looks like in practice. Only meaningful on win32; skipped
// elsewhere rather than faked, since a faked failure wouldn't exercise the
// real fs error path.
const isWindows = process.platform === "win32"
const windowsTest = isWindows ? test : test.skip

function denyListing(dir: string): void {
  execFileSync("icacls", [dir, "/deny", `${userInfo().username}:(RD)`])
}

function restoreListing(dir: string): void {
  try {
    execFileSync("icacls", [dir, "/remove:d", userInfo().username])
  } catch {
    // best-effort cleanup; rm below will still fail loudly if it matters
  }
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

windowsTest(
  "an unreadable ROOT directory measures null, never a healthy-looking 0 B",
  async () => {
    const root = await fixture()
    const locked = join(root, "locked-root")
    await mkdir(locked)
    denyListing(locked)
    try {
      assert.equal(await measurePath(locked), null)
    } finally {
      restoreListing(locked)
    }
  },
)

windowsTest(
  "an unreadable SUBdirectory is skipped but marks the walk incomplete, so the total is null",
  async () => {
    const root = await fixture()
    await writeFile(join(root, "a.bin"), Buffer.alloc(1000))
    const locked = join(root, "locked-child")
    await mkdir(locked)
    await writeFile(join(locked, "b.bin"), Buffer.alloc(500))
    denyListing(locked)
    try {
      assert.equal(await measurePath(root), null)
    } finally {
      restoreListing(locked)
    }
  },
)

test("a symlinked entry is not traversed or counted, and marks the walk incomplete", async () => {
  const root = await fixture()
  await writeFile(join(root, "a.bin"), Buffer.alloc(1000))
  const target = join(root, "real.bin")
  await writeFile(target, Buffer.alloc(500))
  try {
    await symlink(target, join(root, "link.bin"), "file")
  } catch (err) {
    // Symlink creation can require elevated privilege on some Windows
    // configurations; if this environment can't create one, skip rather
    // than falsely pass or fail on an untested path.
    console.warn("skipping symlink test: could not create a symlink:", err)
    return
  }
  assert.equal(await measurePath(root), null)
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

test("file sizes are read concurrently rather than one at a time", async () => {
  const root = await fixture()
  for (let index = 0; index < 24; index += 1) {
    await writeFile(join(root, `f${index}.bin`), Buffer.alloc(10))
  }

  let inFlight = 0
  let maxInFlight = 0
  const statSize = async () => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight -= 1
    return 10
  }

  const total = await measurePath(root, { statSize, concurrency: 8 })

  assert.equal(total, 240, "parallel reads must still sum to the same total")
  assert.ok(maxInFlight > 1, `expected concurrent stats, saw a maximum of ${maxInFlight} in flight`)
})

test("concurrency never exceeds the configured limit", async () => {
  const root = await fixture()
  for (let index = 0; index < 40; index += 1) {
    await writeFile(join(root, `f${index}.bin`), Buffer.alloc(1))
  }

  let inFlight = 0
  let maxInFlight = 0
  const statSize = async () => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 2))
    inFlight -= 1
    return 1
  }

  await measurePath(root, { statSize, concurrency: 4 })

  assert.ok(maxInFlight <= 4, `concurrency limit exceeded: ${maxInFlight} in flight`)
})

test("the time cap still aborts while reading file sizes", async () => {
  const root = await fixture()
  for (let index = 0; index < 10; index += 1) {
    await writeFile(join(root, `f${index}.bin`), Buffer.alloc(100))
  }

  // Stays under the deadline through enumeration, then blows past it once
  // the size-reading phase starts.
  let calls = 0
  const now = () => {
    calls += 1
    return calls <= 3 ? 0 : 10_000
  }

  const result = await measurePath(root, { maxMs: 1_000, now, concurrency: 4 })
  assert.equal(result, null, "a timeout during size reading must not return a partial total")
})

test("a file that exists but cannot be read marks the walk incomplete", async () => {
  const root = await fixture()
  for (const name of ["a.bin", "b.bin"]) {
    await writeFile(join(root, name), Buffer.alloc(100))
  }

  const statSize = async (path: string) => {
    if (path.endsWith("b.bin")) {
      const error = new Error("EPERM: operation not permitted") as NodeJS.ErrnoException
      error.code = "EPERM"
      throw error
    }
    return 100
  }

  const result = await measurePath(root, { statSize })
  assert.equal(
    result,
    null,
    "an unreadable file has a real but unknown size, so 100 would be a partial total presented as complete",
  )
})

test("a file that vanished mid-walk does not mark the walk incomplete", async () => {
  const root = await fixture()
  for (const name of ["a.bin", "b.bin"]) {
    await writeFile(join(root, name), Buffer.alloc(100))
  }

  const statSize = async (path: string) => {
    if (path.endsWith("b.bin")) {
      const error = new Error("ENOENT: no such file or directory") as NodeJS.ErrnoException
      error.code = "ENOENT"
      throw error
    }
    return 100
  }

  const result = await measurePath(root, { statSize })
  assert.equal(result, 100, "a deleted file is genuinely not part of the total, so the total is still complete")
})

test("an unreadable file is reported even when it is the only entry", async () => {
  const root = await fixture()
  await writeFile(join(root, "only.bin"), Buffer.alloc(10))

  const statSize = async () => {
    const error = new Error("EACCES: permission denied") as NodeJS.ErrnoException
    error.code = "EACCES"
    throw error
  }

  assert.equal(await measurePath(root, { statSize }), null, "must not report 0 B for an unreadable file")
})
