import { homedir } from "node:os"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import path from "node:path"

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
    // Without this the samples written on one session start are dropped on the
    // next read, and the series never grows past one entry.
    health: {
      samples: Array.isArray(saved.health?.samples) ? saved.health.samples : [],
    },
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

/** At most one sample per hour; keep the newest 180 (about a week of dense use). */
export const SAMPLE_INTERVAL_MS = 3_600_000
export const MAX_SAMPLES = 180

/**
 * Where Cursor keeps its data, per platform. Mirrors lib/cursor-paths.ts —
 * duplicated deliberately because this file runs standalone from
 * ~/.cursor/plugins and cannot import the app's TypeScript.
 *
 * Uses explicit win32/posix flavours so paths for one OS can be built and
 * asserted from a host running another.
 */
export function cursorDataPaths(platform, home, appData) {
  const p = platform === "win32" ? path.win32 : path.posix
  let root
  if (platform === "win32") {
    root = p.join(appData ?? p.join(home, "AppData", "Roaming"), "Cursor")
  } else if (platform === "darwin") {
    root = p.join(home, "Library", "Application Support", "Cursor")
  } else {
    root = p.join(home, ".config", "Cursor")
  }
  return { chatDb: p.join(root, "User", "globalStorage", "state.vscdb") }
}

/**
 * Append a size sample, honouring the interval and the cap. Pure: returns a
 * new state rather than mutating, and takes `now` so the throttle is testable
 * without a clock.
 */
export function recordHealthSample(state, bytes, now) {
  const samples = Array.isArray(state?.health?.samples) ? state.health.samples : []
  if (!Number.isFinite(bytes) || bytes < 0) {
    return { ...state, health: { samples } }
  }

  const newest = samples[samples.length - 1]
  if (newest && now - newest.at < SAMPLE_INTERVAL_MS) {
    return { ...state, health: { samples } }
  }

  const next = [...samples, { at: now, chatDbBytes: bytes }]
  return { ...state, health: { samples: next.slice(-MAX_SAMPLES) } }
}
