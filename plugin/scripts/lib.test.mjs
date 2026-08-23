import assert from "node:assert/strict"
import { test } from "node:test"

import { DEFAULT_SETTINGS, activeCount, capMessage, statusReport } from "./lib.mjs"

function stateWith(count) {
  const conversations = {}
  for (let index = 0; index < count; index += 1) {
    conversations[`conv-${index}`] = { startedAt: index }
  }
  return { conversations }
}

test("activeCount counts tracked conversations", () => {
  assert.equal(activeCount(stateWith(0)), 0)
  assert.equal(activeCount(stateWith(3)), 3)
})

test("capMessage stays under the cap below the limit", () => {
  const message = capMessage(2, DEFAULT_SETTINGS)
  assert.match(message, /2\/5 tracked chats/)
  assert.doesNotMatch(message, /already tracked/)
})

test("capMessage warns once the cap is reached", () => {
  const message = capMessage(5, DEFAULT_SETTINGS)
  assert.match(message, /5 chats are already tracked \(cap 5\)/)
})

test("statusReport shows remaining room below the cap", () => {
  const report = statusReport(stateWith(3), DEFAULT_SETTINGS)
  assert.match(report, /Tracked chats: 3\/5/)
  assert.match(report, /Room for 2 more chats/)
  assert.doesNotMatch(report, /at cap/)
})

test("statusReport uses singular wording for one remaining slot", () => {
  const report = statusReport(stateWith(4), DEFAULT_SETTINGS)
  assert.match(report, /Room for 1 more chat\b/)
})

test("statusReport flags the at-cap state", () => {
  const report = statusReport(stateWith(6), DEFAULT_SETTINGS)
  assert.match(report, /Tracked chats: 6\/5 \(at cap\)/)
  assert.match(report, /At cap: finish or close an older agent/)
})
