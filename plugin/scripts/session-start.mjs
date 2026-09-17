#!/usr/bin/env node

import { stat } from "node:fs/promises"
import { homedir } from "node:os"

import {
  DEFAULT_SETTINGS,
  activeCount,
  capMessage,
  cursorDataPaths,
  formatDiagnostic,
  loadSettings,
  loadState,
  pruneStaleConversations,
  readStdinJson,
  recordHealthSample,
  saveState,
  writeDiagnostic,
  writeHook,
} from "./lib.mjs"

const warnings = []
function warn(action, error) {
  const message = formatDiagnostic(action, error)
  warnings.push(message)
  writeDiagnostic(message)
}

let input = {}
try {
  input = await readStdinJson()
} catch (error) {
  warn("hook input parse", error)
}
const id = input.conversation_id || input.session_id
let settings = DEFAULT_SETTINGS
try {
  settings = await loadSettings()
} catch (error) {
  warn("settings read", error)
}

let stored = { conversations: {}, health: { samples: [] } }
let stateReadable = true
try {
  stored = await loadState()
} catch (error) {
  stateReadable = false
  warn("state read", error)
}
// Chats whose sessionEnd never ran are dropped here, so a crash cannot leave
// the count permanently above the cap.
const state = pruneStaleConversations(stored, Date.now())

// Sampling is strictly additive to behaviour that already works: any failure
// here must leave the hook's normal output intact. A hook that throws
// disrupts the Cursor session it was meant to help.
let sampled = state
try {
  const { chatDb } = cursorDataPaths(process.platform, homedir(), process.env.APPDATA)
  const info = await stat(chatDb)
  sampled = recordHealthSample(state, info.size, Date.now())
} catch {
  /* no chat database, or it could not be read: skip this sample */
}

if (id) {
  sampled = {
    ...sampled,
    conversations: {
      ...sampled.conversations,
      [id]: {
        startedAt: Date.now(),
        mode: input.composer_mode ?? "agent",
        background: Boolean(input.is_background_agent),
      },
    },
  }
}
if (stateReadable && (id || sampled !== stored)) {
  try {
    await saveState(sampled)
  } catch (error) {
    // Disk full, permission error, AV lock, roaming-profile hiccup, etc. This
    // hook's contract is to hand Cursor JSON on stdout; persisting state is
    // best-effort and must never stop that from happening.
    warn("state save", error)
  }
}

const warning = warnings.length > 0 ? `Cursor Manager warning: ${warnings.join("; ")}. ` : ""
writeHook({ additional_context: `${warning}${capMessage(activeCount(sampled), settings)}` })
