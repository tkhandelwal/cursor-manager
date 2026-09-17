import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import {
  DEFAULT_SETTINGS,
  MAX_SAMPLES,
  SAMPLE_INTERVAL_MS,
  activeCount,
  capMessage,
  STALE_CONVERSATION_MS,
  cursorDataPaths,
  formatDiagnostic,
  normalizeSettings,
  parseJson,
  parseStdinChunks,
  pruneStaleConversations,
  readJson,
  recordHealthSample,
  statusReport,
  writeJsonAtomic,
  writeStatus,
} from "./lib.mjs"

function stateWith(count) {
  const conversations = {}
  for (let index = 0; index < count; index += 1) {
    conversations[`conv-${index}`] = { startedAt: index }
  }
  return { conversations }
}

test("activeCount counts tracked conversations", () => {
  assert.equal(activeCount(stateWith(0)), 0)
  assert.equal(activeCount(stateWith(3)), 3)
})

test("capMessage stays under the cap below the limit", () => {
  const message = capMessage(2, DEFAULT_SETTINGS)
  assert.match(message, /2\/5 tracked chats/)
  assert.doesNotMatch(message, /already tracked/)
})

test("capMessage warns once the cap is reached", () => {
  const message = capMessage(5, DEFAULT_SETTINGS)
  assert.match(message, /5 chats are already tracked \(cap 5\)/)
})

test("statusReport shows remaining room below the cap", () => {
  const report = statusReport(stateWith(3), DEFAULT_SETTINGS)
  assert.match(report, /Tracked chats: 3\/5/)
  assert.match(report, /Room for 2 more chats/)
  assert.doesNotMatch(report, /at cap/)
})

test("statusReport uses singular wording for one remaining slot", () => {
  const report = statusReport(stateWith(4), DEFAULT_SETTINGS)
  assert.match(report, /Room for 1 more chat\b/)
})

test("statusReport flags the at-cap state", () => {
  const report = statusReport(stateWith(6), DEFAULT_SETTINGS)
  assert.match(report, /Tracked chats: 6\/5 \(at cap\)/)
  assert.match(report, /At cap: finish or close an older agent/)
})

test("parseJson reads settings saved with a UTF-8 BOM", () => {
  // Notepad and Windows PowerShell's `Set-Content -Encoding utf8` both prepend
  // a BOM. JSON.parse rejects it, so an exported settings file silently fell
  // back to the defaults it was written to replace.
  const settings = parseJson('\uFEFF{"maxConcurrentAgents":3}')
  assert.equal(settings.maxConcurrentAgents, 3)
})

test("parseJson surfaces malformed JSON instead of silently resetting state", () => {
  assert.throws(() => parseJson("not json"), SyntaxError)
})

test("parseStdinChunks preserves UTF-8 characters split across buffers", () => {
  const raw = Buffer.from('{"conversation_id":"café"}')
  const split = raw.indexOf(0xc3) + 1
  assert.deepEqual(parseStdinChunks([raw.subarray(0, split), raw.subarray(split)]), {
    conversation_id: "café",
  })
})

test("parseStdinChunks surfaces malformed hook input", () => {
  assert.throws(() => parseStdinChunks([Buffer.from("not json")]), SyntaxError)
})

