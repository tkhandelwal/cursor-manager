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

export function JsonExportDialog({
  json,
  title,
  description,
  trigger,
}: {
  json: string
  title: string
  description: ReactNode
  trigger: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const pretty = useMemo(() => json.replace(/\n+$/, ""), [json])

  async function copy() {
    if (await copyText(json)) {
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
            {copied ? "Copied" : "Copy JSON"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
