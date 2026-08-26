# Chat database breakdown — design

Date: 2026-08-26
Status: approved, not yet implemented
Follows: `2026-08-25-directory-trends-design.md`

## Problem

The health panel reports that `state.vscdb` is 19.7 GB and grades it **bloated**.
Then it points at two Cursor palette commands and stops. It does not know what
is inside the file, which of the commands helped, or whether either of them ran.

That gap was measured, not imagined. On 2026-08-25 the panel said "bloated", the
user ran both palette commands, and the file did not shrink. Answering the
obvious follow-up — *what is actually in there?* — took an hour of hand-written
SQLite queries. Those queries found:

- **9.14 GB** of message bubbles across 1.24 M rows, of which 99.999% belong to
  conversations that still exist. Nothing orphaned, nothing to sweep.
- **10 conversations out of 1,621 holding 67% of all messages.** One had 177,750
  messages in it. Every one of the top ten was an agent-mode conversation.
- **782 KB** of free pages, so `VACUUM` had nothing to recover.

None of that is visible from a file size, and all of it is cheap to obtain.

## What this is not

This design does not delete anything, and the reason is specific rather than
cautious. Those ten conversations are referenced from **more than 35 places** in
Cursor's own state: `composerHeaders`, `composer.planRegistry`,
`glass.localAgentProjectMembership.v1`, `__$__targetStorageMarker`, and roughly
thirty `cursor/glass.tabs.v2/**/state.json` documents. The composer ids are
embedded *inside* those JSON documents, not addressable as keys. Removing a
conversation coherently means editing structures whose invariants only Cursor
knows.

So the division of labour is fixed: **the panel names what is worth deleting;
Cursor deletes it.** The panel never writes to `state.vscdb`.

## The asynchrony discovery

`Developer: GC Agent KV Blobs` does not take effect while you watch. Measured
immediately after it ran, it had freed 3.4 MB, and that reading produced a
confident and wrong conclusion — that the collector was broken and deserved a
bug report. An hour later the same database had lost **181,608 blobs** and
**2.17 GB**, and the page count had dropped, so the space went back to the
filesystem rather than to a free list.

This is a requirement, not an anecdote. **Verification must tolerate lag.** A
feature that re-measures immediately after a cleanup and reports the difference
would have told the user their collector was broken. Verification therefore
rides the sample series rather than a single before/after pair.

## Goals

1. Say what is inside the chat database, not just how large it is.
2. Name the conversations worth deleting, ranked by how long they have been
   untouched, so the user can judge each one.
3. Show that a cleanup worked, on the cleanup's own timescale rather than the
   panel's.

## Non-goals

- **No deletion, and no writes of any kind** to `state.vscdb`. See "What this is
  not".
- **No exact per-conversation byte sizes.** See "Honesty of the size figures".
- **No projection.** Unchanged from the prior two designs.
- **No recommendation about what to keep.** The panel reports size and
  dormancy; only the user knows whether a conversation still matters.
- **No changes to `lib/measure.ts` caps** or to the plugin.

## Two tiers

The tier split exists because the useful queries differ in cost by two orders of
magnitude. All timings below were measured against a real 17.8 GB database with
1.85 M rows.

### Cheap tier — runs with every measurement

| Query | Cost | Yields |
| --- | --- | --- |
| `PRAGMA page_count`, `page_size`, `freelist_count` | 0.0 s | true database size, reclaimable free pages |
| `SELECT … FROM composerHeaders` | 0.1 s | conversation count, `lastUpdatedAt` per conversation, `isArchived`, `isSubagent` |

Two queries, a tenth of a second, no value bytes read. Enough for a headline and
for dormancy counts. This tier is affordable on every "Measure this install",
which already takes about four seconds.

### Analyze tier — explicit action

