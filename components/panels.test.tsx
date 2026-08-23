import assert from "node:assert/strict"
import { test } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { CursorTweaks } from "@/components/cursor-tweaks"
import { CursorignoreGenerator } from "@/components/cursorignore-generator"
import { ExportDialog } from "@/components/export-dialog"
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

test("ExportDialog renders its trigger label", () => {
  const html = renderToStaticMarkup(
    <ExportDialog content="{}" title="Demo" description="desc" trigger={<span>Open export</span>} />,
  )
  assert.match(html, /Open export/)
})

test("SessionApp renders the seeded dashboard end to end", () => {
  const html = renderToStaticMarkup(<SessionApp />)
  assert.match(html, /Session Guard/)
  assert.match(html, /Auth timeout/)
  assert.match(html, /Agents/)
  assert.match(html, /Cursor tweaks/)
  assert.match(html, /Cursorignore/)
  assert.match(html, /Activity/)
})
