"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Copy, RotateCcw, TerminalSquare } from "lucide-react"

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
import { loadLaunchFlags, saveLaunchFlags } from "@/lib/storage"
import { copyText } from "@/lib/clipboard"
import {
  LAUNCH_FLAGS,
  LAUNCH_GROUPS,
  buildLaunchCommand,
  defaultFlagState,
  enabledFlagCount,
  type FlagState,
} from "@/lib/launch-flags"

export function LaunchFlags() {
  const [hydrated, setHydrated] = useState(false)
  const [flags, setFlags] = useState<FlagState>(defaultFlagState)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore localStorage after mount */
    setFlags(loadLaunchFlags())
    setHydrated(true)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    saveLaunchFlags(flags)
  }, [hydrated, flags])

  const command = useMemo(() => buildLaunchCommand(flags), [flags])
  const count = useMemo(() => enabledFlagCount(flags), [flags])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TerminalSquare className="size-4" />
          Launch flags
        </CardTitle>
        <CardDescription>
          Command-line flags for starting Cursor. These are launch-time only — none of them has a
          settings.json key or a UI toggle, so they apply to the window you open with this command and
          are not remembered afterwards.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {LAUNCH_GROUPS.map((group) => (
          <div key={group} className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {LAUNCH_FLAGS.filter((entry) => entry.group === group).map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                    flags[entry.id] ? "border-border" : "border-dashed opacity-60"
                  }`}
                >
                  <div className="min-w-0">
                    <Label className="font-mono text-sm">{entry.flag}</Label>
                    <p className="text-xs text-muted-foreground">{entry.description}</p>
                  </div>
                  <Switch
                    aria-label={entry.label}
                    checked={flags[entry.id] ?? false}
                    onCheckedChange={(checked) =>
                      setFlags((current) => ({ ...current, [entry.id]: checked }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {count === 0
              ? "No flags selected — this is just a plain launch."
              : `${count} flag${count === 1 ? "" : "s"} selected. Run this from a terminal.`}
          </p>
          <pre className="overflow-x-auto rounded-xl border bg-muted/40 px-3 py-2 font-mono text-xs">
            {command}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                const ok = await copyText(command)
                setCopied(ok)
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy command"}
            </Button>
            <Button variant="ghost" disabled={count === 0} onClick={() => setFlags(defaultFlagState())}>
              <RotateCcw />
              Clear flags
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
