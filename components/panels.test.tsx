import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { CursorTweaks } from "@/components/cursor-tweaks"
import { CursorignoreGenerator } from "@/components/cursorignore-generator"
import { LaunchFlags } from "@/components/launch-flags"
import { ServiceWorkerRegistrar } from "@/components/service-worker"
import { ExportDialog } from "@/components/export-dialog"
import { HealthPanel, TrendLine } from "@/components/health-panel"
import { SessionApp } from "@/components/session-app"
import type { Trend } from "@/lib/trend"

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
    first: { at: 0, chatDbBytes: 1_000 },
    last: { at: 2 * DAY, chatDbBytes: 3_000 },
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