| Query | Cost | Yields |
| --- | --- | --- |
| bubbles grouped by composer | 6.7 s | exact message count per conversation |
| `SAMPLE_ROWS` (400) sampled values for each of the `RANKED_LIMIT` (20) largest dormant conversations | ~5 s | that conversation's own average message size |

`RANKED_LIMIT = 20` and `SAMPLE_ROWS = 400` are both constants. Twenty is chosen
because the investigation found the top ten conversations already held 67% of all
messages — the tail is long and uniformly small, so ranking further down buys
precision the user cannot act on. Only these twenty are sampled; the rest are
counted in their bucket totals by message count alone and carry no size figure.

About twelve seconds, behind an "Analyze conversations" button. It is not folded
into the measure action: quadrupling a four-second wait for a report the user
did not ask for is the wrong default.

## Honesty of the size figures

Message counts are exact and free. **Sizes are not, and the panel must not
pretend otherwise.**

A per-conversation size comes from that conversation's own sampled average
multiplied by its exact message count. It is rendered with a leading `~`, and
the panel states the method on screen: *sizes sampled from 400 messages per
conversation — actual may differ.*

Sampling is per conversation, never one global average across the database. The
first pass at this used a single global mean of 7,896 bytes; per-conversation
means are the honest version, and cost about five seconds.

**The sample must not be taken in insertion order.** An early estimate during
investigation sampled with `LIMIT 20000` and no `ORDER BY`, which returns the
*oldest* rows by rowid, and the resulting figure was wrong by roughly 4.6×.

Sampling is therefore strided across each conversation's rows: take every
`floor(messages / SAMPLE_ROWS)`th row, so the sample spans the conversation's
whole life rather than its opening. A conversation with fewer than
`SAMPLE_ROWS` messages is measured in full, and its size is exact rather than
estimated — the panel still renders it with `~` for consistency, because the
user should not have to reason about which rows earned a tilde.

Exact sizes are a non-goal: `SUM(length(value))` over the table is the query
that ran for more than ten minutes and timed out twice during investigation.

## Data contract

The cheap tier's two numbers join the existing app-owned sample store, so
verification comes free from machinery that already exists:

```json
{
  "at": 1756000000000,
  "bytes": { "workspace-storage": 4200000000 },
  "chatDb": { "pageCount": 4668163, "pageSize": 4096, "freePages": 302 }
}
```

- `chatDb` is **optional**. Rows written before this ships, or written when the
  database could not be read, simply omit it — the same sparseness rule the
  directory metrics already follow.
- Retention is unchanged: at most one sample per hour, newest 180.

`pageCount × pageSize` is the true database size, and it is the number
verification compares over time. It is not the same as the file size on disk,
which also counts the WAL — a distinction that matters, because the WAL reached
1.4 GB during investigation and folds into the main file only at checkpoint.

## Architecture

The split follows the one already in the codebase: `lib/measure.ts` performs
filesystem I/O while `lib/health.ts` stays pure and holds the judgment.

### `lib/chat-db.ts` — the I/O half

Opens the database **read-only**, runs the queries, returns raw stats. Mirrors
`lib/measure.ts` in both role and failure behaviour:

```ts
export type ChatDbStats = {
  pageCount: number
  pageSize: number
  freePages: number
  conversations: { id: string; lastUpdatedAt: number; isArchived: boolean; isSubagent: boolean }[]
}

export type ConversationSize = { id: string; messages: number; sampledMeanBytes: number }

export async function readChatDbStats(path: string): Promise<ChatDbStats | null>
export async function readConversationSizes(path: string, ids: string[]): Promise<ConversationSize[] | null>
```

Both return `null` — never a partial result — when the database is missing,
unreadable, locked, or when a query exceeds its time cap. This is the same
fail-closed rule `measurePath` follows, and for the same reason: a partial total
must never be presented as complete.

**Time caps**, deliberately separate constants from `lib/measure.ts`'s `MAX_MS`,
because they bound different work and one must be free to change without moving
the other:

