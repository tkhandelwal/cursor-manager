import assert from "node:assert/strict"
import { test } from "node:test"

import { MIN_SPAN_MS, summariseTrend } from "./trend"

const HOUR = 3_600_000
const DAY = 24 * HOUR

test("no trend from fewer than two samples", () => {
  assert.equal(summariseTrend([]), null)
  assert.equal(summariseTrend([{ at: 0, chatDbBytes: 100 }]), null)
})

test("no trend when the span is under the floor", () => {
  const samples = [
    { at: 0, chatDbBytes: 100 },
    { at: MIN_SPAN_MS - 1, chatDbBytes: 900 },
  ]
  assert.equal(summariseTrend(samples), null, "a huge delta over seconds is noise, not a rate")
})

test("a trend at exactly the span floor is reported", () => {
  const trend = summariseTrend([
    { at: 0, chatDbBytes: 100 },
    { at: MIN_SPAN_MS, chatDbBytes: 200 },
  ])
  assert.ok(trend)
  assert.equal(trend.spanMs, MIN_SPAN_MS)
})

test("delta and rate are computed over the full span", () => {
  const trend = summariseTrend([
    { at: 0, chatDbBytes: 1_000 },
    { at: DAY, chatDbBytes: 3_000 },
    { at: 2 * DAY, chatDbBytes: 5_000 },
  ])
  assert.ok(trend)
  assert.equal(trend.deltaBytes, 4_000)
  assert.equal(trend.spanMs, 2 * DAY)
  assert.equal(trend.bytesPerDay, 2_000)
  assert.equal(trend.sampleCount, 3)
  assert.equal(trend.first.chatDbBytes, 1_000)
  assert.equal(trend.last.chatDbBytes, 5_000)
})

test("a shrinking series reports a negative delta", () => {
  const trend = summariseTrend([
    { at: 0, chatDbBytes: 5_000 },
    { at: DAY, chatDbBytes: 1_000 },
  ])
  assert.ok(trend)
  assert.equal(trend.deltaBytes, -4_000)
  assert.equal(trend.bytesPerDay, -4_000)
})

test("out-of-order samples are sorted before summarising", () => {
  const trend = summariseTrend([
    { at: 2 * DAY, chatDbBytes: 5_000 },
    { at: 0, chatDbBytes: 1_000 },
  ])
  assert.ok(trend)
  assert.equal(trend.deltaBytes, 4_000)
  assert.equal(trend.first.at, 0)
})

test("malformed entries are dropped, and the rest still summarise", () => {
  const trend = summariseTrend([
    { at: 0, chatDbBytes: 1_000 },
    { at: "nope", chatDbBytes: 2_000 },
    { chatDbBytes: 3_000 },
    null,
    "garbage",
    { at: DAY, chatDbBytes: 2_000 },
  ] as unknown)
  assert.ok(trend)
  assert.equal(trend.sampleCount, 2)
  assert.equal(trend.deltaBytes, 1_000)
})

test("a valid at paired with a malformed chatDbBytes is dropped", () => {
  const trend = summariseTrend([
    { at: 0, chatDbBytes: 1_000 },
    { at: HOUR, chatDbBytes: "not a number" },
    { at: HOUR * 2, chatDbBytes: Number.NaN },
    { at: DAY, chatDbBytes: 2_000 },
  ] as unknown)
  assert.ok(trend)
  assert.equal(trend.sampleCount, 2)
  assert.equal(trend.first.at, 0)
  assert.equal(trend.last.at, DAY)
  assert.equal(trend.deltaBytes, 1_000)
})

test("non-array input yields no trend rather than throwing", () => {
  assert.equal(summariseTrend(undefined), null)
  assert.equal(summariseTrend(null), null)
  assert.equal(summariseTrend({ samples: [] }), null)
})
