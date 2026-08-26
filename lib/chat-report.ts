import { RANKED_LIMIT, type ChatDbStats, type ConversationCount, type ConversationSize } from "./chat-db"

export type RankedConversation = {
  id: string
  messages: number
  estimatedBytes: number
  lastUpdatedAt: number
  isArchived: boolean
}

export type DormancyBucket = {
  label: string
  minDaysIdle: number
  conversations: RankedConversation[]
  totalEstimatedBytes: number
}

const DAY_MS = 24 * 3_600_000

const TIERS = [
  { label: "Untouched 3+ weeks", minDaysIdle: 21 },
  { label: "Untouched 1+ week", minDaysIdle: 7 },
  { label: "Active this week", minDaysIdle: 0 },
]

/**
 * Which conversations are worth the expensive size sample: the biggest ones,
 * by message count, not the most idle. Dormancy is the grouping applied
 * afterward by `bucketByDormancy`, never the selection — a conversation can
 * be huge and idle for years, or huge and touched yesterday, and either way
 * it is the one holding the disk space worth naming.
 *
 * Subagent conversations are excluded: they are children of a parent, and
 * deleting the parent takes them with it, so listing them separately would
 * double-count the reclaim. A conversation absent from `counts` (no sampled
 * messages at all) ranks as zero, not as excluded.
 */
export function rankCandidates(stats: ChatDbStats, counts: ConversationCount[]): string[] {
  const messagesById = new Map(counts.map((count) => [count.id, count.messages]))
  return stats.conversations
    .filter((conversation) => !conversation.isSubagent)
    .sort((a, b) => (messagesById.get(b.id) ?? 0) - (messagesById.get(a.id) ?? 0))
    .slice(0, RANKED_LIMIT)
    .map((conversation) => conversation.id)
}

/**
 * Group the ranked (by size, see `rankCandidates`) conversations by how long
 * they have been untouched. Dormancy is the grouping here, never the
 * selection — `counts` re-derives the same ranked set `rankCandidates`
 * produced so the caller's `sizes` (sampled only for that set) line up.
 *
 * Takes `now` rather than reading a clock, so the buckets are deterministic
 * and testable. Empty tiers are omitted: an empty bucket invites the reader to
 * wonder what belongs in it.
 */
export function bucketByDormancy(
  stats: ChatDbStats,
  counts: ConversationCount[],
  sizes: ConversationSize[],
  now: number,
): DormancyBucket[] {
  const sizeById = new Map(sizes.map((size) => [size.id, size]))
  const ranked = new Set(rankCandidates(stats, counts))

  const buckets = TIERS.map((tier) => ({
    label: tier.label,
    minDaysIdle: tier.minDaysIdle,
    conversations: [] as RankedConversation[],
    totalEstimatedBytes: 0,
  }))

  for (const conversation of stats.conversations) {
    if (!ranked.has(conversation.id)) {
      continue
    }
    // Math.max against 0: a clock skew that puts lastUpdatedAt in the future
    // must read as active, never as a conversation idle for negative days.
    const daysIdle = Math.max(0, (now - conversation.lastUpdatedAt) / DAY_MS)
    const size = sizeById.get(conversation.id)
    const messages = size?.messages ?? 0
    const entry: RankedConversation = {
      id: conversation.id,
      messages,
      estimatedBytes: messages * (size?.sampledMeanBytes ?? 0),
      lastUpdatedAt: conversation.lastUpdatedAt,
      isArchived: conversation.isArchived,
    }
    const bucket = buckets.find((candidate) => daysIdle >= candidate.minDaysIdle)!
    bucket.conversations.push(entry)
    bucket.totalEstimatedBytes += entry.estimatedBytes
  }

  for (const bucket of buckets) {
    bucket.conversations.sort((a, b) => b.estimatedBytes - a.estimatedBytes)
  }
  return buckets.filter((bucket) => bucket.conversations.length > 0)
}
