import { ArrowUpRight, Check, CircleDashed, GitBranch } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { COMPLETED_DELIVERY_STEPS, PRODUCT_DELIVERY_STEPS } from "@/lib/dashboard"
import { cn } from "@/lib/utils"

const STATUS_URL =
  "https://github.com/tkhandelwal/cursor-manager/blob/main/docs/ARC-STATUS.md"

export function DeliveryPanel() {
  const total = PRODUCT_DELIVERY_STEPS.length
  const completion = `${COMPLETED_DELIVERY_STEPS} of ${total}`
  const percent = (COMPLETED_DELIVERY_STEPS / total) * 100

  return (
    <Card
      id="session-delivery"
      role="region"
      aria-labelledby="session-delivery-title"
      tabIndex={-1}
      className="relative scroll-mt-20 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-muted">
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <CardHeader className="gap-3 pt-2 sm:grid sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="space-y-1">
          <p className="font-mono text-[0.68rem] tracking-[0.22em] text-muted-foreground uppercase">
            Build ledger · repository snapshot
          </p>
          <CardTitle id="session-delivery-title" className="text-xl">
            Product delivery
          </CardTitle>
          <CardDescription>
            What has shipped across the plugin, conductor, CI, and this companion dashboard.
          </CardDescription>
        </div>
        <div className="flex items-baseline gap-2 sm:text-right">
          <span className="font-mono text-3xl font-semibold tracking-tight">{completion}</span>
          <span className="text-xs text-muted-foreground">steps complete</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div
          role="progressbar"
          aria-label={`Delivery plan: ${completion} steps complete`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={COMPLETED_DELIVERY_STEPS}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div aria-hidden="true" className="h-full bg-primary" style={{ width: `${percent}%` }} />
        </div>

        <ol className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCT_DELIVERY_STEPS.map((step) => {
            const complete = step.status === "complete"
            return (
              <li key={step.number} className="min-w-0 bg-card p-3.5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(step.number).padStart(2, "0")}
                  </span>
                  <Badge variant={complete ? "secondary" : "outline"}>
                    {complete ? <Check aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
                    {complete ? "Complete" : "Evaluation deferred"}
                  </Badge>
                </div>
                <p className="font-medium">{step.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
              </li>
            )
          })}
        </ol>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch aria-hidden="true" className="size-3.5" />
            Snapshot from docs/ARC-STATUS.md · not live pipeline state
          </p>
          <a
            href={STATUS_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
          >
            Open source record
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </CardContent>
    </Card>
  )
}
