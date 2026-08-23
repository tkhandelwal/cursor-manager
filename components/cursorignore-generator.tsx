"use client"

import { useEffect, useMemo, useState } from "react"
import { FileCog, Plus, RotateCcw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ExportDialog } from "@/components/export-dialog"
import { CursorignoreImportDialog } from "@/components/cursorignore-import-dialog"
import { loadIgnore, loadIgnoreCustom, saveIgnore, saveIgnoreCustom } from "@/lib/storage"
import {
  IGNORE_ENTRIES,
  IGNORE_GROUPS,
  buildCursorignore,
  defaultIgnoreState,
  enabledIgnoreCount,
  sanitizeCustomPatterns,
  type IgnoreState,
} from "@/lib/cursorignore"

export function CursorignoreGenerator() {
  const [hydrated, setHydrated] = useState(false)
  const [ignore, setIgnore] = useState<IgnoreState>(defaultIgnoreState)
  const [custom, setCustom] = useState<string[]>([])
  const [customInput, setCustomInput] = useState("")

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore localStorage after mount */
    setIgnore(loadIgnore())
    setCustom(loadIgnoreCustom())
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    saveIgnore(ignore)
  }, [hydrated, ignore])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    saveIgnoreCustom(custom)
  }, [hydrated, custom])

  const body = useMemo(() => buildCursorignore(ignore, custom), [ignore, custom])
  const count = useMemo(() => enabledIgnoreCount(ignore, custom), [ignore, custom])

  function addCustom() {
    const next = sanitizeCustomPatterns([...custom, customInput])
    setCustom(next)
    setCustomInput("")
  }

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

        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Custom</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={customInput}
              placeholder="Add a pattern, e.g. tmp/ or *.bak"
              onChange={(event) => setCustomInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  addCustom()
                }
              }}
            />
            <Button
              variant="secondary"
              disabled={customInput.trim().length === 0}
              onClick={addCustom}
            >
              <Plus />
              Add pattern
            </Button>
          </div>
          {custom.length === 0 ? (
            <p className="text-xs text-muted-foreground">No custom patterns.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {custom.map((pattern) => (
                <div
                  key={pattern}
                  className="flex items-center gap-1 rounded-lg border py-1 pr-1 pl-2"
                >
                  <span className="font-mono text-xs">{pattern}</span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Remove ${pattern}`}
                    onClick={() => setCustom((current) => current.filter((item) => item !== pattern))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {count} pattern{count === 1 ? "" : "s"} selected.
          </p>
          <div className="flex flex-wrap gap-2">
            <CursorignoreImportDialog
              onApply={(enabled, imported) => {
                setIgnore(enabled)
                setCustom(imported)
              }}
            />
            <Button
              variant="ghost"
              onClick={() => {
                setIgnore(defaultIgnoreState())
                setCustom([])
              }}
            >
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
