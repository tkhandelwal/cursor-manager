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
