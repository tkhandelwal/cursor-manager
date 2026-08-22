#!/usr/bin/env node

import { loadState, readStdinJson, saveState, writeHook } from "./lib.mjs"

const input = await readStdinJson()
const id = input.conversation_id || input.session_id
const state = await loadState()

if (id && state.conversations[id]) {
  delete state.conversations[id]
  await saveState(state)
}

writeHook({})
