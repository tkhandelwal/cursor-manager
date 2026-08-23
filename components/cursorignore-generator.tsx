"use client"

import { useEffect, useMemo, useState } from "react"
import { FileCog, RotateCcw } from "lucide-react"

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
import { ExportDialog } from "@/components/export-dialog"
import { loadIgnore, saveIgnore } from "@/lib/storage"
import {
  IGNORE_ENTRIES,
  IGNORE_GROUPS,
  buildCursorignore,
  defaultIgnoreState,
  enabledIgnoreCount,
  type IgnoreState,
} from "@/lib/cursorignore"

export function CursorignoreGenerator() {
  const [hydrated, setHydrated] = useState(false)
  const [ignore, setIgnore] = useState<IgnoreState>(defaultIgnoreState)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore localStorage after mount */
    setIgnore(loadIgnore())
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    saveIgnore(ignore)
  }, [hydrated, ignore])

  const body = useMemo(() => buildCursorignore(ignore), [ignore])
  const count = useMemo(() => enabledIgnoreCount(ignore), [ignore])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCog className="size-4" />
          Cursorignore
        </CardTitle>
        <CardDescription>
          Build a <span className="font-mono">.cursorignore</span> that keeps dependencies, build
          output, big media, and secrets out of Agent, Tab, and @-mentions — without hiding source you
          need.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {IGNORE_GROUPS.map((group) => (
          <div key={group} className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {IGNORE_ENTRIES.filter((entry) => entry.group === group).map((entry) => (
                <div
                  key={entry.pattern}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                    ignore[entry.pattern] ? "border-border" : "border-dashed opacity-60"
                  }`}
                >
                  <div className="min-w-0">
                    <Label className="font-mono text-sm">{entry.pattern}</Label>
                    <p className="text-xs text-muted-foreground">{entry.description}</p>
                  </div>
                  <Switch
                    aria-label={entry.pattern}
                    checked={ignore[entry.pattern] ?? false}
                    onCheckedChange={(checked) =>
                      setIgnore((current) => ({ ...current, [entry.pattern]: checked }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {count} pattern{count === 1 ? "" : "s"} selected.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setIgnore(defaultIgnoreState())}>
              <RotateCcw />
              Reset to recommended
            </Button>
            <ExportDialog
              content={body}
              copyLabel="Copy file"
              title=".cursorignore"
              description={
                <>
                  Save this as <span className="font-mono">.cursorignore</span> in your repo root.
                  Blank lines and <span className="font-mono"># comments</span> are ignored by Cursor.
                </>
              }
              trigger={
                <>
                  <FileCog />
                  Export .cursorignore
                </>
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
