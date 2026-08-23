"use client"

import { useState } from "react"
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
import { importSettings, type TweakState } from "@/lib/tweaks"

const PLACEHOLDER = `{
  "cursor.worktreeMaxCount": 30,
  "git.showCursorWorktrees": true
}`

export function SettingsImportDialog({ onApply }: { onApply: (state: TweakState) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function reset() {
    setText("")
    setError(null)
    setNotice(null)
  }

  function apply() {
    const result = importSettings(text)
    if (!result.ok) {
      setError(result.error)
      setNotice(null)
      return
    }

    onApply(result.state)
    const managedCount = Object.values(result.state.enabled).filter(Boolean).length
    const extra =
      result.unmanagedKeys.length > 0
        ? ` ${result.unmanagedKeys.length} unmanaged key${
            result.unmanagedKeys.length === 1 ? "" : "s"
          } left untouched.`
        : ""
    setNotice(`Imported ${managedCount} managed key${managedCount === 1 ? "" : "s"}.${extra}`)
    setError(null)
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
            setError(null)
          }}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          className="h-40 w-full resize-none rounded-lg border border-input bg-transparent p-3 font-mono text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {notice ? <p className="text-xs text-emerald-600 dark:text-emerald-400">{notice}</p> : null}
        <DialogFooter showCloseButton>
          <Button onClick={apply} disabled={text.trim().length === 0}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
