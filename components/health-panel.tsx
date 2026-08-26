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
import type { Trend, TotalTrend } from "@/lib/trend"
import type { DormancyBucket } from "@/lib/chat-report"
import { RANKED_LIMIT, SAMPLE_ROWS } from "@/lib/chat-db-constants"

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

/**
 * One decimal below 10, none above. A span rounded coarser than this stops
 * agreeing with the rate printed beside it — 241.3 MB over a whole "6 hours"
 * reads as ≈965 MB a day, not the 1.0 GB the same line claims.
 */
function precise(value: number) {
  return value.toFixed(value >= 10 ? 0 : 1)
}

export function TrendLine({ trend }: { trend: Trend }) {
  const days = trend.spanMs / (24 * 3_600_000)
  const span =
    days >= 1 ? `${precise(days)} days` : `${precise(trend.spanMs / 3_600_000)} hours`
  const direction = trend.deltaBytes < 0 ? "smaller" : "larger"
  // The window this rate was observed over can be arbitrarily stale (plugin
  // disabled, app not opened in months) — display the end date alongside the
  // rate so a live current size is never read as paired with a live rate.
  const to = new Date(trend.last.at).toLocaleDateString()
  return (
    <p className="text-xs text-muted-foreground">
      {formatBytes(Math.abs(trend.deltaBytes))} {direction} over {span} · ≈
      {formatBytes(Math.round(Math.abs(trend.bytesPerDay)))} per day · {trend.sampleCount} samples · to {to}
    </p>
  )
}

export function TotalTrendLine({ total }: { total: TotalTrend }) {
  const direction = total.bytesPerDay < 0 ? "smaller" : "larger"
  // No total size here on purpose: totalBytes sums `finding.bytes ?? 0`, so an
  // unmeasured metric would quietly shrink the headline instead of making it
  // unknown — the same shape as the 0 B and phantom-savings failures already
  // removed from this codebase.
  //
  // Same staleness caveat as TrendLine, but dated by the oldest contributor,
  // not the newest: a summed rate is only as fresh as its stalest input, so
  // showing the freshest date here would read a possibly months-old
  // contribution as current.
  const through = new Date(total.through).toLocaleDateString()
  return (
    <p className="text-xs text-muted-foreground">
      Whole install: ≈{formatBytes(Math.round(Math.abs(total.bytesPerDay)))} {direction} per day ·
      across {total.covered} of {total.total} metrics · through {through}
    </p>
  )
}

export function DormancyBuckets({ buckets }: { buckets: DormancyBucket[] }) {
  if (buckets.length === 0) {
    return null
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        The {RANKED_LIMIT} largest conversations, grouped by staleness.
      </p>
      {buckets.map((bucket) => (
        <div key={bucket.label}>
          <p className="text-xs font-medium">
            {bucket.label} — {bucket.conversations.length} of the {RANKED_LIMIT} largest — ~
            {formatBytes(bucket.totalEstimatedBytes)}
          </p>
          {bucket.conversations.map((conversation) => (
            <p key={conversation.id} className="text-xs text-muted-foreground">
              ~{formatBytes(conversation.estimatedBytes)} · {conversation.messages.toLocaleString()} msgs ·{" "}
              {new Date(conversation.lastUpdatedAt).toLocaleDateString()}
              {conversation.isArchived ? " · archived" : ""}
            </p>
          ))}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Sizes sampled from up to {SAMPLE_ROWS} messages per conversation — actual may differ. Delete
        conversations in Cursor; this panel never modifies the database.
      </p>
    </div>
  )
}

export function ChatDbHeadline({
  chatDb,
}: {
  chatDb: { bytes: number; freeBytes: number; conversations: number }
}) {
  return (
    <p className="text-xs text-muted-foreground">
      Pages in use: {formatBytes(chatDb.bytes)} (excludes the separate write-ahead log file) ·{" "}
      {chatDb.conversations.toLocaleString()} top-level conversations · {formatBytes(chatDb.freeBytes)}{" "}
      reclaimable
    </p>
  )
}

type HealthResponse = HealthReport & {
  trend?: Trend | null
  directoryTrends?: Record<string, Trend | null>
  totalTrend?: TotalTrend | null
  chatDb?: { bytes: number; freeBytes: number; conversations: number } | null
}

export function HealthPanel() {
  const [report, setReport] = useState<HealthResponse | null>(null)
  const [previous, setPrevious] = useState<HealthReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [buckets, setBuckets] = useState<DormancyBucket[] | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeFailed, setAnalyzeFailed] = useState(false)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore localStorage after mount */
    setPrevious(loadHealthSnapshot())
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const measure = useCallback(async () => {
    setLoading(true)
    setError("")
    // A stale breakdown must not survive a re-measure: the conversations it
    // names may have been deleted in Cursor since it was fetched, and it was
    // never re-validated against this fresh measurement.
    setBuckets(null)
    setAnalyzeFailed(false)
    try {
      const response = await fetch("/api/health")
      if (!response.ok) {
        throw new Error(`/api/health responded ${response.status}`)
      }
      const next = (await response.json()) as HealthResponse
      setPrevious(report ?? loadHealthSnapshot())
      setReport(next)
      saveHealthSnapshot(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not measure this install.")
    } finally {
      setLoading(false)
    }
  }, [report])

  const analyze = useCallback(async () => {
    setAnalyzing(true)
    setAnalyzeFailed(false)
    try {
      const response = await fetch("/api/chat-db/analyze")
      if (!response.ok) {
        throw new Error(`/api/chat-db/analyze responded ${response.status}`)
      }
      const data = (await response.json()) as { buckets: DormancyBucket[] | null }
      setBuckets(data.buckets ?? null)
      // The route itself fails closed to { buckets: null } rather than a
      // non-ok status (locked database, cap exceeded, corrupt file), so a
      // null result here is just as much a failure as a thrown request —
      // otherwise it renders as indistinguishable from never having clicked.
      //
      // Tested with `!data.buckets`, not `=== null`: a 200 carrying a body
      // that parses but has no `buckets` key at all yields `undefined`, which
      // `=== null` reads as success and renders nothing — the exact
      // indistinguishable-from-never-clicked state this guard exists to stop.
      setAnalyzeFailed(!data.buckets)
    } catch {
      setBuckets(null)
      setAnalyzeFailed(true)
    } finally {
      setAnalyzing(false)
    }
  }, [])

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
            {report.totalTrend ? <TotalTrendLine total={report.totalTrend} /> : null}
            {report.findings.map((finding) => {
              const trend =
                finding.id === "chat-db" ? report.trend : report.directoryTrends?.[finding.id]
              return (
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
                  {finding.bytes !== null && trend ? <TrendLine trend={trend} /> : null}
                </div>
              )
            })}
            <Button variant="outline" size="sm" onClick={analyze} disabled={analyzing}>
              {analyzing ? "Analyzing conversations…" : "Analyze conversations"}
            </Button>
            {report.chatDb ? <ChatDbHeadline chatDb={report.chatDb} /> : null}
            {analyzeFailed ? (
              <p className="text-xs text-destructive">
                Conversation analysis unavailable — the database may be locked by Cursor.
              </p>
            ) : null}
            {buckets ? <DormancyBuckets buckets={buckets} /> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
