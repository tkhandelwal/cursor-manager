import assert from "node:assert/strict"
import { test } from "node:test"

import {
  addWork,
  applyRotation,
  deleteChat,
  isGuardState,
  mergeSettings,
  pauseAgent,
  pluginSettingsJson,
  pruneChats,
  resumeAgent,
  rotationReasons,
  runningAgentCount,
  seedState,
  setCurrentChat,
  startAgent,
  startChat,
  tickMinutes,
  toPluginSettings,
} from "./guard"
import { DEFAULT_SETTINGS } from "./types"

test("rotation reasons fire at the configured limits", () => {
  const chat = {
    id: "c1",
    title: "Heavy",
    createdAt: 1,
    lastActiveAt: 1,
    messageCount: 20,
    contextPercent: 80,
    elapsedMinutes: 45,
    status: "active" as const,
  }
  const reasons = rotationReasons(chat, DEFAULT_SETTINGS)
  assert.equal(reasons.length, 3)
})

test("auto-starts a new chat and deletes older ones past the keep count", () => {
  let state = seedState(1_000)
  state = startChat(state, DEFAULT_SETTINGS, "Chat 4", 2_000)
  state = startChat(state, DEFAULT_SETTINGS, "Chat 5", 3_000)
  state = startChat(state, DEFAULT_SETTINGS, "Chat 6", 4_000)
  const living = state.chats.filter((chat) => chat.status !== "deleted")
  assert.equal(living.length, 5)
  assert.equal(state.currentChatId && living.some((chat) => chat.id === state.currentChatId), true)
  assert.equal(state.chats.some((chat) => chat.status === "deleted"), true)
})

test("caps running agents at 5 by stopping the oldest", () => {
  let state = seedState(1_000)
  for (let index = 0; index < 4; index += 1) {
    state = startAgent(state, DEFAULT_SETTINGS, `Extra ${index}`, 2_000 + index)
  }
  assert.equal(runningAgentCount(state), 5)
  state = startAgent(state, DEFAULT_SETTINGS, "Sixth", 3_000)
  assert.equal(runningAgentCount(state), 5)
  assert.equal(state.events.some((event) => event.kind === "capped"), true)
  assert.equal(
    state.agents.some((agent) => agent.name === "Implementer" && agent.status === "stopped"),
    true,
  )
})

test("notify-only mode does not create a chat", () => {
  const settings = { ...DEFAULT_SETTINGS, autoStartNewChat: false, deleteOlderChats: false }
  let state = seedState(1_000)
  state = addWork(state, settings, { messages: 5, context: 20, minutes: 20 }, 2_000)
  const living = state.chats.filter((chat) => chat.status !== "deleted")
  assert.equal(living.some((chat) => chat.title === "Auth timeout" && chat.status === "active"), true)
  assert.match(state.notice ?? "", /Start a new chat/)
})

test("applyRotation with auto-start replaces a heavy current chat", () => {
  const settings = { ...DEFAULT_SETTINGS, rotateAfterMessages: 10 }
  let state = seedState(1_000)
  state = applyRotation(state, settings, 2_000)
  const current = state.chats.find((chat) => chat.id === state.currentChatId)
  assert.ok(current)
  assert.equal(current.title, "Chat 4")
  assert.equal(state.chats.find((chat) => chat.title === "Auth timeout")?.status, "rotated")
})

test("repeated rotations keep unique Chat N titles", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    rotateAfterMinutes: 1,
    useMessageTrigger: false,
    useContextTrigger: false,
  }
  let state = seedState(1_000)
  state = applyRotation(state, settings, 2_000)
  state = tickMinutes(state, settings, 3_000)
  state = tickMinutes(state, settings, 4_000)
  const numbered = state.chats
    .map((chat) => chat.title)
    .filter((title) => title.startsWith("Chat "))
  assert.equal(new Set(numbered).size, numbered.length)
  assert.equal(state.chats.find((chat) => chat.id === state.currentChatId)?.title, "Chat 6")
})

test("a later tick does not clear the rotation banner", () => {
  const settings = { ...DEFAULT_SETTINGS, rotateAfterMessages: 10 }
  let state = seedState(1_000)
  state = applyRotation(state, settings, 2_000)
  const notice = state.notice
  assert.match(notice ?? "", /Started “Chat 4”/)
  state = tickMinutes(state, settings, 3_000)
  assert.equal(state.notice, notice)
})

test("pruneChats keeps the newest chats by createdAt and drops the rest", () => {
  const chats = [
    { id: "a", title: "A", createdAt: 100, lastActiveAt: 100, messageCount: 0, contextPercent: 0, elapsedMinutes: 0, status: "active" as const },
    { id: "b", title: "B", createdAt: 300, lastActiveAt: 300, messageCount: 0, contextPercent: 0, elapsedMinutes: 0, status: "rotated" as const },
    { id: "c", title: "C", createdAt: 200, lastActiveAt: 200, messageCount: 0, contextPercent: 0, elapsedMinutes: 0, status: "rotated" as const },
  ]
  const { chats: next, deleted } = pruneChats(chats, 2, 9_999)
  assert.deepEqual(deleted.map((chat) => chat.id), ["a"])
  assert.equal(next.find((chat) => chat.id === "a")?.status, "deleted")
  assert.equal(next.find((chat) => chat.id === "b")?.status, "rotated")
  assert.equal(next.find((chat) => chat.id === "c")?.status, "rotated")
})

