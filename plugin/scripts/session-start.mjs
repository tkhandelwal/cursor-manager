#!/usr/bin/env node

import {
  activeCount,
  capMessage,
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

writeHook({ additional_context: capMessage(activeCount(state), settings) })
