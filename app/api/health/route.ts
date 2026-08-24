import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import { NextResponse } from "next/server"

import { cursorPaths, type CursorPaths } from "@/lib/cursor-paths"
import { THRESHOLDS, gradeMeasurements, type Measurement } from "@/lib/health"
import { countDirectories, measurePath } from "@/lib/measure"
import { summariseTrend } from "@/lib/trend"

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
  return NextResponse.json({ ...report, trend: summariseTrend(await readSamples(home)) })
}
