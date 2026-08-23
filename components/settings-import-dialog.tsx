"use client"

import { useMemo, useState } from "react"
import { ClipboardPaste } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { diffSettings, importSettings, type TweakState } from "@/lib/tweaks"

const PLACEHOLDER = `{
  "cursor.worktreeMaxCount": 30,
  "git.showCursorWorktrees": true
}`

function formatValue(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : String(value)
}

export function SettingsImportDialog({
  current,
  onApply,
}: {
  current: TweakState
  onApply: (state: TweakState) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [notice, setNotice] = useState<string | null>(null)

  const parsed = useMemo(() => (text.trim() ? importSettings(text) : null), [text])
  const changes = useMemo(
    () => (parsed?.ok ? diffSettings(current, parsed.state) : []),
    [parsed, current],
  )

  function reset() {
    setText("")
    setNotice(null)
  }

  function apply() {
    if (!parsed?.ok) {
      return
    }
    onApply(parsed.state)
    const managedCount = Object.values(parsed.state.enabled).filter(Boolean).length
    const extra =
      parsed.unmanagedKeys.length > 0
        ? ` ${parsed.unmanagedKeys.length} unmanaged key${
            parsed.unmanagedKeys.length === 1 ? "" : "s"
          } left untouched.`
        : ""
    setNotice(`Imported ${managedCount} managed key${managedCount === 1 ? "" : "s"}.${extra}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          reset()
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" />}>
        <ClipboardPaste />
        Import
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import settings.json</DialogTitle>
          <DialogDescription>
            Paste your current User Settings JSON. Managed keys pre-fill the tweaker; anything else is
            left untouched.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setNotice(null)
          }}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          className="h-32 w-full resize-none rounded-lg border border-input bg-transparent p-3 font-mono text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />

        {parsed && !parsed.ok ? <p className="text-xs text-destructive">{parsed.error}</p> : null}

        {parsed?.ok ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-xs">
            <p className="mb-1 font-medium">
              {changes.length === 0
                ? "No changes — this matches your current tweaks."
                : `${changes.length} change${changes.length === 1 ? "" : "s"} will apply:`}
            </p>
            <ul className="max-h-28 space-y-0.5 overflow-auto font-mono">
              {changes.map((change) => (
                <li key={change.key}>
                  {change.kind === "added" ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      + {change.key}: {formatValue(change.to)}
                    </span>
                  ) : change.kind === "removed" ? (
                    <span className="text-destructive">
                      − {change.key} (was {formatValue(change.from)})
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      ~ {change.key}: {formatValue(change.from)} → {formatValue(change.to)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {notice ? <p className="text-xs text-emerald-600 dark:text-emerald-400">{notice}</p> : null}

        <DialogFooter showCloseButton>
          <Button onClick={apply} disabled={!parsed?.ok}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
