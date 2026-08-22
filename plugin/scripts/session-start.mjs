#!/usr/bin/env node

import {
  activeCount,
  loadSettings,
  loadState,
  readStdinJson,
  saveState,
  writeHook,
} from "./lib.mjs"

const input = await readStdinJson()
const id = input.conversation_id || input.session_id
const settings = await loadSettings()
const state = await loadState()

if (id) {
  state.conversations[id] = {
    startedAt: Date.now(),
    mode: input.composer_mode ?? "agent",
    background: Boolean(input.is_background_agent),
  }
  await saveState(state)
}

const count = activeCount(state)
const atCap = count >= settings.maxConcurrentAgents
const extra = atCap
  ? `Cursor Manager: ${count} chats are already tracked (cap ${settings.maxConcurrentAgents}). Tell the user to finish or close an older agent before starting more parallel work.`
  : `Cursor Manager: ${count}/${settings.maxConcurrentAgents} tracked chats. Start a new chat (Cmd/Ctrl+N) after about ${settings.rotateAfterMessages} messages, 45 minutes, or when the context ring stays full.`

writeHook({ additional_context: extra })
