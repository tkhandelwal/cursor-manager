import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CursorTweaks } from "@/components/cursor-tweaks"
import { CursorignoreGenerator } from "@/components/cursorignore-generator"
import { LaunchFlags } from "@/components/launch-flags"
import { ServiceWorkerRegistrar } from "@/components/service-worker"
import { ExportDialog } from "@/components/export-dialog"
import { HealthPanel } from "@/components/health-panel"
import { SessionApp } from "@/components/session-app"

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
