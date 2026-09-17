#!/usr/bin/env node

import {
  loadState,
  pruneStaleConversations,
  readStdinJson,
  saveState,
  writeHook,
} from "./lib.mjs"

const input = await readStdinJson()
const id = input.conversation_id || input.session_id
const stored = await loadState()
const state = pruneStaleConversations(stored, Date.now())
let changed = state !== stored

if (id && state.conversations[id]) {
  delete state.conversations[id]
  changed = true
}
if (changed) {
  await saveState(state)
}

writeHook({})