test("readJson uses the fallback only when the file does not exist", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cursor-manager-read-"))
  try {
    assert.deepEqual(await readJson(join(dir, "missing.json"), { firstRun: true }), {
      firstRun: true,
    })

    const directoryPath = join(dir, "not-a-file")
    await mkdir(directoryPath)
    await assert.rejects(readJson(directoryPath, { hidden: true }), (error) => {
      assert.notEqual(error.code, "ENOENT")
      return true
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("readJson surfaces malformed files instead of returning the fallback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cursor-manager-malformed-"))
  const file = join(dir, "state.json")
  try {
    await writeFile(file, '{"conversations":')
    await assert.rejects(readJson(file, { conversations: {} }), SyntaxError)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("writeJsonAtomic replaces a complete file and removes its temporary file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cursor-manager-write-"))
  const file = join(dir, "state.json")
  try {
    await writeFile(file, '{"old":true}\n')
    await writeJsonAtomic(file, { conversations: { current: { startedAt: 1 } } })
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), {
      conversations: { current: { startedAt: 1 } },
    })
    assert.deepEqual(await readdir(dir), ["state.json"])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("normalizeSettings accepts positive integers and rejects zero explicitly", () => {
  assert.deepEqual(normalizeSettings({ maxConcurrentAgents: "3", rotateAfterMessages: 12 }), {
    maxConcurrentAgents: 3,
    rotateAfterMessages: 12,
  })
  assert.deepEqual(normalizeSettings({ maxConcurrentAgents: 0, rotateAfterMessages: -1 }), {
    maxConcurrentAgents: DEFAULT_SETTINGS.maxConcurrentAgents,
    rotateAfterMessages: DEFAULT_SETTINGS.rotateAfterMessages,
  })
  assert.deepEqual(normalizeSettings({ maxConcurrentAgents: true, rotateAfterMessages: 2.5 }), {
    maxConcurrentAgents: DEFAULT_SETTINGS.maxConcurrentAgents,
    rotateAfterMessages: DEFAULT_SETTINGS.rotateAfterMessages,
  })
})

test("formatDiagnostic reports an error class without exposing file contents", () => {
  assert.equal(
    formatDiagnostic("state read", Object.assign(new Error("secret path"), { code: "EACCES" })),
    "state read failed (EACCES)",
  )
  assert.equal(
    formatDiagnostic("settings parse", new SyntaxError("bad JSON")),
    "settings parse failed (SyntaxError)",
  )
})

test("writeStatus treats a closed output pipe as a normal early exit", async () => {
  const output = {
    write(_text, callback) {
      callback(Object.assign(new Error("closed"), { code: "EPIPE" }))
    },
  }
  assert.equal(await writeStatus(output, "status\n"), false)
})

test("writeStatus surfaces output failures other than EPIPE", async () => {
  const output = {
    write(_text, callback) {
      callback(Object.assign(new Error("disk failed"), { code: "EIO" }))
    },
  }
  await assert.rejects(writeStatus(output, "status\n"), { code: "EIO" })
})

test("pruneStaleConversations drops a conversation past the stale window", () => {
  // sessionEnd never fires on a crash or force-quit, so its entry would
  // otherwise be tracked forever and wedge the count above the cap.
  const now = 10 * STALE_CONVERSATION_MS
  const state = { conversations: { dead: { startedAt: now - STALE_CONVERSATION_MS - 1 } } }
  assert.deepEqual(pruneStaleConversations(state, now).conversations, {})
})

test("pruneStaleConversations keeps a conversation inside the stale window", () => {
  const now = 10 * STALE_CONVERSATION_MS
  const startedAt = now - STALE_CONVERSATION_MS + 1
  const state = { conversations: { live: { startedAt } } }
  assert.deepEqual(pruneStaleConversations(state, now).conversations, { live: { startedAt } })
})

test("pruneStaleConversations returns the same state instance when nothing is stale", () => {
  // session-start.mjs decides whether to write with `!== state`. Allocating a
  // fresh object here would save on every single session start.
  const state = { conversations: { live: { startedAt: 0 } } }
  assert.equal(pruneStaleConversations(state, 1), state)
})

test("pruneStaleConversations drops an entry with no usable startedAt", () => {
  // A hand-edited or pre-upgrade entry with no timestamp can never age out,
  // which is the same permanent-lockout bug this prune exists to prevent.
  const state = { conversations: { legacy: { mode: "agent" } } }
  assert.deepEqual(pruneStaleConversations(state, 5 * STALE_CONVERSATION_MS).conversations, {})
})

test("pruneStaleConversations keeps an entry whose clock is in the future", () => {
  // A backward clock jump makes startedAt look future-dated. That is a live
  // chat with a skewed timestamp, not a dead one, so it must survive.
  const state = { conversations: { skewed: { startedAt: 10 * STALE_CONVERSATION_MS } } }
  assert.deepEqual(pruneStaleConversations(state, 0).conversations, {
    skewed: { startedAt: 10 * STALE_CONVERSATION_MS },
  })
})

test("pruneStaleConversations leaves health samples untouched", () => {
  const state = {
    conversations: { dead: { startedAt: 0 } },
    health: { samples: [{ at: 1, chatDbBytes: 2 }] },
  }
  const next = pruneStaleConversations(state, 5 * STALE_CONVERSATION_MS)
  assert.deepEqual(next.health.samples, [{ at: 1, chatDbBytes: 2 }])
})

const HOUR = 3_600_000

function emptyState() {
  return { conversations: {}, health: { samples: [] } }
}

test("cursorDataPaths points at the chat database per platform", () => {
  assert.equal(
    cursorDataPaths("win32", "C:\\Users\\me", "C:\\Users\\me\\AppData\\Roaming").chatDb,
    "C:\\Users\\me\\AppData\\Roaming\\Cursor\\User\\globalStorage\\state.vscdb",
  )
  assert.equal(
    cursorDataPaths("darwin", "/Users/me").chatDb,
    "/Users/me/Library/Application Support/Cursor/User/globalStorage/state.vscdb",
  )
  assert.equal(
    cursorDataPaths("linux", "/home/me").chatDb,
    "/home/me/.config/Cursor/User/globalStorage/state.vscdb",
  )
})

test("an unknown platform falls back to the linux layout rather than throwing", () => {
  assert.equal(
    cursorDataPaths("freebsd", "/home/me").chatDb,
    "/home/me/.config/Cursor/User/globalStorage/state.vscdb",
  )
})

test("recordHealthSample appends the first sample", () => {
  const next = recordHealthSample(emptyState(), 1000, 5 * HOUR)
  assert.deepEqual(next.health.samples, [{ at: 5 * HOUR, chatDbBytes: 1000 }])
})

test("recordHealthSample skips a sample taken inside the interval", () => {
  const state = recordHealthSample(emptyState(), 1000, 5 * HOUR)
  const next = recordHealthSample(state, 2000, 5 * HOUR + SAMPLE_INTERVAL_MS - 1)
  assert.equal(next.health.samples.length, 1, "must not record twice within the interval")
  assert.equal(next.health.samples[0].chatDbBytes, 1000)
})

test("recordHealthSample records again once the interval has passed", () => {
  const state = recordHealthSample(emptyState(), 1000, 5 * HOUR)
  const next = recordHealthSample(state, 2000, 5 * HOUR + SAMPLE_INTERVAL_MS)
  assert.equal(next.health.samples.length, 2)
  assert.deepEqual(next.health.samples[1], { at: 5 * HOUR + SAMPLE_INTERVAL_MS, chatDbBytes: 2000 })
})

test("recordHealthSample caps the series at MAX_SAMPLES, keeping the newest", () => {
  let state = emptyState()
  for (let index = 0; index < MAX_SAMPLES + 25; index += 1) {
    state = recordHealthSample(state, index, index * SAMPLE_INTERVAL_MS)
  }
  assert.equal(state.health.samples.length, MAX_SAMPLES)
  assert.equal(
    state.health.samples[state.health.samples.length - 1].chatDbBytes,
    MAX_SAMPLES + 24,
    "the newest sample must survive the cap",
  )
  assert.ok(
    state.health.samples[0].chatDbBytes > 0,
    "the oldest samples are the ones dropped",
  )
})

test("recordHealthSample leaves conversations untouched", () => {
  const state = { conversations: { a: { startedAt: 1 } }, health: { samples: [] } }
  const next = recordHealthSample(state, 10, HOUR)
  assert.deepEqual(next.conversations, { a: { startedAt: 1 } })
})

test("recordHealthSample tolerates a state with no health key", () => {
  const next = recordHealthSample({ conversations: {} }, 10, HOUR)
  assert.equal(next.health.samples.length, 1)
})

test("recordHealthSample ignores a non-finite size rather than storing junk", () => {
  const next = recordHealthSample(emptyState(), Number.NaN, HOUR)
  assert.equal(next.health.samples.length, 0)
})

test("recordHealthSample returns the same state instance when the size is not finite", () => {
  const state = emptyState()
  const next = recordHealthSample(state, Number.NaN, HOUR)
  assert.equal(next, state, "nothing was sampled, so no fresh object should be allocated")
})

test("recordHealthSample returns the same state instance when throttled", () => {
  const state = recordHealthSample(emptyState(), 1000, 5 * HOUR)
  const next = recordHealthSample(state, 2000, 5 * HOUR + SAMPLE_INTERVAL_MS - 1)
  // session-start.mjs decides whether to save with `sampled !== state`. If
  // this early return allocated a fresh object, that guard would be true
  // after every throttled call too, saving on nearly every session start.
  assert.equal(next, state, "no write is needed when nothing was appended")
})

test("recordHealthSample accepts a new sample when the newest sample's clock is in the future", () => {
  // Simulates a backward clock jump (NTP correction, dual-boot tz flip, a
  // hand-edited `at`): the newest recorded sample is far in the future
  // relative to the current `now`. A plain `now - newest.at < INTERVAL`
  // would be true for any negative difference, however large, and would
  // wedge sampling forever until wall-clock time caught back up.
  const future = 10 * SAMPLE_INTERVAL_MS
  const state = recordHealthSample(emptyState(), 1000, future)
  const now = 0
  const next = recordHealthSample(state, 2000, now)
  assert.equal(
    next.health.samples.length,
    2,
    "a backward clock jump must not wedge sampling forever",
  )
  assert.equal(next.health.samples[1].chatDbBytes, 2000)
})
