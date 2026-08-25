export type Sample = { at: number; bytes: number }

export type Trend = {
  first: Sample
  last: Sample
  deltaBytes: number
  spanMs: number
  bytesPerDay: number
  sampleCount: number
}

/** Below these, a "rate" would be noise wearing a number's clothes. */
export const MIN_SAMPLES = 2
export const MIN_SPAN_MS = 3_600_000

const DAY_MS = 24 * 3_600_000

function isSample(value: unknown): value is Sample {
  const candidate = value as Sample | null
  return (
    !!candidate &&
    typeof candidate === "object" &&
    Number.isFinite(candidate.at) &&
    Number.isFinite(candidate.bytes)
  )
}

/**
 * Reduce a sample series to a growth rate, or null when the data does not
 * support one. Takes no clock: every value derives from the samples, so it is
 * deterministic.
 *
 * Deliberately reports no projection. Extrapolating a threshold-crossing date
 * from a short, noisy series manufactures a confident number the data has not
 * earned.
 */
export function summariseTrend(samples: unknown): Trend | null {
  if (!Array.isArray(samples)) {
    return null
  }

  const valid = samples.filter(isSample).sort((a, b) => a.at - b.at)
  if (valid.length < MIN_SAMPLES) {
    return null
  }

  const first = valid[0]
  const last = valid[valid.length - 1]
  const spanMs = last.at - first.at
  if (spanMs < MIN_SPAN_MS) {
    return null
  }

  const deltaBytes = last.bytes - first.bytes
  return {
    first,
    last,
    deltaBytes,
    spanMs,
    bytesPerDay: (deltaBytes / spanMs) * DAY_MS,
    sampleCount: valid.length,
  }
}

/**
 * The plugin's series stores { at, chatDbBytes }; every series the app writes
 * itself stores { at, bytes }. Normalise at the read boundary so trend.ts
 * knows exactly one shape.
 *
 * Returns `unknown` on purpose: rows are not validated here, so a malformed
 * row reaches `isSample` and is dropped by the guard that already exists
 * rather than by a second, divergent copy of that logic.
 */
export function fromChatDbSamples(raw: unknown): unknown {
  if (!Array.isArray(raw)) {
    return raw
  }
  return raw.map((row) => {
    if (!row || typeof row !== "object") {
      return row
    }
    const source = row as { at?: unknown; chatDbBytes?: unknown }
    return { at: source.at, bytes: source.chatDbBytes }
  })
}

export type TotalTrend = {
  bytesPerDay: number
  /** Metrics contributing a rate. */
  covered: number
  /** Metrics the panel grades, whether or not they have a rate. */
  total: number
  /**
   * The oldest `last.at` among the contributing trends — deliberately the
   * oldest, not the newest. A summed rate is only as fresh as its stalest
   * input: one metric's series can go quiet (plugin disabled, app not opened
   * in months) while the rest keep advancing, and the sum inherits that
   * staleness from the moment the stale one stopped, not from whenever the
   * freshest metric last updated.
   */
  through: number
}

/**
 * Sum the per-metric rates into one install-wide rate.
 *
 * Deliberately not a summed delta. The plugin writes the chat-db series
 * hourly, the app writes the directory series on panel load, so their
 * timestamps never align and there is no instant at which a true install total
 * existed to difference against another. Rates are computed over each metric's
 * own span, and rates add.
 *
 * `covered` is load-bearing: without it, a metric dropping out of the sum
 * reads as the install growing more slowly.
 */
export function summariseTotal(trends: (Trend | null)[]): TotalTrend | null {
  const present = trends.filter((trend): trend is Trend => trend !== null)
  if (present.length === 0) {
    return null
  }
  return {
    bytesPerDay: present.reduce((sum, trend) => sum + trend.bytesPerDay, 0),
    covered: present.length,
    total: trends.length,
    through: Math.min(...present.map((trend) => trend.last.at)),
  }
}
