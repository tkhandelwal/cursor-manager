import assert from "node:assert/strict"
import { test } from "node:test"

import { DASHBOARD_SECTIONS, dashboardSectionHref } from "./dashboard"

test("dashboard sections have unique ids and in-page hrefs", () => {
  const ids = DASHBOARD_SECTIONS.map((section) => section.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes("session-chats"))
  assert.ok(ids.includes("session-activity"))
  for (const section of DASHBOARD_SECTIONS) {
    assert.ok(section.label.length > 0, `${section.id} needs a label`)
    assert.equal(dashboardSectionHref(section.id), `#${section.id}`)
  }
})
