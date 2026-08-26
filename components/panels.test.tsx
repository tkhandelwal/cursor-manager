import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { CursorTweaks } from "@/components/cursor-tweaks"
import { CursorignoreGenerator } from "@/components/cursorignore-generator"
import { LaunchFlags } from "@/components/launch-flags"
import { ServiceWorkerRegistrar } from "@/components/service-worker"
import { ExportDialog } from "@/components/export-dialog"
import { ChatDbHeadline, DormancyBuckets, HealthPanel, TotalTrendLine, TrendLine } from "@/components/health-panel"
import { SessionApp } from "@/components/session-app"
import type { Trend } from "@/lib/trend"
import type { DormancyBucket } from "@/lib/chat-report"

afterEach(() => {
  cleanup()
})

test("CursorTweaks renders every key, the include count, and the actions", () => {
  const html = renderToStaticMarkup(<CursorTweaks />)
  assert.match(html, /Cursor tweaks/)
  assert.match(html, /cursor\.worktreeMaxCount/)
  assert.match(html, /cursor\.general\.disableHttp2/)
  assert.match(html, /7 of 7 keys will be written/)
  assert.match(html, /Presets/)
  assert.match(html, /Import/)
  assert.match(html, /Export settings\.json/)
})

test("CursorignoreGenerator renders groups, patterns, and export action", () => {
  const html = renderToStaticMarkup(<CursorignoreGenerator />)
  assert.match(html, /Cursorignore/)
  assert.match(html, /Dependencies/)
  assert.match(html, /Secrets/)
  assert.match(html, /node_modules\//)
  assert.match(html, /\.env/)
  assert.match(html, /Export \.cursorignore/)
})

test("LaunchFlags renders every group, flag, and the command preview", () => {
  const html = renderToStaticMarkup(<LaunchFlags />)
  assert.match(html, /Launch flags/)
  assert.match(html, /Performance/)
  assert.match(html, /Troubleshooting/)
  assert.match(html, /--disable-gpu/)
  assert.match(html, /--disable-extensions/)
  assert.match(html, /Copy command/)
})

test("ExportDialog renders its trigger label", () => {
  const html = renderToStaticMarkup(
    <ExportDialog content="{}" title="Demo" description="desc" trigger={<span>Open export</span>} />,
  )
  assert.match(html, /Open export/)
})

test("HealthPanel renders its heading and the heuristic disclaimer", () => {
  const html = renderToStaticMarkup(<HealthPanel />)
  assert.match(html, /Install health/)
  assert.match(html, /rules of thumb/i)
  assert.match(html, /Measure/)
})

test("SessionApp renders the seeded dashboard end to end", () => {
  const html = renderToStaticMarkup(<SessionApp />)
  assert.match(html, /Session Guard/)
  assert.match(html, /Auth timeout/)
  assert.match(html, /Agents/)
  assert.match(html, /Cursor tweaks/)
  assert.match(html, /Cursorignore/)
  assert.match(html, /Launch flags/)
  assert.match(html, /Install health/)
  assert.match(html, /Activity/)
})

test("ServiceWorkerRegistrar server-renders to nothing and touches no browser globals", () => {
  // It reads navigator/document, which do not exist during SSR. If that ran on
  // the server the whole page would fail to render, so this asserts the client
  // boundary holds and that it contributes no markup.
  assert.equal(renderToStaticMarkup(<ServiceWorkerRegistrar />), "")
})

test("HealthPanel renders no trend line before any measurement", () => {
  const html = renderToStaticMarkup(<HealthPanel />)
  assert.doesNotMatch(html, /per day/, "a trend must not appear before there is data")
})

const DAY = 24 * 3_600_000

function growthTrend(): Trend {
  return {
    first: { at: 0, bytes: 1_000 },
    last: { at: 2 * DAY, bytes: 3_000 },
    deltaBytes: 2_000,
    spanMs: 2 * DAY,
    bytesPerDay: 1_000,
    sampleCount: 3,
  }
}

test("TrendLine reads a positive delta as larger, and rounds a fractional rate", () => {
  const trend: Trend = { ...growthTrend(), deltaBytes: 511, bytesPerDay: 510.6382978723404 }
  const html = renderToStaticMarkup(<TrendLine trend={trend} />)
  assert.match(html, /larger/)
  assert.doesNotMatch(html, /smaller/)
  assert.match(html, /≈511 B per day/, "the fractional rate must be rounded before formatting")
})

test("TrendLine reads a negative delta as smaller, not as growth", () => {
  const trend: Trend = {
    ...growthTrend(),
    deltaBytes: -2_000,
    bytesPerDay: -1_000,
  }
  const html = renderToStaticMarkup(<TrendLine trend={trend} />)
  assert.match(html, /smaller/)
  assert.doesNotMatch(html, /larger/)
})

function seededReport(chatDbBytes: number | null) {
  return {
    installFound: true,
    measuredAt: 0,
    findings: [
      {
        id: "chat-db",
        label: "Chat history database",
        path: "/x/state.vscdb",
        bytes: chatDbBytes,
        severity: chatDbBytes === null ? "unknown" : "ok",
        guidance: null,
      },
      {
        id: "workspace-storage",
        label: "Workspace storage",
        path: "/x/workspaceStorage",
        bytes: 4_000,
        severity: "ok",
        guidance: null,
      },
    ],
    trend: growthTrend(),
  }
}

function stubFetch(report: unknown) {
  const original = globalThis.fetch
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => report,
  })) as unknown as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

