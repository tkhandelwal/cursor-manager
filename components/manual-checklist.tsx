"use client"

import { useEffect, useMemo, useState } from "react"
import { ListChecks, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { loadChecklist, saveChecklist } from "@/lib/storage"
import {
  MANUAL_GROUPS,
  MANUAL_STEPS,
  completedCount,
  defaultChecklistState,
  type ChecklistState,
} from "@/lib/manual-steps"

export function ManualChecklist() {
  const [hydrated, setHydrated] = useState(false)
  const [done, setDone] = useState<ChecklistState>(defaultChecklistState)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore localStorage after mount */
    setDone(loadChecklist())
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    saveChecklist(done)
  }, [hydrated, done])

  const completed = useMemo(() => completedCount(done), [done])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-4" />
          Manual checklist
        </CardTitle>
        <CardDescription>
          Controls with no <span className="font-mono">settings.json</span> key — set these in the UI
          or run them from the command palette, and tick them off as you go.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {MANUAL_GROUPS.map((group) => (
          <div key={group} className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group}</p>
            {MANUAL_STEPS.filter((step) => step.group === group).map((step) => (
              <div
                key={step.id}
                className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
              >
                <div className="min-w-0">
                  <Label className={`text-sm ${done[step.id] ? "text-muted-foreground line-through" : ""}`}>
                    {step.label}
                  </Label>
                  <p className="font-mono text-xs text-muted-foreground">{step.where}</p>
                </div>
                <Switch
                  aria-label={step.label}
                  checked={done[step.id] ?? false}
                  onCheckedChange={(checked) =>
                    setDone((current) => ({ ...current, [step.id]: checked }))
                  }
                />
              </div>
            ))}
          </div>
        ))}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {completed} of {MANUAL_STEPS.length} done.
          </p>
          <Button variant="ghost" onClick={() => setDone(defaultChecklistState())}>
            <RotateCcw />
            Reset checklist
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
