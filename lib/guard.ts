import {
  DEFAULT_SETTINGS,
  type Agent,
  type Chat,
  type GuardEvent,
  type GuardState,
  type PluginSettings,
  type Settings,
} from "./types"

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

export function createEvent(kind: GuardEvent["kind"], message: string, at = Date.now()): GuardEvent {
  return { id: createId("evt"), at, kind, message }
}

export function rotationReasons(chat: Chat, settings: Settings): string[] {
  const reasons: string[] = []
  if (settings.useMessageTrigger && chat.messageCount >= settings.rotateAfterMessages) {
    reasons.push(`${chat.messageCount} messages (limit ${settings.rotateAfterMessages})`)
  }
  if (settings.useDurationTrigger && chat.elapsedMinutes >= settings.rotateAfterMinutes) {
    reasons.push(`${chat.elapsedMinutes} min (limit ${settings.rotateAfterMinutes})`)
  }
  if (settings.useContextTrigger && chat.contextPercent >= settings.rotateAtContextPercent) {
    reasons.push(`${chat.contextPercent}% context (limit ${settings.rotateAtContextPercent}%)`)
  }
  return reasons
}

function keepEvents(events: GuardEvent[]): GuardEvent[] {
  return events.slice(0, 40)
}

function livingChats(chats: Chat[]): Chat[] {
  return chats.filter((chat) => chat.status !== "deleted")
}

export function pruneChats(chats: Chat[], keepChatCount: number, now: number): {
  chats: Chat[]
  deleted: Chat[]
} {
  const alive = livingChats(chats).sort((a, b) => b.createdAt - a.createdAt)
  const drop = alive.slice(Math.max(1, keepChatCount))
  const deletedIds = new Set(drop.map((chat) => chat.id))

  return {
    deleted: drop,
    chats: chats.map((chat) =>
      deletedIds.has(chat.id)
        ? { ...chat, status: "deleted" as const, lastActiveAt: now }
        : chat,
    ),
  }
}

export function startChat(
  state: GuardState,
  settings: Settings,
  title: string,
  now = Date.now(),
): GuardState {
  const seq = nextChatSequence(state) + 1
  const resolvedTitle = title.trim() || `Chat ${seq}`
  const chat: Chat = {
    id: createId("chat"),
    title: resolvedTitle,
    createdAt: now,
    lastActiveAt: now,
    messageCount: 0,
    contextPercent: 8,
    elapsedMinutes: 0,
    status: "active",
  }

  let chats = [
    chat,
    ...state.chats.map((existing) =>
      existing.id === state.currentChatId && existing.status === "active"
        ? { ...existing, status: "rotated" as const }
        : existing,
    ),
  ]

  const events = [createEvent("started", `Started “${resolvedTitle}”.`, now), ...state.events]
  let notice = state.notice

  if (settings.deleteOlderChats) {
    const pruned = pruneChats(chats, settings.keepChatCount, now)
    chats = pruned.chats
    for (const dead of pruned.deleted) {
      events.unshift(createEvent("deleted", `Deleted older chat “${dead.title}”.`, now))
    }
    if (pruned.deleted.length > 0) {
      notice = `Started a new chat and deleted ${pruned.deleted.length} older ${pruned.deleted.length === 1 ? "chat" : "chats"}.`
    }
  }

  return {
    ...state,
    chats,
    chatSeq: Math.max(seq, titledNumber(resolvedTitle)),
    currentChatId: chat.id,
    events: keepEvents(events),
    notice,
  }
}

