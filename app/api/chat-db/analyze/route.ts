import { homedir } from "node:os"

import { NextResponse } from "next/server"

import { readChatDbStats, readConversationCounts, readConversationSizes } from "@/lib/chat-db"
import { bucketByDormancy, rankCandidates } from "@/lib/chat-report"
import { cursorPaths } from "@/lib/cursor-paths"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The expensive tier, on its own route so a slow analysis can never delay a
 * measurement. Read-only throughout: this route never writes to state.vscdb.
 *
 * stats -> counts -> rank by size -> sample those ids -> bucket by dormancy.
 * Ranking needs message counts for every conversation (not just the sampled
 * twenty) so the biggest conversations are the ones selected, not merely the
 * most idle ones.
 */
export async function GET() {
  const paths = cursorPaths(process.platform, homedir(), process.env.APPDATA || undefined)
  const stats = await readChatDbStats(paths.chatDb)
  if (!stats) {
    return NextResponse.json({ buckets: null })
  }
  const counts = await readConversationCounts(paths.chatDb)
  if (!counts) {
    return NextResponse.json({ buckets: null })
  }
  const sizes = await readConversationSizes(paths.chatDb, rankCandidates(stats, counts))
  if (!sizes) {
    return NextResponse.json({ buckets: null })
  }
  return NextResponse.json({ buckets: bucketByDormancy(stats, counts, sizes, Date.now()) })
}
