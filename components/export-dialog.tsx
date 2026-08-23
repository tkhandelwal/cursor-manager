"use client"

import { type ReactNode, useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"

import { copyText } from "@/lib/clipboard"
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

export function ExportDialog({
  content,
  title,
  description,
  trigger,
  copyLabel = "Copy",
}: {
  content: string
  title: string
  description: ReactNode
  trigger: ReactNode
  copyLabel?: string
}) {
  const [copied, setCopied] = useState(false)
  const pretty = useMemo(() => content.replace(/\n+$/, ""), [content])

  async function copy() {
    if (await copyText(content)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <Dialog onOpenChange={() => setCopied(false)}>
      <DialogTrigger render={<Button variant="outline" className="w-full" />}>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <pre className="max-h-72 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs">
          {pretty}
        </pre>
        <DialogFooter showCloseButton>
          <Button onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : copyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
