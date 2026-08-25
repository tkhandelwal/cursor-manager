import assert from "node:assert/strict"
import { test } from "node:test"

import { MIN_SPAN_MS, fromChatDbSamples, summariseTotal, summariseTrend, type Trend } from "./trend"

const HOUR = 3_600_000
const DAY = 24 * HOUR

test("no trend from fewer than two samples", () => {
  assert.equal(summariseTrend([]), null)
  assert.equal(summariseTrend([{ at: 0, bytes: 100 }]), null)
})

test("no trend when the span is under the floor", () => {
  const samples = [
    { at: 0, bytes: 100 },
    { at: MIN_SPAN_MS - 1, bytes: 900 },
  ]
  assert.equal(summariseTrend(samples), null, "a huge delta over seconds is noise, not a rate")
})

test("a trend at exactly the span floor is reported", () => {
  const trend = summariseTrend([
    { at: 0, bytes: 100 },
    { at: MIN_SPAN_MS, bytes: 200 },
  ])
  assert.ok(trend)
  assert.equal(trend.spanMs, MIN_SPAN_MS)
})

test("delta and rate are computed over the full span", () => {
  const trend = summariseTrend([
    { at: 0, bytes: 1_000 },
    { at: DAY, bytes: 3_000 },
    { at: 2 * DAY, bytes: 5_000 },
  ])
  assert.ok(trend)
  assert.equal(trend.deltaBytes, 4_000)
  assert.equal(trend.spanMs, 2 * DAY)
  assert.equal(trend.bytesPerDay, 2_000)
  assert.equal(trend.sampleCount, 3)
  assert.equal(trend.first.bytes, 1_000)
  assert.equal(trend.last.bytes, 5_000)
})

test("a shrinking series reports a negative delta", () => {
  const trend = summariseTrend([
    { at: 0, bytes: 5_000 },
    { at: DAY, bytes: 1_000 },
  ])
  assert.ok(trend)
  assert.equal(trend.deltaBytes, -4_000)
  assert.equal(trend.bytesPerDay, -4_000)
})

test("out-of-order samples are sorted before summarising", () => {
  const trend = summariseTrend([
    { at: 2 * DAY, bytes: 5_000 },
    { at: 0, bytes: 1_000 },
  ])
  assert.ok(trend)
  assert.equal(trend.deltaBytes, 4_000)
  assert.equal(trend.first.at, 0)
})

test("malformed entries are dropped, and the rest still summarise", () => {
  const trend = summariseTrend([
    { at: 0, bytes: 1_000 },
    { at: "nope", bytes: 2_000 },
    { bytes: 3_000 },
    null,
    "garbage",
    { at: DAY, bytes: 2_000 },
  ] as unknown)
  assert.ok(trend)
  assert.equal(trend.sampleCount, 2)
  assert.equal(trend.deltaBytes, 1_000)
})

test("a valid at paired with a malformed bytes is dropped", () => {
  const trend = summariseTrend([
    { at: 0, bytes: 1_000 },
    { at: HOUR, bytes: "not a number" },
    { at: HOUR * 2, bytes: Number.NaN },
    { at: DAY, bytes: 2_000 },
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

test("fromChatDbSamples maps the plugin's field onto the shared shape", () => {
  const trend = summariseTrend(
    fromChatDbSamples([
      { at: 0, chatDbBytes: 1_000 },
      { at: DAY, chatDbBytes: 3_000 },
    ]),
  )
  assert.ok(trend)
  assert.equal(trend.deltaBytes, 2_000)
  assert.equal(trend.bytesPerDay, 2_000)
})

test("fromChatDbSamples leaves malformed rows for the sample guard to drop", () => {
  const trend = summariseTrend(
    fromChatDbSamples([
      { at: 0, chatDbBytes: 1_000 },
      { at: HOUR, chatDbBytes: "not a number" },
      null,
      { at: DAY, chatDbBytes: 2_000 },
    ]),
  )
  assert.ok(trend)
  assert.equal(trend.sampleCount, 2, "only the two well-formed rows survive")
})

test("fromChatDbSamples passes a non-array through untouched", () => {
  assert.equal(summariseTrend(fromChatDbSamples(null)), null)
  assert.equal(summariseTrend(fromChatDbSamples({ nope: true })), null)
})

function rate(bytesPerDay: number): Trend {
  return {
    first: { at: 0, bytes: 0 },
    last: { at: DAY, bytes: bytesPerDay },
    deltaBytes: bytesPerDay,
    spanMs: DAY,
    bytesPerDay,
    sampleCount: 2,
  }
}

test("summariseTotal sums the rates of the metrics that have one", () => {
  const total = summariseTotal([rate(100), rate(250), null, null, rate(50)])
  assert.ok(total)
  assert.equal(total.bytesPerDay, 400)
})

test("summariseTotal reports coverage against every metric it was given", () => {
  const total = summariseTotal([rate(100), null, null, null, null])
  assert.ok(total)
  assert.equal(total.covered, 1)
  assert.equal(total.total, 5, "coverage is what stops a dropped metric reading as slower growth")
})

test("summariseTotal is null when no metric qualifies", () => {
  assert.equal(summariseTotal([null, null, null]), null)
  assert.equal(summariseTotal([]), null)
})

test("summariseTotal lets a shrinking metric offset a growing one", () => {
  const total = summariseTotal([rate(500), rate(-200)])
  assert.ok(total)
  assert.equal(total.bytesPerDay, 300)
  assert.equal(total.covered, 2)
})
