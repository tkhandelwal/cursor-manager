import type { Measurement } from "./health"
import type { Sample } from "./trend"

export type DirectorySample = { at: number; bytes: Record<string, number> }
export type DirectoryStore = { samples: DirectorySample[] }

/**
 * Deliberately separate from the plugin's constants of the same name. Coupling
 * them would mean a change to one writer's frequency silently changed the
 * other's retention.
 */
export const SAMPLE_INTERVAL_MS = 3_600_000
export const MAX_SAMPLES = 180

function samplesOf(store: unknown): DirectorySample[] {
  const candidate = store as DirectoryStore | null
  return candidate &&
    typeof candidate === "object" &&
    Array.isArray(candidate.samples)
    ? candidate.samples
    : []
}

/**
 * Append a row of the metrics that were measurable, unless one was taken
 * within the interval.
 *
 * A metric whose walk was missing, unreadable, or capped out arrives as
 * `bytes: null` and is left out of the row entirely. Storing it as 0 would
 * make the next complete walk look like sudden growth; storing the capped
 * total would make it look like a shrink. A sparse row is the honest record of
 * "we do not know".
 */
export function recordDirectorySample(
  store: unknown,
  measurements: Measurement[],
  now: number,
): DirectoryStore {
  const samples = samplesOf(store)
  const newest = samples[samples.length - 1]

  // Absolute difference, matching the plugin: a clock that jumped backwards
  // would otherwise freeze the series until real time caught up.
  if (newest && Math.abs(now - newest.at) < SAMPLE_INTERVAL_MS) {
    return { samples }
  }

  const bytes: Record<string, number> = {}
  for (const measurement of measurements) {
    if (measurement.bytes !== null && Number.isFinite(measurement.bytes)) {
      bytes[measurement.id] = measurement.bytes
    }
  }
  if (Object.keys(bytes).length === 0) {
    return { samples }
  }

  return { samples: [...samples, { at: now, bytes }].slice(-MAX_SAMPLES) }
}

/** One metric's series, skipping the rows where that metric was unknown. */
export function seriesFor(store: unknown, id: string): Sample[] {
  return samplesOf(store)
    .filter(
      (sample) =>
        sample &&
        typeof sample === "object" &&
        sample.bytes &&
        typeof sample.bytes === "object" &&
        Number.isFinite(sample.bytes[id]),
    )
    .map((sample) => ({ at: sample.at, bytes: sample.bytes[id] }))
}