test("the trend renders under the chat-db finding and nowhere else", async () => {
  const restoreFetch = stubFetch(seededReport(2_000))
  try {
    render(<HealthPanel />)
    fireEvent.click(screen.getByRole("button", { name: "Measure this install" }))
    await screen.findByText(/per day/)

    const chatDbRow = screen.getByText("Chat history database").closest("div")
      ?.parentElement as HTMLElement
    const workspaceRow = screen.getByText("Workspace storage").closest("div")
      ?.parentElement as HTMLElement

    assert.ok(within(chatDbRow).getByText(/per day/), "the trend belongs under chat-db")
    assert.equal(
      within(workspaceRow).queryByText(/per day/),
      null,
      "no other finding may show the trend",
    )
    assert.equal(screen.getAllByText(/per day/).length, 1)
  } finally {
    restoreFetch()
  }
})

test("no trend renders when the chat-db finding itself could not be measured", async () => {
  const restoreFetch = stubFetch(seededReport(null))
  try {
    render(<HealthPanel />)
    fireEvent.click(screen.getByRole("button", { name: "Measure this install" }))
    await screen.findByText("unmeasured")

    assert.equal(
      screen.queryByText(/per day/),
      null,
      "a metric that could not be measured must not also carry a growth claim",
    )
  } finally {
    restoreFetch()
  }
})

test("directoryTrends attribute each metric's own rate to its own row, not another metric's", async () => {
  // Distinguishable on purpose: a transposed lookup (workspace-storage's rate
  // rendered under cached-data, or vice versa) must fail loudly, not pass
  // because both rows happen to show the same number.
  const workspaceTrend: Trend = { ...growthTrend(), deltaBytes: 700, bytesPerDay: 700 }
  const cachedTrend: Trend = { ...growthTrend(), deltaBytes: 2_097_152, bytesPerDay: 2_097_152 }
  const report = {
    installFound: true,
    measuredAt: 0,
    findings: [
      {
        id: "workspace-storage",
        label: "Workspace storage",
        path: "/x/workspaceStorage",
        bytes: 4_000,
        severity: "ok",
        guidance: null,
      },
      {
        id: "cached-data",
        label: "Cached data",
        path: "/x/cachedData",
        bytes: 6_000,
        severity: "ok",
        guidance: null,
      },
    ],
    directoryTrends: {
      "workspace-storage": workspaceTrend,
      "cached-data": cachedTrend,
    },
  }
  const restoreFetch = stubFetch(report)
  try {
    render(<HealthPanel />)
    fireEvent.click(screen.getByRole("button", { name: "Measure this install" }))
    await screen.findAllByText(/per day/)

    const workspaceRow = screen.getByText("Workspace storage").closest("div")
      ?.parentElement as HTMLElement
    const cachedRow = screen.getByText("Cached data").closest("div")?.parentElement as HTMLElement

    // Text spans sibling nodes within the trend line ("≈700 B" then " per
    // day"), so match against the row's full textContent rather than a
    // single-node query.
    assert.match(
      workspaceRow.textContent ?? "",
      /700 B per day/,
      "workspace-storage's own rate must land on its own row",
    )
    assert.doesNotMatch(
      workspaceRow.textContent ?? "",
      /2\.0 MB per day/,
      "cached-data's rate must not leak onto workspace-storage's row",
    )

    assert.match(
      cachedRow.textContent ?? "",
      /2\.0 MB per day/,
      "cached-data's own rate must land on its own row",
    )
    assert.doesNotMatch(
      cachedRow.textContent ?? "",
      /700 B per day/,
      "workspace-storage's rate must not leak onto cached-data's row",
    )
  } finally {
    restoreFetch()
  }
})

