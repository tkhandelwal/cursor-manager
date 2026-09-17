#!/usr/bin/env node

import {
  formatDiagnostic,
  loadState,
  pruneStaleConversations,
  readStdinJson,
  saveState,
  writeDiagnostic,
  writeHook,
} from "./lib.mjs"

let input = {}
try {
  input = await readStdinJson()
} catch (error) {
  writeDiagnostic(formatDiagnostic("hook input parse", error))
}
const id = input.conversation_id || input.session_id
if (!id) {
  writeDiagnostic("session-end input is missing conversation identifier")
}

let stored = { conversations: {}, health: { samples: [] } }
let stateReadable = true
try {
  stored = await loadState()
} catch (error) {
  stateReadable = false
  writeDiagnostic(formatDiagnostic("state read", error))
}
let state = pruneStaleConversations(stored, Date.now())
let changed = state !== stored

if (id && state.conversations[id]) {
  const remaining = { ...state.conversations }
  delete remaining[id]
  state = { ...state, conversations: remaining }
  changed = true
}
if (stateReadable && changed) {
  try {
    await saveState(state)
  } catch (error) {
    // Matches session-start.mjs: persisting is best-effort, but handing Cursor
    // JSON on stdout is the contract. Throwing here would also strand the
    // entry this hook exists to remove, which pruneStaleConversations then
    // takes the full stale window to clear.
    writeDiagnostic(formatDiagnostic("state save", error))
  }
}

writeHook({})
