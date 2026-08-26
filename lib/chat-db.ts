import { DatabaseSync } from "node:sqlite"

export type ChatDbConversation = {
  id: string
  lastUpdatedAt: number
  isArchived: boolean
  isSubagent: boolean
}

export type ChatDbStats = {
  pageCount: number
  pageSize: number
  freePages: number
  conversations: ChatDbConversation[]
}

/**
 * Budgets, deliberately separate from `lib/measure.ts`'s MAX_MS: they bound
 * different work and one must be free to change without moving the other.
 *
 * Note what these can and cannot do. `node:sqlite` is synchronous and offers no
 * interrupt, and GROUP BY computes fully before yielding a first row, so the
 * budget is checked BETWEEN queries, not within one. A single pathological
 * query can still overrun. This is a real limitation, not a guarantee.
 */
export const CHEAP_CAP_MS = 2_000
export const ANALYZE_CAP_MS = 30_000

/** Conversations ranked and sampled. The tail is long and uniformly small. */
export const RANKED_LIMIT = 20
/**
 * Messages sampled per ranked conversation, taken as the first SAMPLE_ROWS
 * rows in key order. See `readConversationSizes` for why key order is
 * already an unbiased sample and needs no striding.
 */
export const SAMPLE_ROWS = 400

function scalar(db: DatabaseSync, sql: string): number {
  return Number(Object.values(db.prepare(sql).get() as Record<string, unknown>)[0])
}

/**
 * Page geometry and conversation metadata: two queries, about a tenth of a
 * second, no value bytes read.
 *
 * Returns null rather than a partial answer for any failure — missing file,
 * corrupt file, locked database, missing table, or an exhausted budget. A
 * partial total must never be presented as complete.
 */
export async function readChatDbStats(path: string): Promise<ChatDbStats | null> {
  const started = Date.now()
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(path, { readOnly: true })
    const pageCount = scalar(db, "PRAGMA page_count")
    const pageSize = scalar(db, "PRAGMA page_size")
    const freePages = scalar(db, "PRAGMA freelist_count")

    if (Date.now() - started > CHEAP_CAP_MS) {
      return null
    }

    const rows = db
      .prepare(
        "SELECT composerId, lastUpdatedAt, isArchived, isSubagent FROM composerHeaders",
      )
      .all() as Record<string, unknown>[]

    const conversations = rows
      .filter((row) => typeof row.composerId === "string" && Number.isFinite(Number(row.lastUpdatedAt)))
      .map((row) => ({
        id: String(row.composerId),
        lastUpdatedAt: Number(row.lastUpdatedAt),
        isArchived: Boolean(Number(row.isArchived)),
        isSubagent: Boolean(Number(row.isSubagent)),
      }))

    return { pageCount, pageSize, freePages, conversations }
  } catch {
    return null
  } finally {
    db?.close()
  }
}

export type ConversationCount = { id: string; messages: number }

/**
 * Exact message counts for every conversation in the database, not just a
 * candidate set. Ranking by size needs this — the twenty conversations worth
 * sampling in full cannot be chosen without first knowing everyone's count.
 *
 * One GROUP BY over the `bubbleId:<composerId>:<index>` keys, extracting the
 * composer id between the first and second colon. Same failure contract as
 * the other readers: null on any missing/corrupt/locked database or an
 * exhausted budget, never a partial answer.
 */
export async function readConversationCounts(path: string): Promise<ConversationCount[] | null> {
  const started = Date.now()
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(path, { readOnly: true })
    const rows = db
      .prepare(
        "SELECT substr(key, 10, instr(substr(key, 10), ':') - 1) AS id, COUNT(*) AS n " +
          "FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' GROUP BY id",
      )
      .all() as Record<string, unknown>[]

    // GROUP BY computes fully before yielding a first row, so — as with the
    // other readers — this is checked after the one query, not within it.
    if (Date.now() - started > ANALYZE_CAP_MS) {
      return null
    }

    return rows
      .filter((row) => typeof row.id === "string" && row.id.length > 0)
      .map((row) => ({ id: String(row.id), messages: Number(row.n) }))
  } catch {
    return null
  } finally {
    db?.close()
  }
}