test("TrendLine keeps a sub-day span precise enough to agree with the rate", () => {
  // 241.3 MB over 5.52 hours is ≈1.0 GB/day. Rounding the span to a whole
  // "6 hours" made the line self-contradictory: 241.3 MB over a literal six
  // hours is ≈965 MB/day, not the 1.0 GB the same line claims.
  const trend: Trend = {
    first: { at: 0, bytes: 20_281_946_112 },
    last: { at: 5.52 * 3_600_000, bytes: 20_534_951_936 },
    deltaBytes: 253_005_824,
    spanMs: 5.52 * 3_600_000,
    bytesPerDay: 1_100_025_321,
    sampleCount: 2,
  }
  const html = renderToStaticMarkup(<TrendLine trend={trend} />)
  assert.match(html, /5\.5 hours/, "a sub-day span needs one decimal to match its rate")
  assert.doesNotMatch(html, /6 hours/)
})

test("TrendLine drops the decimal on a long sub-day span, as it does for days", () => {
  const trend: Trend = {
    first: { at: 0, bytes: 0 },
    last: { at: 18.4 * 3_600_000, bytes: 1_000 },
    deltaBytes: 1_000,
    spanMs: 18.4 * 3_600_000,
    bytesPerDay: 1_304,
    sampleCount: 2,
  }
  const html = renderToStaticMarkup(<TrendLine trend={trend} />)
  assert.match(html, /18 hours/, "past 10 the decimal is noise, matching the days branch")
})

test("TotalTrendLine states the install-wide rate and its coverage", () => {
  const html = renderToStaticMarkup(
    <TotalTrendLine total={{ bytesPerDay: 511.4, covered: 4, total: 5, through: DAY }} />,
  )
  assert.match(html, /≈511 B/, "the fractional rate must be rounded before formatting")
  assert.match(html, /larger per day/)
  assert.match(html, /4 of 5 metrics/, "coverage must be shown, not implied")
})

test("TotalTrendLine reads a net shrink as smaller, not as growth", () => {
  const html = renderToStaticMarkup(
    <TotalTrendLine total={{ bytesPerDay: -2_000, covered: 5, total: 5, through: DAY }} />,
  )
  assert.match(html, /smaller per day/)
  assert.doesNotMatch(html, /larger/)
})

