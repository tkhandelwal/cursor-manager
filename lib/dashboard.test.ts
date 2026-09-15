import assert from "node:assert/strict"
import { test } from "node:test"

import {
  COMPLETED_DELIVERY_STEPS,
  DASHBOARD_SECTIONS,
  PRODUCT_DELIVERY_STEPS,
  dashboardSectionHref,
} from "./dashboard"

test("dashboard sections have unique ids and in-page hrefs", () => {
  const ids = DASHBOARD_SECTIONS.map((section) => section.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids[0], "session-delivery")
  assert.ok(ids.includes("session-chats"))
  assert.ok(ids.includes("session-activity"))
  for (const section of DASHBOARD_SECTIONS) {
    assert.ok(section.label.length > 0, `${section.id} needs a label`)
    assert.equal(dashboardSectionHref(section.id), `#${section.id}`)
  }
})

test("delivery snapshot has seven complete steps and one deferred evaluation", () => {
  assert.deepEqual(
    PRODUCT_DELIVERY_STEPS.map((step) => step.number),
    [1, 2, 3, 4, 5, 6, 7, 8],
  )
  assert.equal(COMPLETED_DELIVERY_STEPS, 7)
  assert.equal(PRODUCT_DELIVERY_STEPS.at(-1)?.status, "deferred")
})
