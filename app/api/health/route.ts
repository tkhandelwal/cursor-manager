import { homedir } from "node:os"

import { NextResponse } from "next/server"

import { cursorPaths, type CursorPaths } from "@/lib/cursor-paths"
import { THRESHOLDS, gradeMeasurements, type Measurement } from "@/lib/health"
import { countDirectories, measurePath } from "@/lib/measure"

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

export async function GET() {
  const paths = cursorPaths(process.platform, homedir(), process.env.APPDATA || undefined)

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

  return NextResponse.json(gradeMeasurements(measurements, Date.now()))
}
