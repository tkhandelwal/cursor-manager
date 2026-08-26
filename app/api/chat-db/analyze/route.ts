import { homedir } from "node:os"

import { NextResponse } from "next/server"

import { readChatDbStats, readConversationSizes } from "@/lib/chat-db"
import { bucketByDormancy, rankCandidates } from "@/lib/chat-report"
import { cursorPaths } from "@/lib/cursor-paths"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The expensive tier, on its own route so a slow analysis can never delay a
 * measurement. Read-only throughout: this route never writes to state.vscdb.
 */
export async function GET() {
  const paths = cursorPaths(process.platform, homedir(), process.env.APPDATA || undefined)
  const stats = await readChatDbStats(paths.chatDb)
  if (!stats) {
    return NextResponse.json({ buckets: null })
  }
  const sizes = await readConversationSizes(paths.chatDb, rankCandidates(stats))
  if (!sizes) {
    return NextResponse.json({ buckets: null })
  }
  return NextResponse.json({ buckets: bucketByDormancy(stats, sizes, Date.now()) })
}
