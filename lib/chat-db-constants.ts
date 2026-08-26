/**
 * Constants shared between the I/O half (`lib/chat-db.ts`), the pure half
 * (`lib/chat-report.ts`), and the client panel (`components/health-panel.tsx`).
 *
 * Deliberately kept in their own module with no imports of any kind.
 * `lib/chat-db.ts` imports `node:sqlite` at module scope, and a "use client"
 * component that value-imports anything from it — even just a number — pulls
 * the whole module graph, `node:sqlite` included, into the browser bundle.
 * Turbopack cannot chunk a Node built-in for the browser and fails the build
 * outright ("the chunking context (unknown) does not support external
 * modules (request: node:sqlite)"). Importing these four numbers from here
 * instead keeps the panel able to state its own method on screen without
 * touching `node:sqlite`.
 */

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
/**
 * This budget is checked independently inside `readConversationCounts` and
 * `readConversationSizes` — each reader starts its own timer. The two calls
 * made per `/api/chat-db/analyze` request can therefore together take up to
 * roughly 2x this value; the constant bounds each reader, not the request.
 */
export const ANALYZE_CAP_MS = 30_000

/** Conversations ranked and sampled. The tail is long and uniformly small. */
export const RANKED_LIMIT = 20
/**
 * Messages sampled per ranked conversation, taken as the first SAMPLE_ROWS
 * rows in key order. See `readConversationSizes` for why key order is
 * already an unbiased sample and needs no striding.
 */
export const SAMPLE_ROWS = 400
