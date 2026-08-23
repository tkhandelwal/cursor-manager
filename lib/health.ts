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
