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
import { parseCursorignore, type IgnoreState } from "@/lib/cursorignore"

const PLACEHOLDER = `node_modules/
dist/
.env
my/custom/path`

export function CursorignoreImportDialog({
  onApply,
}: {
  onApply: (enabled: IgnoreState, custom: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [notice, setNotice] = useState<string | null>(null)

  const preview = useMemo(() => (text.trim() ? parseCursorignore(text) : null), [text])

  function apply() {
    if (!preview) {
      return
    }
    onApply(preview.enabled, preview.custom)
    const known = Object.values(preview.enabled).filter(Boolean).length
    const extra = preview.custom.length > 0 ? ` ${preview.custom.length} kept as custom.` : ""
    setNotice(`Matched ${known} known pattern${known === 1 ? "" : "s"}.${extra}`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setText("")
          setNotice(null)
        }
      }}
    >
      <DialogTrigger render={<Button variant="ghost" />}>
        <ClipboardPaste />
        Import
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import .cursorignore</DialogTitle>
          <DialogDescription>
            Paste an existing <span className="font-mono">.cursorignore</span>. Known patterns toggle
            on; anything else is kept as a custom pattern. Comments and blank lines are ignored.
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
        {preview ? (
          <p className="text-xs text-muted-foreground">
            {Object.values(preview.enabled).filter(Boolean).length} known pattern
            {Object.values(preview.enabled).filter(Boolean).length === 1 ? "" : "s"} and{" "}
            {preview.custom.length} custom pattern{preview.custom.length === 1 ? "" : "s"} detected.
          </p>
        ) : null}
        {notice ? <p className="text-xs text-emerald-600 dark:text-emerald-400">{notice}</p> : null}
        <DialogFooter showCloseButton>
          <Button onClick={apply} disabled={!preview}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