test("pausing an agent frees a slot so the next start does not evict", () => {
  let state = seedState(1_000)
  for (let index = 0; index < 3; index += 1) {
    state = startAgent(state, DEFAULT_SETTINGS, `Extra ${index}`, 2_000 + index)
  }
  assert.equal(runningAgentCount(state), 5)

  const oldestRunning = [...state.agents]
    .filter((agent) => agent.status === "running")
    .sort((a, b) => a.startedAt - b.startedAt)[0]
  state = pauseAgent(state, oldestRunning.id, 3_000)
  assert.equal(runningAgentCount(state), 4)
  assert.equal(state.agents.find((agent) => agent.id === oldestRunning.id)?.status, "idle")

  state = startAgent(state, DEFAULT_SETTINGS, "After pause", 4_000)
  assert.equal(runningAgentCount(state), 5)
  assert.equal(state.events.some((event) => event.kind === "capped"), false)
  assert.equal(state.agents.find((agent) => agent.id === oldestRunning.id)?.status, "idle")
})

test("resuming an idle agent at the cap stops the oldest running agent", () => {
  let state = seedState(1_000)
  const idleTarget = state.agents[0]
  state = pauseAgent(state, idleTarget.id, 2_000)
  assert.equal(runningAgentCount(state), 1)

  for (let index = 0; index < 4; index += 1) {
    state = startAgent(state, DEFAULT_SETTINGS, `Fill ${index}`, 3_000 + index)
  }
  assert.equal(runningAgentCount(state), 5)

  state = resumeAgent(state, DEFAULT_SETTINGS, idleTarget.id, 5_000)
  assert.equal(runningAgentCount(state), 5)
  assert.equal(state.agents.find((agent) => agent.id === idleTarget.id)?.status, "running")
  assert.equal(state.events.some((event) => event.kind === "capped"), true)
  assert.equal(state.events.some((event) => event.kind === "agent-resumed"), true)
})

test("deleting the current chat reassigns current and stops its agents", () => {
  let state = seedState(1_000)
  const current = state.currentChatId
  assert.ok(current)
  state = deleteChat(state, current, 2_000)
  assert.notEqual(state.currentChatId, current)
  assert.ok(state.currentChatId)
  assert.equal(state.chats.find((chat) => chat.id === current)?.status, "deleted")
  assert.equal(
    state.agents.filter((agent) => agent.chatId === current).every((agent) => agent.status === "stopped"),
    true,
  )
})

test("setCurrentChat reactivates a rotated chat and clears the notice", () => {
  let state = seedState(1_000)
  const rotated = state.chats.find((chat) => chat.status === "rotated")
  assert.ok(rotated)
  state = setCurrentChat(state, rotated.id, 2_000)
  assert.equal(state.currentChatId, rotated.id)
  assert.equal(state.chats.find((chat) => chat.id === rotated.id)?.status, "active")
  assert.equal(state.notice, null)
})

test("mergeSettings fills defaults and rejects non-finite overrides", () => {
  const merged = mergeSettings({ maxConcurrentAgents: 3, rotateAfterMessages: Number.NaN })
  assert.equal(merged.maxConcurrentAgents, 3)
  assert.equal(merged.rotateAfterMessages, DEFAULT_SETTINGS.rotateAfterMessages)
  assert.equal(merged.keepChatCount, DEFAULT_SETTINGS.keepChatCount)
  assert.deepEqual(mergeSettings(null), DEFAULT_SETTINGS)
})

test("isGuardState validates the persisted shape", () => {
  assert.equal(isGuardState(seedState(1_000)), true)
  assert.equal(isGuardState({ chats: [], agents: [] }), false)
  assert.equal(isGuardState(null), false)
})

test("toPluginSettings maps only the keys the plugin consumes", () => {
  const settings = { ...DEFAULT_SETTINGS, maxConcurrentAgents: 3, rotateAfterMessages: 15 }
  assert.deepEqual(toPluginSettings(settings), {
    maxConcurrentAgents: 3,
    rotateAfterMessages: 15,
  })
})

test("pluginSettingsJson emits valid JSON matching the plugin schema", () => {
  const settings = { ...DEFAULT_SETTINGS, maxConcurrentAgents: 4, rotateAfterMessages: 25 }
  const json = pluginSettingsJson(settings)
  assert.ok(json.endsWith("\n"))
  assert.deepEqual(JSON.parse(json), { maxConcurrentAgents: 4, rotateAfterMessages: 25 })
})
