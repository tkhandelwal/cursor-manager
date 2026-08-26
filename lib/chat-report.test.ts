import assert from "node:assert/strict"
import { test } from "node:test"

import type { ChatDbStats, ConversationCount, ConversationSize } from "./chat-db"
import { bucketByDormancy, rankCandidates } from "./chat-report"

const DAY = 24 * 3_600_000
const NOW = 1_800_000_000_000

function stats(conversations: ChatDbStats["conversations"]): ChatDbStats {
  return { pageCount: 1000, pageSize: 4096, freePages: 10, conversations }
}

function conv(id: string, daysIdle: number, extra: Partial<ChatDbStats["conversations"][0]> = {}) {
  return { id, lastUpdatedAt: NOW - daysIdle * DAY, isArchived: false, isSubagent: false, ...extra }
}

function count(id: string, messages: number): ConversationCount {
  return { id, messages }
}

test("subagent conversations are never ranked, even when they are the larger one", () => {
  const ids = rankCandidates(stats([conv("a", 30), conv("sub", 30, { isSubagent: true })]), [
    count("a", 100),
    count("sub", 500),
  ])
  assert.deepEqual(ids, ["a"], "deleting the parent takes its subagents, so listing them double-counts")
})

test("ranking is capped and ordered by message count", () => {
  const many = Array.from({ length: 40 }, (_, i) => conv("c" + i, i + 1))
  const counts = many.map((c, i) => count(c.id, i + 1))
  const ids = rankCandidates(stats(many), counts)
  assert.equal(ids.length, 20, "RANKED_LIMIT")
  assert.equal(ids[0], "c39", "the largest conversation ranks first")
})

test("a large recently-used conversation outranks a small, very old one", () => {
  // This is the exact case that shipped broken: ranking by idleness surfaced
  // ancient empty stubs while the conversation actually holding the disk
  // space — touched yesterday — was never even sampled.
  const ids = rankCandidates(stats([conv("ancient-empty", 400), conv("huge-recent", 1)]), [
    count("ancient-empty", 2),
    count("huge-recent", 177_750),
  ])
  assert.deepEqual(ids, ["huge-recent", "ancient-empty"], "size ranks above idleness")
})

test("a conversation absent from counts ranks as zero, not excluded", () => {
  const ids = rankCandidates(stats([conv("a", 30), conv("b", 5)]), [count("b", 10)])
  assert.deepEqual(ids, ["b", "a"], "a has no counts entry, so it ranks last, but is still present")
})

test("buckets split at three weeks and one week", () => {
  const buckets = bucketByDormancy(
    stats([conv("old", 30), conv("mid", 10), conv("fresh", 2)]),
    [count("old", 100), count("mid", 200), count("fresh", 300)],
    [
      { id: "old", messages: 100, sampledMeanBytes: 1000 },
      { id: "mid", messages: 200, sampledMeanBytes: 1000 },
      { id: "fresh", messages: 300, sampledMeanBytes: 1000 },
    ],
    NOW,
  )
  const byLabel = Object.fromEntries(buckets.map((b) => [b.label, b]))
  assert.deepEqual(Object.keys(byLabel).length, 3)
  assert.equal(byLabel["Untouched 3+ weeks"].conversations[0].id, "old")
  assert.equal(byLabel["Untouched 1+ week"].conversations[0].id, "mid")
  assert.equal(byLabel["Active this week"].conversations[0].id, "fresh")
})

test("estimated bytes are messages times that conversation's own mean", () => {
  const buckets = bucketByDormancy(
    stats([conv("a", 30)]),
    [count("a", 1000)],
    [{ id: "a", messages: 1000, sampledMeanBytes: 7896 }],
    NOW,
  )
  assert.equal(buckets[0].conversations[0].estimatedBytes, 7_896_000)
  assert.equal(buckets[0].totalEstimatedBytes, 7_896_000)
})

test("an empty bucket is omitted, not shown empty", () => {
  const buckets = bucketByDormancy(
    stats([conv("a", 30)]),
    [count("a", 10)],
    [{ id: "a", messages: 10, sampledMeanBytes: 10 }],
    NOW,
  )
  assert.equal(buckets.length, 1)
  assert.equal(buckets[0].label, "Untouched 3+ weeks")
})

test("a conversation with no size entry still appears, with no size claimed", () => {
  const buckets = bucketByDormancy(stats([conv("a", 30)]), [], [], NOW)
  assert.equal(buckets[0].conversations[0].messages, 0)
  assert.equal(buckets[0].conversations[0].estimatedBytes, 0)
})

test("the archived flag survives into the rendered shape", () => {
  const buckets = bucketByDormancy(
    stats([conv("a", 30, { isArchived: true })]),
    [count("a", 10)],
    [{ id: "a", messages: 10, sampledMeanBytes: 10 }],
    NOW,
  )
  assert.equal(buckets[0].conversations[0].isArchived, true)
})

test("a future lastUpdatedAt is treated as active, not as negative idleness", () => {
  const buckets = bucketByDormancy(
    stats([conv("a", -5)]),
    [count("a", 10)],
    [{ id: "a", messages: 10, sampledMeanBytes: 10 }],
    NOW,
  )
  assert.equal(buckets[0].label, "Active this week", "a clock skew must not manufacture a stale chat")
})