export type ConversationSize = {
  id: string
  messages: number
  sampledMeanBytes: number
}

/**
 * Exact message counts, plus each conversation's OWN mean message size.
 *
 * Sampled with a plain `LIMIT` over key-ordered rows, not a stride. This is
 * unbiased ONLY because of a specific fact about the key shape: a bubble key
 * is `bubbleId:<composerId>:<bubbleId>`, and that trailing segment is a
 * random UUID v4 — unrelated to when the message was written or how big it
 * is. Key order is therefore already a uniform random sample of the
 * conversation's content; ordering by key and taking the first SAMPLE_ROWS
 * needs no striding to defeat insertion-order bias, because there is none to
 * defeat.
 *
 * Do NOT "simplify" this back into a stride over `ROW_NUMBER()`: that reads
 * the `value` of every row of the conversation to produce the sample (cost
 * O(all rows), not O(sample)) — for a 177,750-message conversation at ~7.9 KB
 * a message, that is roughly 1.4 GB of blob reads to produce a 400-row
 * sample, paid once per ranked conversation (measured at ~88s total across
 * twenty real conversations, ~2.9x ANALYZE_CAP_MS). A plain `LIMIT` over an
 * index range reads only the rows actually sampled.
 *
 * `LIMIT` WITHOUT `ORDER BY` was the original defect this module worked
 * around (returns rowid/insertion order, wrong by ~4.6x). Ordering by `key`
 * does not have that problem, because of the random-UUID fact above — the
 * fix here is `ORDER BY key LIMIT n`, not a bare `LIMIT n`.
 *
 * Explicit key-range bounds (`key >= lo AND key < hi`) are used rather than
 * `LIKE 'bubbleId:<id>:%'`, so the index range is unambiguous — `LIKE`
 * prefix optimisation depends on collation settings and is not guaranteed.
 *
 * A conversation with fewer rows than SAMPLE_ROWS is measured in full: LIMIT
 * simply returns every row it has.
 */
export async function readConversationSizes(
  path: string,
  ids: string[],
): Promise<ConversationSize[] | null> {
  const started = Date.now()
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(path, { readOnly: true })
    const countOf = db.prepare("SELECT COUNT(*) AS n FROM cursorDiskKV WHERE key >= ? AND key < ?")
    const meanOf = db.prepare(
      "SELECT AVG(length(value)) AS a FROM (" +
        "SELECT value FROM cursorDiskKV WHERE key >= ? AND key < ? ORDER BY key LIMIT ?" +
        ")",
    )

    const sizes: ConversationSize[] = []
    for (const id of ids) {
      // Cap is checked BETWEEN conversations, not within a single query: node:sqlite
      // is synchronous and offers no interrupt, so a single pathological query can
      // still overrun. See the budgets comment above readChatDbStats.
      if (Date.now() - started > ANALYZE_CAP_MS) {
        return null
      }
      // ';' is the character immediately after ':' in ASCII/UTF-8, so this
      // range is exactly the keys prefixed `bubbleId:<id>:`.
      const lo = `bubbleId:${id}:`
      const hi = `bubbleId:${id};`
      const messages = Number((countOf.get(lo, hi) as { n: number }).n)
      if (messages === 0) {
        sizes.push({ id, messages: 0, sampledMeanBytes: 0 })
        continue
      }
      const mean = (meanOf.get(lo, hi, SAMPLE_ROWS) as { a: number | null }).a
      sizes.push({ id, messages, sampledMeanBytes: Math.round(Number(mean ?? 0)) })
    }
    return sizes
  } catch {
    return null
  } finally {
    db?.close()
  }
}
