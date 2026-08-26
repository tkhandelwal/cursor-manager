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
/** Messages sampled per ranked conversation, strided across its whole life. */
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
 * The sample is strided — every nth row across the conversation's whole life —
 * not the first N. Sampling in insertion order returns the oldest rows and
 * produced an estimate wrong by roughly 4.6x during investigation. A
 * conversation with fewer rows than SAMPLE_ROWS is measured in full.
 */
export async function readConversationSizes(
  path: string,
  ids: string[],
): Promise<ConversationSize[] | null> {
  const started = Date.now()
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(path, { readOnly: true })
    const countOf = db.prepare("SELECT COUNT(*) AS n FROM cursorDiskKV WHERE key LIKE ?")
    const meanOf = db.prepare(
      "SELECT AVG(length(value)) AS a FROM (" +
        "SELECT value, ROW_NUMBER() OVER (ORDER BY key) AS rn FROM cursorDiskKV WHERE key LIKE ?" +
        ") WHERE (rn - 1) % ? = 0",
    )

    const sizes: ConversationSize[] = []
    for (const id of ids) {
      // Cap is checked BETWEEN conversations, not within a single query: node:sqlite
      // is synchronous and offers no interrupt, so a single pathological query can
      // still overrun. See the budgets comment above readChatDbStats.
      if (Date.now() - started > ANALYZE_CAP_MS) {
        return null
      }
      const like = `bubbleId:${id}:%`
      const messages = Number((countOf.get(like) as { n: number }).n)
      if (messages === 0) {
        sizes.push({ id, messages: 0, sampledMeanBytes: 0 })
        continue
      }
      const stride = Math.max(1, Math.floor(messages / SAMPLE_ROWS))
      const mean = (meanOf.get(like, stride) as { a: number | null }).a
      sizes.push({ id, messages, sampledMeanBytes: Math.round(Number(mean ?? 0)) })
    }
    return sizes
  } catch {
    return null
  } finally {
    db?.close()
  }
}