export function applyRotation(
  state: GuardState,
  settings: Settings,
  now = Date.now(),
): GuardState {
  const current = state.chats.find((chat) => chat.id === state.currentChatId)
  if (!current || current.status === "deleted") {
    return state
  }

  const reasons = rotationReasons(current, settings)
  if (reasons.length === 0) {
    return state
  }

  const summary = reasons.join(" · ")

  if (!settings.autoStartNewChat) {
    if (!settings.notifyWhenToRotate) {
      return state
    }
    const notice = `Start a new chat. This one is heavy: ${summary}.`
    if (state.notice === notice) {
      return state
    }
    return {
      ...state,
      notice,
      events: keepEvents([
        createEvent("notice", `Rotation recommended for “${current.title}”: ${summary}.`, now),
        ...state.events.filter((event) => event.kind !== "notice"),
      ]),
    }
  }

  const nextTitle = nextChatTitle(state)
  let next = startChat(
    {
      ...state,
      chats: state.chats.map((chat) =>
        chat.id === current.id ? { ...chat, status: "rotated", lastActiveAt: now } : chat,
      ),
    },
    settings,
    nextTitle,
    now,
  )

  next = {
    ...next,
    lastRotationAt: now,
    notice: settings.notifyWhenToRotate
      ? `Started “${nextTitle}” because the last chat hit ${summary}.`
      : next.notice,
    events: keepEvents([
      createEvent("rotated", `Auto-started “${nextTitle}” (${summary}).`, now),
      ...next.events,
    ]),
  }

  return next
}

function enforceRunningCap(
  agents: Agent[],
  events: GuardEvent[],
  settings: Settings,
  now: number,
): { agents: Agent[]; capped: boolean } {
  const running = agents.filter((agent) => agent.status === "running")
  if (running.length < settings.maxConcurrentAgents) {
    return { agents, capped: false }
  }

  const oldest = [...running].sort((a, b) => a.startedAt - b.startedAt)[0]
  events.unshift(
    createEvent(
      "capped",
      `Capped at ${settings.maxConcurrentAgents} agents. Stopped oldest: “${oldest.name}”.`,
      now,
    ),
  )
  return {
    agents: agents.map((agent) =>
      agent.id === oldest.id ? { ...agent, status: "stopped" } : agent,
    ),
    capped: true,
  }
}

export function startAgent(
  state: GuardState,
  settings: Settings,
  name: string,
  now = Date.now(),
): GuardState {
  if (!state.currentChatId) {
    return {
      ...state,
      notice: "Start a chat before launching an agent.",
    }
  }

  const events = [...state.events]
  const { agents: withRoom, capped } = enforceRunningCap(state.agents, events, settings, now)

  const agent: Agent = {
    id: createId("agt"),
    name,
    chatId: state.currentChatId,
    startedAt: now,
    status: "running",
  }

  events.unshift(createEvent("agent-started", `Started agent “${name}”.`, now))

  return {
    ...state,
    agents: [agent, ...withRoom],
    events: keepEvents(events),
    notice: capped
      ? `Agent cap is ${settings.maxConcurrentAgents}. Oldest agent was stopped to make room.`
      : state.notice,
  }
}

export function pauseAgent(state: GuardState, agentId: string, now = Date.now()): GuardState {
  const agent = state.agents.find((item) => item.id === agentId)
  if (!agent || agent.status !== "running") {
    return state
  }
  return {
    ...state,
    agents: state.agents.map((item) =>
      item.id === agentId ? { ...item, status: "idle" } : item,
    ),
    events: keepEvents([
      createEvent("agent-paused", `Paused agent “${agent.name}”. Freed a slot under the cap.`, now),
      ...state.events,
    ]),
  }
}

export function resumeAgent(
  state: GuardState,
  settings: Settings,
  agentId: string,
  now = Date.now(),
): GuardState {
  const agent = state.agents.find((item) => item.id === agentId)
  if (!agent || agent.status !== "idle") {
    return state
  }

  const events = [...state.events]
  const { agents: withRoom, capped } = enforceRunningCap(state.agents, events, settings, now)

  events.unshift(createEvent("agent-resumed", `Resumed agent “${agent.name}”.`, now))

  return {
    ...state,
    agents: withRoom.map((item) =>
      // startedAt is deliberately preserved: it is the agent's true start time,
      // and enforceRunningCap orders eviction by it. pauseAgent preserves it too.
      item.id === agentId ? { ...item, status: "running" } : item,
    ),
    events: keepEvents(events),
    notice: capped
      ? `Agent cap is ${settings.maxConcurrentAgents}. Oldest agent was stopped to make room.`
      : state.notice,
  }
}

