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
  try {
    await saveState(state)
  } catch {
    // Matches session-start.mjs: persisting is best-effort, but handing Cursor
    // JSON on stdout is the contract. Throwing here would also strand the
    // entry this hook exists to remove, which pruneStaleConversations then
    // takes the full stale window to clear.
  }
}

writeHook({})