test("TotalTrendLine dates the rate by the oldest contributor, not the newest", () => {
  const through = 2 * DAY
  const html = renderToStaticMarkup(
    <TotalTrendLine total={{ bytesPerDay: 1_000, covered: 3, total: 5, through }} />,
  )
  assert.match(
    html,
    new RegExp(new Date(through).toLocaleDateString().replace(/\//g, "\\/")),
    "the total line must date itself, the same way TrendLine does",
  )
})

test("TotalTrendLine does not claim a total size it cannot compute honestly", () => {
  const through = 2 * DAY
  const html = renderToStaticMarkup(
    <TotalTrendLine total={{ bytesPerDay: 1_000, covered: 2, total: 5, through }} />,
  )
  // Asserting the full rendered string, not just the absence of one literal
  // wording ("Total:") — a regex for one forbidden phrase lets any other
  // added content (e.g. "Install size: 25.1 GB") through silently.
  assert.equal(
    html,
    `<p class="text-xs text-muted-foreground">Whole install: ≈1000 B larger per day · across 2 of 5 metrics · through ${new Date(through).toLocaleDateString()}</p>`,
  )
})

const BUCKETS: DormancyBucket[] = [
  {
    label: "Untouched 3+ weeks",
    minDaysIdle: 21,
    totalEstimatedBytes: 1_000_000_000,
    conversations: [
      {
        id: "a",
        messages: 57670,
        estimatedBytes: 1_000_000_000,
        lastUpdatedAt: 1_786_000_000_000,
        isArchived: false,
      },
    ],
  },
]

test("DormancyBuckets marks every size as an estimate and states the method", () => {
  const html = renderToStaticMarkup(<DormancyBuckets buckets={BUCKETS} />)
  assert.match(html, /Untouched 3\+ weeks/)
  assert.match(html, /~/, "a sampled size must never be shown as exact")
  assert.match(html, /57,?670/, "the message count is exact and worth showing")
  assert.match(html, /sampled/i, "the panel states how the size was obtained")
  // Two distinct sizes are rendered for a single-conversation bucket: the
  // bucket total and the per-conversation line. A count of one `~` proves
  // only one of the two sites is marked, and would still pass if the other
  // silently dropped its marker.
  assert.equal(
    (html.match(/~/g) ?? []).length,
    2,
    "both the bucket total and the per-conversation size must carry their own estimate marker",
  )
})

test("DormancyBuckets states its scope is the ranked top 20, not a census of the tier", () => {
  // The counts and totals rendered here cover only the ranked candidate set
  // (RANKED_LIMIT = 20 conversations), never every conversation in a tier —
  // lib/chat-report.ts's rankCandidates drops everything outside that set
  // before bucketByDormancy ever sees it. A bucket line reading as "9 chats,
  // ~4.1 GB" states a false total for a 60-chat tier; it must read as a
  // fraction of the ranked set instead.
  const html = renderToStaticMarkup(<DormancyBuckets buckets={BUCKETS} />)
  assert.match(html, /20 largest/, "the panel must name its scope: the top RANKED_LIMIT, not every chat")
  assert.match(
    html,
    /1 of the 20 largest/,
    "the bucket line must read as a fraction of the ranked set, not a standalone count",
  )
  assert.doesNotMatch(
    html,
    /\d+ chats?,/,
    "the old '<n> chats, ~<size>' wording reads as a census of the whole tier and must be gone",
  )
})

test("DormancyBuckets marks an archived conversation rather than hiding it", () => {
  const archived = [
    { ...BUCKETS[0], conversations: [{ ...BUCKETS[0].conversations[0], isArchived: true }] },
  ]
  const html = renderToStaticMarkup(<DormancyBuckets buckets={archived} />)
  assert.match(html, /archived/i)
})

test("DormancyBuckets renders nothing for an empty list", () => {
  assert.equal(renderToStaticMarkup(<DormancyBuckets buckets={[]} />), "")
})

test("HealthPanel shows no conversation breakdown before analysis", () => {
  const html = renderToStaticMarkup(<HealthPanel />)
  assert.doesNotMatch(html, /Untouched/, "a breakdown must not appear before it has been fetched")
  assert.doesNotMatch(
    html,
    /unavailable/i,
    "before any click, this must read as 'not analyzed yet', not as a failed analysis",
  )
})

/** Stub fetch by URL substring, so /api/health and /api/chat-db/analyze can be answered differently. */
function stubFetchRoutes(
  routes: Record<string, () => { ok: boolean; status?: number; json: () => Promise<unknown> }>,
) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString()
    const key = Object.keys(routes).find((candidate) => url.includes(candidate))
    if (!key) {
      throw new Error(`unstubbed fetch in test: ${url}`)
    }
    return routes[key]()
  }) as unknown as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

test("Re-measuring clears a stale conversation breakdown rather than leaving it beside a fresh headline", async () => {
  // health-panel.tsx's measure() must clear `buckets` at its top: otherwise a
  // fresh measurement renders above a breakdown fetched before it, naming
  // conversations that may since have been deleted in Cursor.
  const restoreFetch = stubFetchRoutes({
    "/api/chat-db/analyze": () => ({ ok: true, json: async () => ({ buckets: BUCKETS }) }),
    "/api/health": () => ({ ok: true, json: async () => seededReport(2_000) }),
  })
  try {
    render(<HealthPanel />)
    fireEvent.click(screen.getByRole("button", { name: "Measure this install" }))
    await screen.findByRole("button", { name: "Analyze conversations" })

    fireEvent.click(screen.getByRole("button", { name: "Analyze conversations" }))
    await screen.findByText(/Untouched 3\+ weeks/)

    fireEvent.click(screen.getByRole("button", { name: "Re-measure" }))
    // Compare a boolean, not the queried node itself: a raw DOM/happy-dom
    // node handed to assert.equal is fine while the assertion holds, but if
    // it ever genuinely fails, node:assert tries to util.inspect the node to
    // build a diff, and a live DOM node's circular object graph is
    // catastrophic to inspect — this measurably hung and then OOM'd
    // (RangeError: Array buffer allocation failed) when the assertion was
    // deliberately made to fail during development of this test.
    assert.equal(
      screen.queryByText(/Untouched 3\+ weeks/) === null,
      true,
      "the stale breakdown must be cleared synchronously on click, not left up while re-measuring",
    )
    // Let the second measurement's fetch settle before the test tears down.
    await waitFor(() => screen.getByRole("button", { name: "Re-measure" }))
  } finally {
    restoreFetch()
  }
})