function titledNumber(title: string): number {
  const match = /^Chat (\d+)$/.exec(title)
  return match ? Number(match[1]) : 0
}

export function nextChatSequence(state: GuardState): number {
  const fromTitles = state.chats.reduce(
    (max, chat) => Math.max(max, titledNumber(chat.title)),
    0,
  )
  return Math.max(state.chatSeq ?? 0, fromTitles)
}

export function nextChatTitle(state: GuardState): string {
  return `Chat ${nextChatSequence(state) + 1}`
}

export function stopAgent(state: GuardState, agentId: string, now = Date.now()): GuardState {
  const agent = state.agents.find((item) => item.id === agentId)
  if (!agent || agent.status === "stopped") {
    return state
  }
  return {
    ...state,
    agents: state.agents.map((item) =>
      item.id === agentId ? { ...item, status: "stopped" } : item,
    ),
    events: keepEvents([
      createEvent("agent-stopped", `Stopped agent “${agent.name}”.`, now),
      ...state.events,
    ]),
  }
}

export function addWork(
  state: GuardState,
  settings: Settings,
  amount: { messages: number; context: number; minutes: number },
  now = Date.now(),
): GuardState {
  if (!state.currentChatId) {
    return state
  }

  const next: GuardState = {
    ...state,
    chats: state.chats.map((chat) =>
      chat.id === state.currentChatId && chat.status === "active"
        ? {
            ...chat,
            messageCount: chat.messageCount + amount.messages,
            contextPercent: Math.min(100, chat.contextPercent + amount.context),
            elapsedMinutes: chat.elapsedMinutes + amount.minutes,
            lastActiveAt: now,
          }
        : chat,
    ),
  }

  return applyRotation(next, settings, now)
}

export function tickMinutes(state: GuardState, settings: Settings, now = Date.now()): GuardState {
  const next: GuardState = {
    ...state,
    chats: state.chats.map((chat) =>
      chat.status === "active" ? { ...chat, elapsedMinutes: chat.elapsedMinutes + 1 } : chat,
    ),
  }
  return applyRotation(next, settings, now)
}

export function setCurrentChat(state: GuardState, chatId: string, now = Date.now()): GuardState {
  const chat = state.chats.find((item) => item.id === chatId)
  if (!chat || chat.status === "deleted") {
    return state
  }
  return {
    ...state,
    currentChatId: chatId,
    chats: state.chats.map((item) =>
      item.id === chatId ? { ...item, lastActiveAt: now, status: "active" } : item,
    ),
    notice: null,
  }
}

export function deleteChat(state: GuardState, chatId: string, now = Date.now()): GuardState {
  const chat = state.chats.find((item) => item.id === chatId)
  if (!chat) {
    return state
  }

  const chats = state.chats.map((item) =>
    item.id === chatId ? { ...item, status: "deleted" as const, lastActiveAt: now } : item,
  )
  const remaining = livingChats(chats)
  const currentChatId =
    state.currentChatId === chatId ? (remaining[0]?.id ?? null) : state.currentChatId

  return {
    ...state,
    chats,
    currentChatId,
    agents: state.agents.map((agent) =>
      agent.chatId === chatId ? { ...agent, status: "stopped" } : agent,
    ),
    events: keepEvents([
      createEvent("deleted", `Deleted “${chat.title}”.`, now),
      ...state.events,
    ]),
    notice: remaining.length === 0 ? "No chats left. Start a new one when you are ready." : state.notice,
  }
}

export function runningAgentCount(state: GuardState): number {
  return state.agents.filter((agent) => agent.status === "running").length
}

const DEMO_NOW = 1_724_300_000_000

