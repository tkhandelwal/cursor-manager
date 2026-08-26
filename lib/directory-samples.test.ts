import assert from "node:assert/strict"
import { test } from "node:test"

import {
  MAX_SAMPLES,
  SAMPLE_INTERVAL_MS,
  recordDirectorySample,
  seriesFor,
} from "./directory-samples"
import type { Measurement } from "./health"

const HOUR = 3_600_000

function measurement(id: string, bytes: number | null): Measurement {
  return { id, label: id, path: `/tmp/${id}`, bytes }
}

const TWO = [measurement("cache", 100), measurement("blob-storage", 200)]

test("the first sample is appended to an empty store", () => {
  const store = recordDirectorySample(null, TWO, 1_000)
  assert.equal(store.samples.length, 1)
  assert.deepEqual(store.samples[0], { at: 1_000, bytes: { cache: 100, "blob-storage": 200 } })
})

test("a sample taken inside the interval is skipped", () => {
  const first = recordDirectorySample(null, TWO, 0)
  const second = recordDirectorySample(first, TWO, SAMPLE_INTERVAL_MS - 1)
  assert.equal(second.samples.length, 1, "the panel can be reloaded far more often than the hour")
})

test("a sample is recorded once the interval has passed", () => {
  const first = recordDirectorySample(null, TWO, 0)
  const second = recordDirectorySample(first, TWO, SAMPLE_INTERVAL_MS)
  assert.equal(second.samples.length, 2)
})

test("a backward clock jump does not freeze sampling", () => {
  const first = recordDirectorySample(null, TWO, 10 * HOUR)
  const second = recordDirectorySample(first, TWO, 0)
  assert.equal(second.samples.length, 2, "a clock moved backwards must not stall the series")
})

test("a metric that could not be measured is omitted, not stored as zero", () => {
  const store = recordDirectorySample(
    null,
    [measurement("cache", null), measurement("blob-storage", 200)],
    1_000,
  )
  assert.deepEqual(store.samples[0].bytes, { "blob-storage": 200 })
  assert.equal("cache" in store.samples[0].bytes, false, "a capped walk must not enter the series")
})

test("no row is written when every metric is unmeasurable", () => {
  const store = recordDirectorySample(null, [measurement("cache", null)], 1_000)
  assert.equal(store.samples.length, 0)
})

test("the series is capped at MAX_SAMPLES, keeping the newest", () => {
  let store = recordDirectorySample(null, TWO, 0)
  for (let i = 1; i <= MAX_SAMPLES + 5; i += 1) {
    store = recordDirectorySample(store, [measurement("cache", i)], i * SAMPLE_INTERVAL_MS)
  }
  assert.equal(store.samples.length, MAX_SAMPLES)
  assert.equal(store.samples[store.samples.length - 1].bytes.cache, MAX_SAMPLES + 5)
})

test("a malformed store is treated as empty rather than throwing", () => {
  assert.equal(recordDirectorySample({ samples: "nope" }, TWO, 0).samples.length, 1)
  assert.equal(recordDirectorySample("garbage", TWO, 0).samples.length, 1)
})

test("seriesFor pulls one metric out and skips the rows that lack it", () => {
  const store = {
    samples: [
      { at: 0, bytes: { cache: 100, "blob-storage": 1 } },
      { at: HOUR, bytes: { "blob-storage": 2 } },
      { at: 2 * HOUR, bytes: { cache: 300 } },
    ],
  }
  assert.deepEqual(seriesFor(store, "cache"), [
    { at: 0, bytes: 100 },
    { at: 2 * HOUR, bytes: 300 },
  ])
})

test("seriesFor returns an empty series for an unknown metric or malformed store", () => {
  assert.deepEqual(seriesFor({ samples: [{ at: 0, bytes: { cache: 1 } }] }, "nope"), [])
  assert.deepEqual(seriesFor(null, "cache"), [])
})

test("a chat-db reading rides along in the sample row", () => {
  const store = recordDirectorySample(null, TWO, 1_000, {
    pageCount: 4668163,
    pageSize: 4096,
    freePages: 302,
  })
  assert.deepEqual(store.samples[0].chatDb, { pageCount: 4668163, pageSize: 4096, freePages: 302 })
})

test("a row without a chat-db reading omits the key entirely", () => {
  const store = recordDirectorySample(null, TWO, 1_000)
  assert.equal("chatDb" in store.samples[0], false, "absent means unknown, the same as a capped directory")
})