test("An analyze failure is shown as unavailable, distinguishable from never having clicked", async () => {
  // /api/chat-db/analyze fails closed to { buckets: null } for every failure
  // (locked database, cap exceeded, corrupt file) rather than a non-ok
  // status, so the panel must treat a null result as a failure too, not
  // silently render nothing indistinguishable from the pre-click state.
  const restoreFetch = stubFetchRoutes({
    "/api/chat-db/analyze": () => ({ ok: true, json: async () => ({ buckets: null }) }),
    "/api/health": () => ({ ok: true, json: async () => seededReport(2_000) }),
  })
  try {
    render(<HealthPanel />)
    fireEvent.click(screen.getByRole("button", { name: "Measure this install" }))
    await screen.findByRole("button", { name: "Analyze conversations" })

    fireEvent.click(screen.getByRole("button", { name: "Analyze conversations" }))
    await screen.findByText(/unavailable/i)

    assert.equal(
      screen.queryByText(/Untouched/) === null,
      true,
      "a failed analysis must never render a partial breakdown",
    )
  } finally {
    restoreFetch()
  }
})

test("A non-ok analyze response is never rendered as a breakdown, whatever its body says", async () => {
  // A non-ok status is a failure even when its body happens to parse into
  // something bucket-shaped — a cached or proxied error page, a stale body
  // served with a 500. Without the response.ok throw the panel would render
  // that as a real analysis of the user's database, which is worse than
  // showing nothing: it is a confident wrong answer about what to delete.
  const restoreFetch = stubFetchRoutes({
    "/api/chat-db/analyze": () => ({
      ok: false,
      status: 500,
      json: async () => ({
        buckets: [
          {
            label: "Untouched 3+ weeks",
            minDaysIdle: 21,
            conversations: [
              {
                id: "stale",
                messages: 10,
                estimatedBytes: 1_000,
                lastUpdatedAt: 0,
                isArchived: false,
              },
            ],
            totalEstimatedBytes: 1_000,
          },
        ],
      }),
    }),
    "/api/health": () => ({ ok: true, json: async () => seededReport(2_000) }),
  })
  try {
    render(<HealthPanel />)
    fireEvent.click(screen.getByRole("button", { name: "Measure this install" }))
    await screen.findByRole("button", { name: "Analyze conversations" })

    fireEvent.click(screen.getByRole("button", { name: "Analyze conversations" }))
    await screen.findByText(/unavailable/i)

    assert.equal(
      screen.queryByText(/Untouched/) === null,
      true,
      "a breakdown from a non-ok response must never reach the screen",
    )
  } finally {
    restoreFetch()
  }
})

test("A 200 carrying a body with no buckets key is a failure, not an empty success", async () => {
  // `data.buckets` is `undefined` here, not null. Guarded with `=== null` this
  // reads as success and renders nothing at all; the panel must not present a
  // malformed response as a completed analysis that found nothing.
  const restoreFetch = stubFetchRoutes({
    "/api/chat-db/analyze": () => ({ ok: true, json: async () => ({}) }),
    "/api/health": () => ({ ok: true, json: async () => seededReport(2_000) }),
  })
  try {
    render(<HealthPanel />)
    fireEvent.click(screen.getByRole("button", { name: "Measure this install" }))
    await screen.findByRole("button", { name: "Analyze conversations" })

    fireEvent.click(screen.getByRole("button", { name: "Analyze conversations" }))
    await screen.findByText(/unavailable/i)
  } finally {
    restoreFetch()
  }
})

test("ChatDbHeadline reports true database size, free space, and conversation count", () => {
  const html = renderToStaticMarkup(
    <ChatDbHeadline chatDb={{ bytes: 19_120_795_648, freeBytes: 1_236_992, conversations: 1627 }} />,
  )
  assert.match(html, /17\.8 GB/, "pageCount x pageSize is the true database size")
  assert.match(html, /1,?627 top-level conversations/, "the count excludes subagents, and must say so")
  assert.match(html, /1\.2 MB/, "reclaimable free pages are worth naming")
  assert.match(
    html,
    /write-ahead log/i,
    "the headline's own size differs from the file-size finding shown elsewhere on the panel, and must say why",
  )
  // Unanchored substring matches above would still pass if the exact size
  // were rendered as "~17.8 GB" — the opposite honesty failure from the
  // sampled sizes: this number is exact and must never read as an estimate.
  assert.doesNotMatch(html, /[~≈]/, "exact database size must not read as an estimate")
})
