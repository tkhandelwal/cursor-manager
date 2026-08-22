import { homedir } from "node:os"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export const DEFAULT_SETTINGS = {
  maxConcurrentAgents: 5,
  rotateAfterMessages: 20,
}

export async function readStdinJson() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  const raw = chunks.join("").trim()
  if (!raw) {
    return {}
  }
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function writeHook(payload) {
  process.stdout.write(JSON.stringify(payload))
}

function dataDir() {
  return join(homedir(), ".cursor", "cursor-manager")
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return fallback
  }
}

export async function loadSettings() {
  const file = join(dataDir(), "settings.json")
  const saved = await readJson(file, {})
  return {
    maxConcurrentAgents: Number(saved.maxConcurrentAgents) || DEFAULT_SETTINGS.maxConcurrentAgents,
    rotateAfterMessages: Number(saved.rotateAfterMessages) || DEFAULT_SETTINGS.rotateAfterMessages,
  }
}

export async function loadState() {
  const file = join(dataDir(), "state.json")
  const saved = await readJson(file, { conversations: {} })
  return {
    conversations:
      saved.conversations && typeof saved.conversations === "object" ? saved.conversations : {},
  }
}

export async function saveState(state) {
  const dir = dataDir()
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, "state.json"), `${JSON.stringify(state, null, 2)}\n`)
}

export function activeCount(state) {
  return Object.keys(state.conversations).length
}

export function capMessage(count, settings) {
  const atCap = count >= settings.maxConcurrentAgents
  return atCap
    ? `Cursor Manager: ${count} chats are already tracked (cap ${settings.maxConcurrentAgents}). Tell the user to finish or close an older agent before starting more parallel work.`
    : `Cursor Manager: ${count}/${settings.maxConcurrentAgents} tracked chats. Start a new chat (Cmd/Ctrl+N) after about ${settings.rotateAfterMessages} messages, 45 minutes, or when the context ring stays full.`
}

export function statusReport(state, settings) {
  const count = activeCount(state)
  const atCap = count >= settings.maxConcurrentAgents
  const room = Math.max(0, settings.maxConcurrentAgents - count)
  const lines = [
    "Cursor Manager status",
    `- Tracked chats: ${count}/${settings.maxConcurrentAgents}${atCap ? " (at cap)" : ""}`,
    `- Rotate after: ${settings.rotateAfterMessages} messages / 45 min / full context ring`,
    atCap
      ? "- At cap: finish or close an older agent (or /rotate-chat) before starting more parallel work."
      : `- Room for ${room} more ${room === 1 ? "chat" : "chats"} before the cap.`,
  ]
  return lines.join("\n")
}
