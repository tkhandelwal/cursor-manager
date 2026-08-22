#!/usr/bin/env node

import { loadSettings, readStdinJson, writeHook } from "./lib.mjs"

const input = await readStdinJson()
const settings = await loadSettings()
const usage =
  typeof input.context_usage_percent === "number"
    ? `${input.context_usage_percent}% full`
    : "nearly full"
const messages =
  typeof input.message_count === "number" ? `${input.message_count} messages` : "a long thread"

writeHook({
  user_message: `Cursor Manager: this chat is ${usage} (${messages}). Start a new chat with Cmd/Ctrl+N. Cursor will not delete History for you — use Developer: Delete Old Chats when you are done. Cap parallel agents at ${settings.maxConcurrentAgents}.`,
})
