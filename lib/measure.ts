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
