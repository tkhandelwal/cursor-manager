import assert from "node:assert/strict"
import { test } from "node:test"

import {
  addWork,
  applyRotation,
  rotationReasons,
  runningAgentCount,
  seedState,
  startAgent,
  startChat,
  tickMinutes,
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
