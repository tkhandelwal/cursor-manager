#!/usr/bin/env node

import {
  DEFAULT_SETTINGS,
  formatDiagnostic,
  loadSettings,
  readStdinJson,
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
let settings = DEFAULT_SETTINGS
try {
  settings = await loadSettings()
} catch (error) {
  warn("settings read", error)
}
const usage =
  typeof input.context_usage_percent === "number"
    ? `${input.context_usage_percent}% full`
    : "nearly full"
const messages =
  typeof input.message_count === "number" ? `${input.message_count} messages` : "a long thread"

writeHook({
  user_message: `${warnings.length > 0 ? `Cursor Manager warning: ${warnings.join("; ")}. ` : ""}Cursor Manager: this chat is ${usage} (${messages}). Start a new chat with Cmd/Ctrl+N. Cursor will not delete History for you — use Developer: Delete Old Chats when you are done. Cap parallel agents at ${settings.maxConcurrentAgents}.`,
})
