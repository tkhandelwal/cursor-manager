import { RANKED_LIMIT, type ChatDbStats, type ConversationSize } from "./chat-db"

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
 * Which conversations are worth the expensive size sample.
 *
 * Subagent conversations are excluded: they are children of a parent, and
 * deleting the parent takes them with it, so listing them separately would
 * double-count the reclaim.
 */
export function rankCandidates(stats: ChatDbStats): string[] {
  return stats.conversations
    .filter((conversation) => !conversation.isSubagent)
    .sort((a, b) => a.lastUpdatedAt - b.lastUpdatedAt)
    .slice(0, RANKED_LIMIT)
    .map((conversation) => conversation.id)
}

/**
 * Group the ranked conversations by how long they have been untouched.
 *
 * Takes `now` rather than reading a clock, so the buckets are deterministic
 * and testable. Empty tiers are omitted: an empty bucket invites the reader to
 * wonder what belongs in it.
 */
export function bucketByDormancy(
  stats: ChatDbStats,
  sizes: ConversationSize[],
  now: number,
): DormancyBucket[] {
  const sizeById = new Map(sizes.map((size) => [size.id, size]))
  const ranked = new Set(rankCandidates(stats))

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
