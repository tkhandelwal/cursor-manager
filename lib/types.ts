export type Settings = {
  maxConcurrentAgents: number
  keepChatCount: number
  notifyWhenToRotate: boolean
  autoStartNewChat: boolean
  deleteOlderChats: boolean
  rotateAfterMessages: number
  rotateAfterMinutes: number
  rotateAtContextPercent: number
  useMessageTrigger: boolean
  useDurationTrigger: boolean
  useContextTrigger: boolean
}

export type ChatStatus = "active" | "rotated" | "deleted"

export type Chat = {
  id: string
  title: string
  createdAt: number
  lastActiveAt: number
  messageCount: number
  contextPercent: number
  elapsedMinutes: number
  status: ChatStatus
}

export type AgentStatus = "running" | "idle" | "stopped"

export type Agent = {
  id: string
  name: string
  chatId: string
  startedAt: number
  status: AgentStatus
}

export type EventKind =
  | "started"
  | "rotated"
  | "deleted"
  | "capped"
  | "notice"
  | "agent-started"
  | "agent-stopped"

export type GuardEvent = {
  id: string
  at: number
  kind: EventKind
  message: string
}

export type GuardState = {
  chats: Chat[]
  agents: Agent[]
  currentChatId: string | null
  events: GuardEvent[]
  notice: string | null
  lastRotationAt: number | null
  chatSeq: number
}

export const DEFAULT_SETTINGS: Settings = {
  maxConcurrentAgents: 5,
  keepChatCount: 5,
  notifyWhenToRotate: true,
  autoStartNewChat: true,
  deleteOlderChats: true,
  rotateAfterMessages: 20,
  rotateAfterMinutes: 45,
  rotateAtContextPercent: 80,
  useMessageTrigger: true,
  useDurationTrigger: true,
  useContextTrigger: true,
}