- `CHEAP_CAP_MS = 2_000` — the two cheap-tier queries measured 0.1 s together,
  so two seconds is a stall detector, not a budget.
- `ANALYZE_CAP_MS = 30_000` — the analyze tier measured ~12 s on a 17.8 GB
  database. Thirty seconds leaves room for a larger database or a busy disk
  while still failing rather than hanging a request.

A cap is exceeded only when something is wrong; the normal path is nowhere near
either number.

### `lib/chat-report.ts` — the pure half

No clock, no filesystem, no database. Takes stats plus a `now` and returns the
rendered shape:

```ts
export type DormancyBucket = {
  label: string          // "Untouched 3+ weeks"
  minDaysIdle: number
  conversations: { id: string; messages: number; estimatedBytes: number; lastUpdatedAt: number }[]
  totalEstimatedBytes: number
}

export function bucketByDormancy(
  stats: ChatDbStats,
  sizes: ConversationSize[],
  now: number,
): DormancyBucket[]
```

Buckets: untouched 3+ weeks, 1+ week, and active. `estimatedBytes` is
`messages × sampledMeanBytes` — the multiplication lives here, in tested pure
code, not in a component.

### Route and panel

`/api/health` gains the cheap tier's output. A separate `/api/chat-db/analyze`
route serves the expensive tier, so a slow analysis can never delay a
measurement.

The panel renders dormancy buckets with `~` sizes, exact message counts, and the
sampling note. Two flags from `composerHeaders` earn their place:

- `isSubagent` conversations are **excluded from the ranking**. They are children
  of a parent conversation and deleting the parent takes them with it, so listing
  them separately would double-count the reclaim.
- `isArchived` conversations are **listed with an "archived" marker** rather than
  filtered out. Archiving is a signal the user is already done with it, which
  makes it a stronger deletion candidate, not a hidden one. During investigation
  a 1.03 GB conversation was literally named "Archive: LI closeout #89–99".

## Error handling

| Condition | Result |
| --- | --- |
| `state.vscdb` missing or unreadable | No chat-db section; the size metric behaves exactly as today |
| Database locked, or a query exceeds its cap | `null`; the panel shows the section as unavailable, never partial |
| `node:sqlite` throws or is unavailable | Caught in `lib/chat-db.ts`; the panel degrades to the current file-size-only behaviour |
| Conversation in `composerHeaders` with no bubbles | Zero messages, zero estimated bytes; still listed if dormant |
| Sampling returns no rows for a conversation | That conversation shows its exact message count and no size |
| No conversations past a dormancy threshold | That bucket is omitted, not shown empty |

## Testing

TDD, red verified for the right reason before each step.

- `lib/chat-report.test.ts` — `bucketByDormancy`: boundary days, conversations
  omitted when active, subagents excluded, estimate arithmetic, empty buckets
  omitted, malformed stats tolerated.
- `lib/chat-db.test.ts` — against a small fixture database built in the test:
  stats read correctly, `null` on a missing file, `null` on a corrupt file,
  read-only enforcement (a write attempt through the returned handle fails).
- `components/panels.test.tsx` — buckets render with `~` and the sampling note;
  nothing renders when the section is unavailable.
- New test files must be registered in the `package.json` test script.

## Constraints and risks

**`node:sqlite` is experimental.** It emits an `ExperimentalWarning` on use and
its API may change between Node versions. Every call is confined to
`lib/chat-db.ts` and wrapped, so an incompatibility makes the feature
unavailable rather than breaking the panel. Node 22+ is required, which the
project already assumes.

**Reading a live database is safe; writing is not.** Cursor holds `state.vscdb`
open in WAL mode, which permits concurrent readers. Read-only connections are
correct here. This is exactly why the write side is a non-goal rather than a
deferred feature.

**The panel's advice is only as good as Cursor's commands.** If a palette
command silently does nothing, this feature reports that honestly rather than
repeating the advice — which is the whole point.
