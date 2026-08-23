export type Measurement = {
  id: string
  label: string
  path: string
  bytes: number | null // null = not found, unreadable, or capped out
  detail?: string // optional per-metric note, e.g. "42 directories"
}

export type Severity = "ok" | "warn" | "critical" | "unknown"

export type Finding = Measurement & {
  severity: Severity
  guidance: string | null // display text only; never triggers an action
}

export type HealthReport = {
  findings: Finding[]
  installFound: boolean
  measuredAt: number
}

export type Threshold = {
  id: string
  label: string
  warnBytes: number
  criticalBytes: number
  guidance: string
}

const MB = 1024 ** 2
const GB = 1024 ** 3

/**
 * Rules of thumb, NOT Cursor guidance. Derived from a single real install
 * (17.8 GB state.vscdb, 2026-08-23). Revise here as more installs are seen,
 * and keep the UI honest that these are heuristics.
 */
export const THRESHOLDS: Threshold[] = [
  {
    id: "chat-db",
    label: "Chat history database",
    warnBytes: 1 * GB,
    criticalBytes: 5 * GB,
    guidance: "Palette → Developer: Delete Old Chats, then Developer: GC Agent KV Blobs",
  },
  {
    id: "workspace-storage",
    label: "Workspace storage",
    warnBytes: 500 * MB,
    criticalBytes: 2 * GB,
    guidance: "Remove stale workspace folders for repos you no longer have",
  },
  {
    id: "cached-data",
    label: "Cached data",
    warnBytes: 1 * GB,
    criticalBytes: 3 * GB,
    guidance: "Safe to clear while Cursor is closed; it regenerates",
  },
  {
    id: "cache",
    label: "Cache",
    warnBytes: 500 * MB,
    criticalBytes: 2 * GB,
    guidance: "Safe to clear while Cursor is closed; it regenerates",
  },
  {
    id: "blob-storage",
    label: "Blob storage",
    warnBytes: 500 * MB,
    criticalBytes: 2 * GB,
    guidance: "Safe to clear while Cursor is closed; it regenerates",
  },
]

export function gradeMeasurements(measurements: Measurement[], at: number): HealthReport {
  const findings: Finding[] = measurements.map((measurement) => {
    const threshold = THRESHOLDS.find((entry) => entry.id === measurement.id)
    if (measurement.bytes === null || !threshold) {
      return { ...measurement, severity: "unknown", guidance: null }
    }
    if (measurement.bytes >= threshold.criticalBytes) {
      return { ...measurement, severity: "critical", guidance: threshold.guidance }
    }
    if (measurement.bytes >= threshold.warnBytes) {
      return { ...measurement, severity: "warn", guidance: threshold.guidance }
    }
    return { ...measurement, severity: "ok", guidance: null }
  })

  return {
    findings,
    installFound: findings.some((finding) => finding.bytes !== null),
    measuredAt: at,
  }
}

export function totalBytes(report: HealthReport): number {
  return report.findings.reduce((sum, finding) => sum + (finding.bytes ?? 0), 0)
}

export type Delta = {
  /** Sum of (current - previous) across only the ids comparable on both sides. */
  bytes: number
  /**
   * True when at least one metric id could not be compared (null on either
   * side, or present on only one side) and was therefore excluded from
   * `bytes`. Callers must surface this so the delta is never silently
   * presented as covering more than it does.
   */
  excludedSome: boolean
}

/**
 * Byte delta between two health reports, computed only over metric ids that
 * have a non-null `bytes` in BOTH reports.
 *
 * The 5,000 ms traversal cap is wall-clock and therefore nondeterministic:
 * the same real install can measure a metric on one run and cap it out
 * (null) on the next. Naively treating null as 0 (the way totalBytes does,
 * by design, for its own callers) would make a capped-out metric look like
 * it dropped to zero — announcing bytes "freed" that were never freed. This
 * function exists specifically to avoid that: an incomparable id is
 * excluded from the sum entirely rather than counted as 0 on either side.
 *
 * Returns null when there is nothing comparable at all, so callers can
 * choose to show no delta rather than a delta over zero metrics.
 */
export function comparableDelta(current: HealthReport, previous: HealthReport): Delta | null {
  const previousById = new Map(previous.findings.map((finding) => [finding.id, finding]))
  const seenPreviousIds = new Set<string>()

  let bytes = 0
  let comparedCount = 0
  let excludedSome = false

  for (const finding of current.findings) {
    const prior = previousById.get(finding.id)
    if (prior) {
      seenPreviousIds.add(finding.id)
    }
    if (!prior || finding.bytes === null || prior.bytes === null) {
      excludedSome = true
      continue
    }
    bytes += finding.bytes - prior.bytes
    comparedCount += 1
  }

  // An id present only in the previous report (e.g. a metric that vanished
  // from this build) is also incomparable and must be flagged, even though
  // it contributes nothing to the sum.
  if (previous.findings.some((finding) => !seenPreviousIds.has(finding.id))) {
    excludedSome = true
  }

  if (comparedCount === 0) {
    return null
  }

  return { bytes, excludedSome }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—"
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(1)} ${units[index]}`
}
