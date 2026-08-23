"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Bot,
  Clock3,
  Download,
  MessageSquarePlus,
  Pause,
  Play,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { CursorTweaks } from "@/components/cursor-tweaks"
import { CursorignoreGenerator } from "@/components/cursorignore-generator"
import { HealthPanel } from "@/components/health-panel"
import { LaunchFlags } from "@/components/launch-flags"
import { ManualChecklist } from "@/components/manual-checklist"
import { ExportDialog } from "@/components/export-dialog"
import {
  addWork,
  applyRotation,
  deleteChat,
  nextChatTitle,
  pauseAgent,
  pluginSettingsJson,
  resumeAgent,
  rotationReasons,
  runningAgentCount,
  seedState,
  setCurrentChat,
  startAgent,
  startChat,
  stopAgent,
  tickMinutes,
} from "@/lib/guard"
import { clearState, loadSettings, loadState, saveSettings, saveState } from "@/lib/storage"
import { DEFAULT_SETTINGS, type Chat, type Settings } from "@/lib/types"

const AGENT_NAMES = [
  "Implementer",
  "Reviewer",
  "Tester",
  "Docs",
  "Explorer",
  "Fixer",
  "Profiler",
  "Migrator",
]

function formatTime(at: number): string {
  const date = new Date(at)
  const hours = String(date.getUTCHours()).padStart(2, "0")
  const minutes = String(date.getUTCMinutes()).padStart(2, "0")
  const seconds = String(date.getUTCSeconds()).padStart(2, "0")
  return `${hours}:${minutes}:${seconds} UTC`
}

function SettingRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function NumberSetting({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  suffix: string
  onChange: (value: number) => void
}) {
  const fieldId = `setting-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={fieldId} className="text-sm">
          {label}
        </Label>
        <span className="font-mono text-xs text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        id={fieldId}
        min={min}
        max={max}
        value={[Number.isFinite(value) ? value : min]}
        onValueChange={(next) => {
          const resolved = Array.isArray(next) ? next[0] : next
          if (typeof resolved === "number" && Number.isFinite(resolved)) {
            onChange(resolved)
          }
        }}
      />
    </div>
  )
}

function ChatCard({
  chat,
  current,
  settings,
  onOpen,
  onDelete,
}: {
  chat: Chat
  current: boolean
  settings: Settings
  onOpen: () => void
  onDelete: () => void
}) {
  const reasons = rotationReasons(chat, settings)
  const heavy = reasons.length > 0 && chat.status === "active"

  return (
    <div
      className={`flex w-full items-start gap-2 rounded-xl border p-3 ${
        current
          ? "border-primary/40 bg-card"
          : "border-border bg-background/40"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 rounded-lg text-left transition hover:opacity-90"
      >
        <p className="font-medium">{chat.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {chat.messageCount} messages · {chat.elapsedMinutes} min · {chat.contextPercent}% context
        </p>
        {heavy ? (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Over threshold: {reasons.join(" · ")}
          </p>
        ) : null}
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Badge variant={chat.status === "active" ? "default" : "secondary"}>
          {chat.status}
        </Badge>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${chat.title}`}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

function PluginExportDialog({ settings }: { settings: Settings }) {
  return (
    <ExportDialog
      content={pluginSettingsJson(settings)}
      copyLabel="Copy JSON"
      title="Plugin settings"
      description={
        <>
          Save this as{" "}
          <span className="font-mono">~/.cursor/cursor-manager/settings.json</span>. The Cursor Manager
          hooks read these two values to enforce the cap and rotation reminders.
        </>
      }
      trigger={
        <>
          <Download />
          Export for plugin
        </>
      }
    />
  )
}

export function SessionApp() {
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [state, setState] = useState(seedState)
  const [clockOn, setClockOn] = useState(true)
  const [newTitle, setNewTitle] = useState("")

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore localStorage after mount */
    try {
      const loaded = loadState()
      setSettings(loadSettings())
      setState(loaded.state)
      setError(loaded.error)
    } catch {
      setError("Could not restore the last session. Showing a fresh demo instead.")
      setState(seedState())
    } finally {
      setHydrated(true)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    saveSettings(settings)
  }, [hydrated, settings])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    saveState(state)
  }, [hydrated, state])

  useEffect(() => {
    if (!hydrated || !clockOn) {
      return
    }
    const timer = window.setInterval(() => {
      setState((current) => tickMinutes(current, settings))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [clockOn, hydrated, settings])

  const living = useMemo(
    () => state.chats.filter((chat) => chat.status !== "deleted"),
    [state.chats],
  )
  const deleted = useMemo(
    () => state.chats.filter((chat) => chat.status === "deleted").slice(0, 4),
    [state.chats],
  )
  const running = runningAgentCount(state)
  const current = living.find((chat) => chat.id === state.currentChatId) ?? null
  const currentReasons = current ? rotationReasons(current, settings) : []

  function nextAgentName(): string {
    const used = new Set(state.agents.map((agent) => agent.name))
    return AGENT_NAMES.find((name) => !used.has(name)) ?? `Agent ${state.agents.length + 1}`
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Cursor memory hygiene
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Session Guard</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Cap concurrent agents at {settings.maxConcurrentAgents}. Warn when a chat is getting
            heavy, then automatically start a new one and delete older chats.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={running >= settings.maxConcurrentAgents ? "destructive" : "outline"}>
            <Bot />
            {running}/{settings.maxConcurrentAgents} agents
          </Badge>
          <Badge variant="outline">
            <MessageSquarePlus />
            {living.length}/{settings.keepChatCount} chats kept
          </Badge>
        </div>
      </header>

      {error ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Recovered from a bad save</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {state.notice ? (
        <Alert className="border-amber-500/30 bg-amber-500/8">
          <AlertTriangle />
          <AlertTitle>Start a new chat</AlertTitle>
          <AlertDescription>{state.notice}</AlertDescription>
          <AlertAction>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setState((current) => ({ ...current, notice: null }))}
            >
              Dismiss
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Chats</CardTitle>
              <CardDescription>
                Current chat stays until it hits your threshold. Older chats are deleted when a
                new one starts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {living.length === 0 ? (
                <div className="rounded-xl border border-dashed px-4 py-10 text-center">
                  <p className="font-medium">No chats yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start a chat to enforce the agent cap and rotation policy.
                  </p>
                  <Button className="mt-4" onClick={() => setState(startChat(state, settings, "Chat 1"))}>
                    <Plus />
                    Start first chat
                  </Button>
                </div>
              ) : (
                living.map((chat) => (
                  <ChatCard
                    key={chat.id}
                    chat={chat}
                    current={chat.id === state.currentChatId}
                    settings={settings}
                    onOpen={() => setState(setCurrentChat(state, chat.id))}
                    onDelete={() => setState(deleteChat(state, chat.id))}
                  />
                ))
              )}

              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <Label htmlFor="new-chat-title" className="sr-only">
                  Name the next chat
                </Label>
                <Input
                  id="new-chat-title"
                  value={newTitle}
                  placeholder="Name the next chat"
                  onChange={(event) => setNewTitle(event.target.value)}
                />
                <Button
                  onClick={() => {
                    setState(startChat(state, settings, newTitle.trim() || nextChatTitle(state)))
                    setNewTitle("")
                  }}
                >
                  <Plus />
                  New chat
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current chat load</CardTitle>
              <CardDescription>
                Simulate agent work to trip the rotate rule. The clock adds one minute per second.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {current ? (
                <>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-muted/50 px-3 py-3">
                      <p className="font-mono text-xl">{current.messageCount}</p>
                      <p className="text-xs text-muted-foreground">
                        / {settings.rotateAfterMessages} msgs
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/50 px-3 py-3">
                      <p className="font-mono text-xl">{current.elapsedMinutes}</p>
                      <p className="text-xs text-muted-foreground">
                        / {settings.rotateAfterMinutes} min
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/50 px-3 py-3">
                      <p className="font-mono text-xl">{current.contextPercent}%</p>
                      <p className="text-xs text-muted-foreground">
                        / {settings.rotateAtContextPercent}%
                      </p>
                    </div>
                  </div>
                  {currentReasons.length > 0 ? (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Threshold reached: {currentReasons.join(" · ")}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Still under the rotate line. Two more simulated replies should trip it.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        setState(addWork(state, settings, { messages: 3, context: 8, minutes: 2 }))
                      }
                    >
                      <RotateCw />
                      Simulate 3 replies
                    </Button>
                    <Button variant="outline" onClick={() => setClockOn((value) => !value)}>
                      {clockOn ? <Pause /> : <Play />}
                      {clockOn ? "Pause clock" : "Resume clock"}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No active chat to measure.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Policy</CardTitle>
              <CardDescription>
                These settings live in this browser. Cursor itself has no official agent cap or
                auto-rotate switch — this guard is the control you asked for.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <NumberSetting
                label="Max concurrent agents"
                value={settings.maxConcurrentAgents}
                min={1}
                max={8}
                suffix=""
                onChange={(maxConcurrentAgents) =>
                  setSettings((current) => ({ ...current, maxConcurrentAgents }))
                }
              />
              <NumberSetting
                label="Keep this many chats"
                value={settings.keepChatCount}
                min={1}
                max={12}
                suffix=""
                onChange={(keepChatCount) => setSettings((current) => ({ ...current, keepChatCount }))}
              />
              <Separator />
              <SettingRow
                label="Tell me when to start a new chat"
                hint="Shows a banner when the current chat crosses a threshold."
                checked={settings.notifyWhenToRotate}
                onCheckedChange={(notifyWhenToRotate) =>
                  setSettings((current) => ({ ...current, notifyWhenToRotate }))
                }
              />
              <SettingRow
                label="Automatically start a new chat"
                hint="Opens a fresh chat as soon as the threshold is hit."
                checked={settings.autoStartNewChat}
                onCheckedChange={(autoStartNewChat) =>
                  setSettings((current) => ({ ...current, autoStartNewChat }))
                }
              />
              <SettingRow
                label="Delete older chats"
                hint="Keeps only the newest chats after a rotation."
                checked={settings.deleteOlderChats}
                onCheckedChange={(deleteOlderChats) =>
                  setSettings((current) => ({ ...current, deleteOlderChats }))
                }
              />
              <Separator />
              <SettingRow
                label="Rotate on message count"
                hint="Long threads are the usual memory leak."
                checked={settings.useMessageTrigger}
                onCheckedChange={(useMessageTrigger) =>
                  setSettings((current) => ({ ...current, useMessageTrigger }))
                }
              />
              <NumberSetting
                label="New chat after"
                value={settings.rotateAfterMessages}
                min={5}
                max={80}
                suffix=" msgs"
                onChange={(rotateAfterMessages) =>
                  setSettings((current) => ({ ...current, rotateAfterMessages }))
                }
              />
              <SettingRow
                label="Rotate on duration"
                hint="One simulated minute per real second while the clock is running."
                checked={settings.useDurationTrigger}
                onCheckedChange={(useDurationTrigger) =>
                  setSettings((current) => ({ ...current, useDurationTrigger }))
                }
              />
              <NumberSetting
                label="New chat after"
                value={settings.rotateAfterMinutes}
                min={5}
                max={180}
                suffix=" min"
                onChange={(rotateAfterMinutes) =>
                  setSettings((current) => ({ ...current, rotateAfterMinutes }))
                }
              />
              <SettingRow
                label="Rotate on context fullness"
                hint="Mirrors Cursor’s context ring getting full."
                checked={settings.useContextTrigger}
                onCheckedChange={(useContextTrigger) =>
                  setSettings((current) => ({ ...current, useContextTrigger }))
                }
              />
              <NumberSetting
                label="New chat at"
                value={settings.rotateAtContextPercent}
                min={40}
                max={100}
                suffix="%"
                onChange={(rotateAtContextPercent) =>
                  setSettings((current) => ({ ...current, rotateAtContextPercent }))
                }
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setState((current) => applyRotation(current, settings))}
              >
                Apply policy now
              </Button>
              <PluginExportDialog settings={settings} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Agents</CardTitle>
              <CardDescription>
                Launching a sixth agent stops the oldest one. Pause an agent to free a slot without
                losing it. Cap is {settings.maxConcurrentAgents}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {state.agents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agents running.</p>
              ) : (
                state.agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {agent.status} · started {formatTime(agent.startedAt)}
                      </p>
                    </div>
                    {agent.status === "stopped" ? (
                      <Badge variant="secondary">{agent.status}</Badge>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        {agent.status === "running" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setState(pauseAgent(state, agent.id))}
                          >
                            <Pause />
                            Pause
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setState(resumeAgent(state, settings, agent.id))}
                          >
                            <Play />
                            Resume
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setState(stopAgent(state, agent.id))}
                        >
                          Stop
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => setState(startAgent(state, settings, nextAgentName()))}
              >
                <Plus />
                Start agent
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <CursorTweaks />

      <CursorignoreGenerator />

      <LaunchFlags />

      <HealthPanel />

      <ManualChecklist />

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Rotations, caps, and deletions from this session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleted.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Recently deleted
              </p>
              <div className="flex flex-wrap gap-2">
                {deleted.map((chat) => (
                  <Badge key={chat.id} variant="outline">
                    <Trash2 />
                    {chat.title}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {state.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {state.events.map((event) => (
                <li key={event.id} className="flex gap-3 text-sm">
                  <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {formatTime(event.at)}
                  </span>
                  <span>{event.message}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                clearState()
                const fresh = loadState()
                setState(fresh.state)
                setError(null)
              }}
            >
              Reset demo chats
            </Button>
            <p className="self-center text-xs text-muted-foreground">
              <Clock3 className="mr-1 inline size-3.5" />
              In Cursor Desktop, start a real new chat with Cmd/Ctrl+N. This page cannot close
              chats inside the IDE.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
