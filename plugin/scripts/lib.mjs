import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
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
  return parseStdinChunks(chunks)
}

export function parseStdinChunks(chunks) {
  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8").trim()
  if (!raw) {
    return {}
  }
  return JSON.parse(raw)
}

export function writeHook(payload) {
  process.stdout.write(JSON.stringify(payload))
}

export function formatDiagnostic(action, error) {
  const kind = error?.code ?? error?.name ?? "Error"
  return `${action} failed (${kind})`
}

export function writeDiagnostic(message) {
  process.stderr.write(`Cursor Manager: ${message}\n`)
}

export async function writeStatus(output, text) {
  try {
    await new Promise((resolve, reject) => {
      output.write(text, (error) => (error ? reject(error) : resolve()))
    })
    return true
  } catch (error) {
    if (error?.code === "EPIPE") {
      return false
    }
    throw error
  }
}

function dataDir() {
  return join(homedir(), ".cursor", "cursor-manager")
}

/**
 * Parse JSON written by any editor. A leading UTF-8 BOM is stripped first:
 * Notepad and Windows PowerShell write one, and JSON.parse rejects it, so an
 * exported settings file would silently fall back to the defaults.
 */
export function parseJson(raw) {
  return JSON.parse(raw.replace(/^\uFEFF/, ""))
}

export async function readJson(file, fallback) {
  try {
    return parseJson(await readFile(file, "utf8"))
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback
    }
    throw error
  }
}

export async function loadSettings() {
  const file = join(dataDir(), "settings.json")
  const saved = await readJson(file, {})
  return normalizeSettings(saved)
}

function positiveInteger(value, fallback) {
  if (typeof value !== "number" && typeof value !== "string") {
    return fallback
  }
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function normalizeSettings(saved) {
  return {
    maxConcurrentAgents: positiveInteger(
      saved.maxConcurrentAgents,
      DEFAULT_SETTINGS.maxConcurrentAgents,
    ),
    rotateAfterMessages: positiveInteger(
      saved.rotateAfterMessages,
      DEFAULT_SETTINGS.rotateAfterMessages,
    ),
  }
}

export function parseState(saved) {
  const conversationsAreValid =
    saved?.conversations &&
    typeof saved.conversations === "object" &&
    !Array.isArray(saved.conversations)
  const healthIsValid =
    saved?.health === undefined ||
    saved?.health === null ||
    (saved.health &&
      typeof saved.health === "object" &&
      !Array.isArray(saved.health) &&
      (saved.health.samples === undefined || Array.isArray(saved.health.samples)))
  if (!conversationsAreValid || !healthIsValid) {
    throw new TypeError("Invalid Cursor Manager state shape")
  }
  return {
    conversations: saved.conversations,
    // Without this the samples written on one session start are dropped on the
    // next read, and the series never grows past one entry.
    health: {
      samples: Array.isArray(saved.health?.samples) ? saved.health.samples : [],
    },
  }
}

export async function loadState() {
  const file = join(dataDir(), "state.json")
  return parseState(await readJson(file, { conversations: {} }))
}

export async function saveState(state) {
  await writeJsonAtomic(join(dataDir(), "state.json"), state)
}

export async function writeJsonAtomic(file, value) {
  const dir = dirname(file)
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  const serialized = `${JSON.stringify(value, null, 2)}\n`
  await mkdir(dir, { recursive: true })
  try {
    await writeFile(temporary, serialized)
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

export function activeCount(state) {
  return Object.keys(state.conversations).length
}

/**
 * How long a tracked chat may go without a sessionEnd before it is assumed
 * dead. Generous against this product's own advice to rotate a chat after
 * about 45 minutes, so a genuinely long-lived session is not dropped early.
 */
export const STALE_CONVERSATION_MS = 43_200_000

/**
 * Drop conversations that outlived the stale window. sessionEnd does not run
 * when Cursor crashes or is force-quit, so without this the entry is tracked
 * forever and the count creeps past the cap until the file is edited by hand.
 *
 * Pure: returns the same instance when nothing was stale, so callers can use
 * `!==` to decide whether a write is needed.
 */
export function pruneStaleConversations(state, now) {
  const conversations = state?.conversations ?? {}
  const live = {}
  for (const [id, entry] of Object.entries(conversations)) {
    const startedAt = entry?.startedAt
    // An entry with no timestamp could never age out, which is the same
    // permanent-lockout this prune exists to prevent. A future-dated one is a
    // live chat seen through a skewed clock, so it stays.
    if (Number.isFinite(startedAt) && now - startedAt < STALE_CONVERSATION_MS) {
      live[id] = entry
    }
  }

  if (Object.keys(live).length === Object.keys(conversations).length) {
    return state
  }
  return { ...state, conversations: live }
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
    return state
  }

  const newest = samples[samples.length - 1]
  // Math.abs guards against a clock that moved backwards (NTP correction,
  // timezone/dual-boot flip, a hand-edited `at`) putting the newest sample in
  // the future: a plain `now - newest.at < SAMPLE_INTERVAL_MS` is true for
  // ANY negative difference, however large, which would wedge sampling until
  // wall-clock time caught back up.
  if (newest && Math.abs(now - newest.at) < SAMPLE_INTERVAL_MS) {
    return state
  }

  const next = [...samples, { at: now, chatDbBytes: bytes }]
  return { ...state, health: { samples: next.slice(-MAX_SAMPLES) } }
}
