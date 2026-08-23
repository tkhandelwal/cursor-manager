"use client"

import { useCallback, useEffect, useState } from "react"
import { Activity, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { loadHealthSnapshot, saveHealthSnapshot } from "@/lib/storage"
import { comparableDelta, formatBytes, type Finding, type HealthReport } from "@/lib/health"

const SEVERITY_CLASS: Record<Finding["severity"], string> = {
  ok: "border-border",
  warn: "border-amber-500/60",
  critical: "border-destructive/70",
  unknown: "border-dashed opacity-60",
}

const SEVERITY_LABEL: Record<Finding["severity"], string> = {
  ok: "ok",
  warn: "large",
  critical: "bloated",
  unknown: "could not be measured",
}

export function HealthPanel() {
  const [report, setReport] = useState<HealthReport | null>(null)
  const [previous, setPrevious] = useState<HealthReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore localStorage after mount */
    setPrevious(loadHealthSnapshot())
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const measure = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/health")
      if (!response.ok) {
        throw new Error(`/api/health responded ${response.status}`)
      }
      const next = (await response.json()) as HealthReport
      setPrevious(report ?? loadHealthSnapshot())
      setReport(next)
      saveHealthSnapshot(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not measure this install.")
    } finally {
      setLoading(false)
    }
  }, [report])

  const delta = report && previous ? comparableDelta(report, previous) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4" />
          Install health
        </CardTitle>
        <CardDescription>
          Measures the Cursor data directories on this machine. Nothing is deleted or changed —
          cleanup stays with Cursor&apos;s own palette commands. Size limits below are rules of
          thumb, not official Cursor guidance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={loading} onClick={measure}>
            <RefreshCw />
            {report ? "Re-measure" : "Measure this install"}
          </Button>
          {delta !== null ? (
            <span className="text-xs text-muted-foreground">
              {delta.bytes === 0
                ? "No change since the last measurement."
                : `${delta.bytes < 0 ? "Freed" : "Grew"} ${formatBytes(Math.abs(delta.bytes))} since the last measurement.`}
              {delta.excludedSome ? " (some metrics could not be compared)" : ""}
            </span>
          ) : null}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {report && !report.installFound ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Nothing could be measured at the locations below. This may mean Cursor isn&apos;t
              installed here, or that these paths are unreadable, locked, or the measurement
              timed out — not necessarily that Cursor is missing.
            </p>
            <div className="space-y-1">
              {report.findings.map((finding) => (
                <p key={finding.id} className="font-mono text-xs break-all text-muted-foreground">
                  {finding.label}: {finding.path}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {report?.installFound ? (
          <div className="space-y-2">
            {report.findings.map((finding) => (
              <div
                key={finding.id}
                className={`rounded-xl border px-3 py-2 ${SEVERITY_CLASS[finding.severity]}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{finding.label}</span>
                  <span className="font-mono text-sm">
                    {finding.bytes === null ? "unmeasured" : formatBytes(finding.bytes)}
                  </span>
                </div>
                <p className="font-mono text-xs break-all text-muted-foreground">{finding.path}</p>
                <p className="text-xs text-muted-foreground">
                  {SEVERITY_LABEL[finding.severity]}
                  {finding.detail ? ` · ${finding.detail}` : ""}
                </p>
                {finding.guidance ? (
                  <p className="mt-1 text-xs">{finding.guidance}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
