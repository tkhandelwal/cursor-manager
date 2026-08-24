#!/usr/bin/env node

import { stat } from "node:fs/promises"
import { homedir } from "node:os"

import {
  activeCount,
  capMessage,
  cursorDataPaths,
  loadSettings,
  loadState,
  readStdinJson,
  recordHealthSample,
  saveState,
  writeHook,
} from "./lib.mjs"

const input = await readStdinJson()
const id = input.conversation_id || input.session_id
const settings = await loadSettings()
const state = await loadState()

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
  sampled.conversations[id] = {
    startedAt: Date.now(),
    mode: input.composer_mode ?? "agent",
    background: Boolean(input.is_background_agent),
  }
}
if (id || sampled !== state) {
  await saveState(sampled)
}

writeHook({ additional_context: capMessage(activeCount(sampled), settings) })
