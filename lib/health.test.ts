import assert from "node:assert/strict"
import { test } from "node:test"

import {
  THRESHOLDS,
  comparableDelta,
  formatBytes,
  gradeMeasurements,
  totalBytes,
  type Measurement,
} from "./health"

const GB = 1024 ** 3
const MB = 1024 ** 2

function measurement(id: string, bytes: number | null): Measurement {
  return { id, label: id, path: `/fake/${id}`, bytes }
}

test("every threshold has a positive warn below its critical", () => {
  assert.ok(THRESHOLDS.length > 0)
  const ids = new Set<string>()
  for (const t of THRESHOLDS) {
    assert.ok(!ids.has(t.id), `duplicate threshold id ${t.id}`)
    ids.add(t.id)
    assert.ok(t.warnBytes > 0, `${t.id} warn must be positive`)
    assert.ok(t.criticalBytes > t.warnBytes, `${t.id} critical must exceed warn`)
    assert.ok(t.guidance.length > 0, `${t.id} needs guidance`)
  }
})

test("grades ok below warn, warn at the boundary, critical at the boundary", () => {
  const t = THRESHOLDS.find((entry) => entry.id === "chat-db")
  assert.ok(t)

  const report = gradeMeasurements(
    [
      measurement("chat-db", t.warnBytes - 1),
      measurement("workspace-storage", 0),
      measurement("cached-data", 0),
    ],
    1_000,
  )
  assert.equal(report.findings[0].severity, "ok")

  assert.equal(
    gradeMeasurements([measurement("chat-db", t.warnBytes)], 1_000).findings[0].severity,
    "warn",
  )
  assert.equal(
    gradeMeasurements([measurement("chat-db", t.criticalBytes)], 1_000).findings[0].severity,
    "critical",
  )
})

test("a null measurement is unknown, never ok", () => {
  const report = gradeMeasurements([measurement("chat-db", null)], 1_000)
  assert.equal(report.findings[0].severity, "unknown")
  assert.equal(report.findings[0].guidance, null)
})

test("guidance appears only when the metric is over a threshold", () => {
  const t = THRESHOLDS.find((entry) => entry.id === "chat-db")
  assert.ok(t)
  assert.equal(gradeMeasurements([measurement("chat-db", 0)], 1).findings[0].guidance, null)
  assert.equal(
    gradeMeasurements([measurement("chat-db", t.criticalBytes)], 1).findings[0].guidance,
    t.guidance,
  )
})

test("installFound is false when nothing could be measured", () => {
  const none = gradeMeasurements(
    [measurement("chat-db", null), measurement("cache", null)],
    1_000,
  )
  assert.equal(none.installFound, false)

  const some = gradeMeasurements(
    [measurement("chat-db", null), measurement("cache", 10)],
    1_000,
  )
  assert.equal(some.installFound, true)
})

test("an unrecognised id grades unknown rather than throwing", () => {
  const report = gradeMeasurements([measurement("not-a-metric", 5 * GB)], 1_000)
  assert.equal(report.findings[0].severity, "unknown")
})

test("totalBytes sums only measurable entries", () => {
  const report = gradeMeasurements(
    [measurement("chat-db", 100), measurement("cache", null), measurement("cached-data", 50)],
    1_000,
  )
  assert.equal(totalBytes(report), 150)
})

test("measuredAt is carried through", () => {
  assert.equal(gradeMeasurements([], 4_242).measuredAt, 4_242)
})

test("formatBytes scales and keeps one decimal above bytes", () => {
  assert.equal(formatBytes(0), "0 B")
  assert.equal(formatBytes(1023), "1023 B")
  assert.equal(formatBytes(1024), "1.0 KB")
  assert.equal(formatBytes(1024 ** 2), "1.0 MB")
  assert.equal(formatBytes(1024 ** 3), "1.0 GB")
  assert.equal(formatBytes(Math.round(17.4 * 1024 ** 3)), "17.4 GB")
})

test("formatBytes renders a dash for values it cannot show", () => {
  assert.equal(formatBytes(-1), "—")
  assert.equal(formatBytes(Number.NaN), "—")
})

test("comparableDelta excludes a metric that is null in either report, and sums the rest", () => {
  // workspace-storage caps out (null) on the second run: a real, nondeterministic
  // scenario from the traversal time cap. It must not be treated as "freed 114 MB".
  const previous = gradeMeasurements(
    [
      measurement("chat-db", 200),
      measurement("workspace-storage", 114 * MB),
      measurement("cache", 50),
    ],
    1_000,
  )
  const current = gradeMeasurements(
    [
      measurement("chat-db", 150),
      measurement("workspace-storage", null),
      measurement("cache", 50),
    ],
    2_000,
  )

  const delta = comparableDelta(current, previous)
  assert.ok(delta)
  // Only chat-db (200->150, -50) and cache (50->50, 0) are comparable.
  // workspace-storage must be excluded entirely, not treated as -114 MB "freed".
  assert.equal(delta.bytes, -50)
  assert.equal(delta.excludedSome, true)
})

test("comparableDelta returns null when nothing is comparable between the two reports", () => {
  const previous = gradeMeasurements(
    [measurement("chat-db", null), measurement("cache", null)],
    1_000,
  )
  const current = gradeMeasurements(
    [measurement("chat-db", null), measurement("cache", null)],
    2_000,
  )
  assert.equal(comparableDelta(current, previous), null)
})

test("comparableDelta reports no exclusions when every id compares cleanly", () => {
  const previous = gradeMeasurements([measurement("chat-db", 100)], 1_000)
  const current = gradeMeasurements([measurement("chat-db", 80)], 2_000)
  const delta = comparableDelta(current, previous)
  assert.ok(delta)
  assert.equal(delta.bytes, -20)
  assert.equal(delta.excludedSome, false)
})
