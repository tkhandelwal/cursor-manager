import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DEFAULT_SETTINGS,
  MAX_SAMPLES,
  SAMPLE_INTERVAL_MS,
  activeCount,
  capMessage,
  cursorDataPaths,
  recordHealthSample,
  statusReport,
} from "./lib.mjs"

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

const HOUR = 3_600_000

function emptyState() {
  return { conversations: {}, health: { samples: [] } }
}

test("cursorDataPaths points at the chat database per platform", () => {
  assert.equal(
    cursorDataPaths("win32", "C:\\Users\\me", "C:\\Users\\me\\AppData\\Roaming").chatDb,
    "C:\\Users\\me\\AppData\\Roaming\\Cursor\\User\\globalStorage\\state.vscdb",
  )
  assert.equal(
    cursorDataPaths("darwin", "/Users/me").chatDb,
    "/Users/me/Library/Application Support/Cursor/User/globalStorage/state.vscdb",
  )
  assert.equal(
    cursorDataPaths("linux", "/home/me").chatDb,
    "/home/me/.config/Cursor/User/globalStorage/state.vscdb",
  )
})

test("an unknown platform falls back to the linux layout rather than throwing", () => {
  assert.equal(
    cursorDataPaths("freebsd", "/home/me").chatDb,
    "/home/me/.config/Cursor/User/globalStorage/state.vscdb",
  )
})

test("recordHealthSample appends the first sample", () => {
  const next = recordHealthSample(emptyState(), 1000, 5 * HOUR)
  assert.deepEqual(next.health.samples, [{ at: 5 * HOUR, chatDbBytes: 1000 }])
})

test("recordHealthSample skips a sample taken inside the interval", () => {
  const state = recordHealthSample(emptyState(), 1000, 5 * HOUR)
  const next = recordHealthSample(state, 2000, 5 * HOUR + SAMPLE_INTERVAL_MS - 1)
  assert.equal(next.health.samples.length, 1, "must not record twice within the interval")
  assert.equal(next.health.samples[0].chatDbBytes, 1000)
})

test("recordHealthSample records again once the interval has passed", () => {
  const state = recordHealthSample(emptyState(), 1000, 5 * HOUR)
  const next = recordHealthSample(state, 2000, 5 * HOUR + SAMPLE_INTERVAL_MS)
  assert.equal(next.health.samples.length, 2)
  assert.deepEqual(next.health.samples[1], { at: 5 * HOUR + SAMPLE_INTERVAL_MS, chatDbBytes: 2000 })
})

test("recordHealthSample caps the series at MAX_SAMPLES, keeping the newest", () => {
  let state = emptyState()
  for (let index = 0; index < MAX_SAMPLES + 25; index += 1) {
    state = recordHealthSample(state, index, index * SAMPLE_INTERVAL_MS)
  }
  assert.equal(state.health.samples.length, MAX_SAMPLES)
  assert.equal(
    state.health.samples[state.health.samples.length - 1].chatDbBytes,
    MAX_SAMPLES + 24,
    "the newest sample must survive the cap",
  )
  assert.ok(
    state.health.samples[0].chatDbBytes > 0,
    "the oldest samples are the ones dropped",
  )
})

test("recordHealthSample leaves conversations untouched", () => {
  const state = { conversations: { a: { startedAt: 1 } }, health: { samples: [] } }
  const next = recordHealthSample(state, 10, HOUR)
  assert.deepEqual(next.conversations, { a: { startedAt: 1 } })
})

test("recordHealthSample tolerates a state with no health key", () => {
  const next = recordHealthSample({ conversations: {} }, 10, HOUR)
  assert.equal(next.health.samples.length, 1)
})

test("recordHealthSample ignores a non-finite size rather than storing junk", () => {
  const next = recordHealthSample(emptyState(), Number.NaN, HOUR)
  assert.equal(next.health.samples.length, 0)
})