export function seedState(now = DEMO_NOW): GuardState {
  const chatA: Chat = {
    id: "chat-auth",
    title: "Auth timeout",
    createdAt: now - 50 * 60_000,
    lastActiveAt: now - 2 * 60_000,
    messageCount: 18,
    contextPercent: 74,
    elapsedMinutes: 36,
    status: "active",
  }
  const chatB: Chat = {
    id: "chat-readme",
    title: "README polish",
    createdAt: now - 90 * 60_000,
    lastActiveAt: now - 40 * 60_000,
    messageCount: 6,
    contextPercent: 22,
    elapsedMinutes: 12,
    status: "rotated",
  }
  const chatC: Chat = {
    id: "chat-tests",
    title: "Failing tests",
    createdAt: now - 140 * 60_000,
    lastActiveAt: now - 80 * 60_000,
    messageCount: 4,
    contextPercent: 16,
    elapsedMinutes: 8,
    status: "rotated",
  }

  return {
    chats: [chatA, chatB, chatC],
    chatSeq: 3,
    currentChatId: chatA.id,
    lastRotationAt: null,
    notice: "Auth timeout is close to the rotate threshold. Two more replies will start a new chat.",
    agents: [
      {
        id: "agt-1",
        name: "Implementer",
        chatId: chatA.id,
        startedAt: now - 18 * 60_000,
        status: "running",
      },
      {
        id: "agt-2",
        name: "Reviewer",
        chatId: chatA.id,
        startedAt: now - 9 * 60_000,
        status: "running",
      },
    ],
    events: [
      {
        id: "evt-notice-seed",
        at: now,
        kind: "notice",
        message: "Session Guard loaded with a 5-agent cap.",
      },
      {
        id: "evt-reviewer-seed",
        at: now - 9 * 60_000,
        kind: "agent-started",
        message: "Started agent “Reviewer”.",
      },
      {
        id: "evt-implementer-seed",
        at: now - 18 * 60_000,
        kind: "agent-started",
        message: "Started agent “Implementer”.",
      },
      {
        id: "evt-auth-seed",
        at: now - 50 * 60_000,
        kind: "started",
        message: "Started “Auth timeout”.",
      },
    ],
  }
}

export function emptyState(): GuardState {
  return {
    chats: [],
    agents: [],
    currentChatId: null,
    events: [],
    notice: null,
    lastRotationAt: null,
    chatSeq: 0,
  }
}

export function normalizeState(state: GuardState): GuardState {
  return {
    ...state,
    chatSeq: nextChatSequence(state),
  }
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function toPluginSettings(settings: Settings): PluginSettings {
  return {
    maxConcurrentAgents: settings.maxConcurrentAgents,
    rotateAfterMessages: settings.rotateAfterMessages,
  }
}

export function pluginSettingsJson(settings: Settings): string {
  return `${JSON.stringify(toPluginSettings(settings), null, 2)}\n`
}

export function mergeSettings(value: unknown): Settings {
  if (!value || typeof value !== "object") {
    return DEFAULT_SETTINGS
  }
  const incoming = value as Partial<Settings>
  return {
    ...DEFAULT_SETTINGS,
    ...incoming,
    maxConcurrentAgents: finiteOr(incoming.maxConcurrentAgents, DEFAULT_SETTINGS.maxConcurrentAgents),
    keepChatCount: finiteOr(incoming.keepChatCount, DEFAULT_SETTINGS.keepChatCount),
    rotateAfterMessages: finiteOr(incoming.rotateAfterMessages, DEFAULT_SETTINGS.rotateAfterMessages),
    rotateAfterMinutes: finiteOr(incoming.rotateAfterMinutes, DEFAULT_SETTINGS.rotateAfterMinutes),
    rotateAtContextPercent: finiteOr(
      incoming.rotateAtContextPercent,
      DEFAULT_SETTINGS.rotateAtContextPercent,
    ),
  }
}

export function isGuardState(value: unknown): value is GuardState {
  if (!value || typeof value !== "object") {
    return false
  }
  const record = value as GuardState
  return Array.isArray(record.chats) && Array.isArray(record.agents) && Array.isArray(record.events)
}

export { DEFAULT_SETTINGS }
