import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"

/** Caps so a pathological tree cannot hang the request. */
export const MAX_ENTRIES = 50_000
export const MAX_MS = 5_000

/**
 * How many file sizes to read at once.
 *
 * Reading them one at a time is what made ordinary directories exhaust
 * MAX_MS: measured on Windows, a single stat() costs ~13ms (antivirus
 * inspects each file), so a 1,109-file workspaceStorage took 15.2s
 * sequentially against a 5s cap. The same walk with 32 in flight takes
 * 1.5s. The cap is meant to stop a pathological tree hanging the request,
 * not to be a budget that normal directories bump into.
 */
export const STAT_CONCURRENCY = 32

export type MeasureOptions = {
  maxEntries?: number
  maxMs?: number
  now?: () => number
  concurrency?: number
  /** Test seam for reading one file's size, mirroring the `now` seam. */
  statSize?: (path: string) => Promise<number>
}

/**
 * Size of a file, or the recursive total of a directory.
 *
 * Returns null when the path is missing/unreadable OR when a cap is hit OR
 * when anything encountered mid-walk could not be fully accounted for:
 *   - the root directory itself could not be enumerated (permission denied,
 *     locked by another process, etc) — the whole measurement is unreliable,
 *     not just a subtree of it;
 *   - a SUBdirectory could not be enumerated — its contents are skipped so
 *     the walk can still finish, but the resulting total is no longer
 *     complete;
 *   - an entry that is neither a plain file nor a directory (e.g. a
 *     symlink) — it is deliberately NOT traversed or counted (this is what
 *     keeps the walk cycle-safe without a visited-set), but that also means
 *     the total is incomplete;
 *   - a file whose size could not be read for any reason other than it
 *     having been deleted — it is still on disk taking up space we failed
 *     to account for.
 * A file that vanished mid-walk (ENOENT) is the one exception: it is no
 * longer on disk, so omitting it leaves the total both correct and complete.
 * A partial total must never be presented as complete, so all of the above
 * are reported as "unknown" (null), not as a number.
 *
 * The walk runs in two phases: enumerate the tree (readdir only, cheap),
 * then read the collected files' sizes with bounded concurrency. Both
 * phases honour the deadline.
 */
export async function measurePath(
  target: string,
  options: MeasureOptions = {},
): Promise<number | null> {
  const maxEntries = options.maxEntries ?? MAX_ENTRIES
  const maxMs = options.maxMs ?? MAX_MS
  const now = options.now ?? Date.now
  const concurrency = Math.max(1, options.concurrency ?? STAT_CONCURRENCY)
  const statSize = options.statSize ?? (async (path: string) => (await stat(path)).size)

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

  // --- Phase 1: enumerate the tree, collecting the files to measure ---

  const files: string[] = []
  let entries = 0
  let skipped = false
  const stack = [target]
  // The stack starts with exactly one entry (the root), and nothing is
  // pushed before the first pop, so the first iteration always pops the
  // root itself. That lets us tell "the root is unreadable" (fail the
  // whole walk) apart from "a subdirectory found mid-walk is unreadable"
  // (skip it, but the walk is no longer complete).
  let isRootPop = true

  while (stack.length > 0) {
    if (now() > deadline) {
      return null
    }
    const dir = stack.pop() as string
    const isRoot = isRootPop
    isRootPop = false

    let items
    try {
      items = await readdir(dir, { withFileTypes: true })
    } catch {
      if (isRoot) {
        // Root couldn't be enumerated at all (EACCES/EPERM/EBUSY, a locked
        // directory, etc). This is not "skip a subtree and keep going" —
        // the entire measurement is unreliable. A wrong or unmeasurable
        // path must never look like a healthy 0 B install.
        return null
      }
      skipped = true // unreadable subdirectory: its contents are unknown
      continue // keep walking the rest of the tree, but the total is now partial
    }

    for (const item of items) {
      if (now() > deadline) {
        return null
      }
      entries += 1
      if (entries > maxEntries) {
        return null
      }
      const full = join(dir, item.name)
      if (item.isDirectory()) {
        stack.push(full)
      } else if (item.isFile()) {
        files.push(full)
      } else {
        // Neither a file nor a directory as far as Dirent is concerned —
        // notably a symlink, where isFile()/isDirectory() are both false.
        // Deliberately not traversed or counted: that's what makes this
        // walk cycle-safe without a visited-set. But it means the total
        // below is no longer the complete size, so the walk must report
        // unknown rather than a partial number.
        skipped = true
      }
    }
  }

  // --- Phase 2: read the sizes, up to `concurrency` at a time ---

  let next = 0
  let total = 0
  let timedOut = false

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (next < files.length) {
      if (now() > deadline) {
        timedOut = true
        return
      }
      const file = files[next]
      next += 1
      try {
        // NOT `total += await statSize(file)`. That reads `total` before
        // awaiting and assigns after, so concurrent workers clobber each
        // other's additions. Await first, then add in one synchronous step.
        const size = await statSize(file)
        total += size
      } catch (error) {
        // Two very different failures land here and must not be conflated:
        //
        //   ENOENT — the file was deleted between readdir and now. It is
        //     genuinely no longer part of what is on disk, so leaving it out
        //     keeps the total correct and complete.
        //
        //   anything else (EPERM, EACCES, EBUSY, EIO) — the file is still
        //     there with a real size we could not read. Leaving it out makes
        //     the total silently smaller than reality, which could grade a
        //     bloated directory as "ok".
        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
          skipped = true
        }
      }
    }
  })
  await Promise.all(workers)

  if (timedOut) {
    return null
  }

  return skipped ? null : total
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
