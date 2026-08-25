import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

import { NextResponse } from "next/server"

import { cursorPaths, type CursorPaths } from "@/lib/cursor-paths"
import { recordDirectorySample, seriesFor } from "@/lib/directory-samples"
import { THRESHOLDS, gradeMeasurements, type Measurement } from "@/lib/health"
import { countDirectories, measurePath } from "@/lib/measure"
import { fromChatDbSamples, summariseTotal, summariseTrend, type Trend } from "@/lib/trend"

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

/** The plugin's sample store. Absent or malformed simply means no trend. */
async function readSamples(home: string): Promise<unknown> {
  try {
    const file = join(home, ".cursor", "cursor-manager", "state.json")
    const parsed = JSON.parse(await readFile(file, "utf8")) as { health?: { samples?: unknown } }
    return parsed?.health?.samples
  } catch {
    return null
  }
}

function directoryFile(home: string) {
  return join(home, ".cursor", "cursor-manager", "directory-samples.json")
}

/** The app's own sample store. Absent or malformed simply means no trend. */
async function readDirectoryStore(home: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(directoryFile(home), "utf8"))
  } catch {
    return null
  }
}

/**
 * Persist the store, or do nothing at all.
 *
 * Writes to a temp file and renames, so a concurrent panel load can never
 * observe a torn file; last-writer-wins on content is fine, because the worst
 * case is one lost sample. Every failure is swallowed on purpose: a trend
 * feature must never turn a working panel into a 500.
 *
 * The directory is created when missing so directory trends work without the
 * plugin installed — unlike the chat-db series, they do not depend on it.
 */
async function writeDirectoryStore(home: string, store: unknown): Promise<void> {
  try {
    const file = directoryFile(home)
    const temp = `${file}.${process.pid}.tmp`
    await mkdir(dirname(file), { recursive: true })
    await writeFile(temp, JSON.stringify(store), "utf8")
    await rename(temp, file)
  } catch {
    // Intentionally ignored.
  }
}

export async function GET() {
  const home = homedir()
  const paths = cursorPaths(process.platform, home, process.env.APPDATA || undefined)

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

  const report = gradeMeasurements(measurements, Date.now())

  // chat-db is excluded here, not inside recordDirectorySample: the plugin owns
  // that series, and a second copy written on a different cadence would be a
  // second source of truth for the same number.
  const directoryMeasurements = measurements.filter((measurement) => measurement.id !== "chat-db")
  const store = recordDirectorySample(
    await readDirectoryStore(home),
    directoryMeasurements,
    Date.now(),
  )
  await writeDirectoryStore(home, store)

  const trend = summariseTrend(fromChatDbSamples(await readSamples(home)))
  const directoryTrends: Record<string, Trend | null> = {}
  for (const measurement of directoryMeasurements) {
    directoryTrends[measurement.id] = summariseTrend(seriesFor(store, measurement.id))
  }

  const totalTrend = summariseTotal([trend, ...Object.values(directoryTrends)])
  return NextResponse.json({ ...report, trend, directoryTrends, totalTrend })
}
