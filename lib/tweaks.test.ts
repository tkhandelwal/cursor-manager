import assert from "node:assert/strict"
import { test } from "node:test"

import {
  TWEAKS,
  buildSettings,
  defaultTweakState,
  deletePreset,
  diffSettings,
  importSettings,
  mergePresets,
  mergeTweakState,
  savePreset,
  tweakSettingsJson,
} from "./tweaks"

test("defaults use recommended values and enable every key", () => {
  const state = defaultTweakState()
  assert.equal(Object.keys(state.values).length, TWEAKS.length)
  assert.equal(state.values["cursor.worktreeMaxCount"], 25)
  assert.equal(state.values["git.showCursorWorktrees"], true)
  assert.equal(state.values["cursor.composer.usageSummaryDisplay"], "always")
  assert.ok(TWEAKS.every((tweak) => state.enabled[tweak.key] === true))
})

test("buildSettings omits disabled keys", () => {
  const state = defaultTweakState()
  state.enabled["cursor.general.disableHttp2"] = false
  const built = buildSettings(state)
  assert.equal("cursor.general.disableHttp2" in built, false)
  assert.equal(built["cursor.worktreeMaxCount"], 25)
  assert.equal(Object.keys(built).length, TWEAKS.length - 1)
})

test("buildSettings clamps numbers into range and snaps to the step", () => {
  const state = defaultTweakState()
  state.values["cursor.worktreeMaxCount"] = 9_999
  state.values["cursor.composer.textSizeScale"] = 0.1
  const built = buildSettings(state)
  assert.equal(built["cursor.worktreeMaxCount"], 100)
  assert.equal(built["cursor.composer.textSizeScale"], 0.8)
})

test("mergeTweakState coerces invalid persisted values back to safe defaults", () => {
  const merged = mergeTweakState({
    values: {
      "cursor.worktreeMaxCount": "nope",
      "cursor.composer.usageSummaryDisplay": "bogus",
      "git.showCursorWorktrees": false,
    },
    enabled: { "cursor.general.disableHttp2": false },
  })
  assert.equal(merged.values["cursor.worktreeMaxCount"], 25)
  assert.equal(merged.values["cursor.composer.usageSummaryDisplay"], "always")
  assert.equal(merged.values["git.showCursorWorktrees"], false)
  assert.equal(merged.enabled["cursor.general.disableHttp2"], false)
})

test("tweakSettingsJson is valid JSON matching the enabled keys", () => {
  const json = tweakSettingsJson(defaultTweakState())
  assert.ok(json.endsWith("\n"))
  const parsed = JSON.parse(json)
  assert.equal(parsed["cursor.worktreeMaxCount"], 25)
  assert.equal(parsed["cursor.general.disableHttp2"], false)
})

test("catalog only exposes official or staff-confirmed keys", () => {
  assert.ok(TWEAKS.length > 0)
  assert.ok(TWEAKS.every((tweak) => tweak.status === "Official" || tweak.status === "Staff"))
})

test("importSettings includes present keys and excludes absent ones", () => {
  const result = importSettings(
    JSON.stringify({ "cursor.worktreeMaxCount": 30, "git.showCursorWorktrees": true }),
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.state.values["cursor.worktreeMaxCount"], 30)
  assert.equal(result.state.enabled["cursor.worktreeMaxCount"], true)
  assert.equal(result.state.enabled["git.showCursorWorktrees"], true)
  assert.equal(result.state.enabled["cursor.general.disableHttp2"], false)
  assert.deepEqual(result.unmanagedKeys, [])
})

test("importSettings coerces out-of-range values from the paste", () => {
  const result = importSettings(JSON.stringify({ "cursor.worktreeMaxCount": 9_999 }))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.state.values["cursor.worktreeMaxCount"], 100)
})

test("importSettings reports keys it does not manage", () => {
  const result = importSettings(
    JSON.stringify({ "cursor.worktreeMaxCount": 25, "editor.fontSize": 14, "workbench.colorTheme": "x" }),
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.unmanagedKeys.sort(), ["editor.fontSize", "workbench.colorTheme"])
})

test("importSettings rejects invalid JSON and non-objects", () => {
  assert.equal(importSettings("not json").ok, false)
  assert.equal(importSettings("[1,2,3]").ok, false)
  assert.equal(importSettings("42").ok, false)
})

test("export then import round-trips the managed keys", () => {
  const start = defaultTweakState()
  start.values["cursor.worktreeMaxCount"] = 40
  start.enabled["cursor.general.disableHttp2"] = false
  const result = importSettings(tweakSettingsJson(start))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(buildSettings(result.state), buildSettings(start))
})

test("diffSettings reports added, removed, and changed keys", () => {
  const current = defaultTweakState()
  const next = defaultTweakState()
  next.values["cursor.worktreeMaxCount"] = 40 // changed
  next.enabled["cursor.general.disableHttp2"] = false // removed
  current.enabled["git.showCursorWorktrees"] = false // added (present in next, absent in current)

  const changes = diffSettings(current, next)
  const byKey = Object.fromEntries(changes.map((change) => [change.key, change]))
  assert.equal(byKey["cursor.worktreeMaxCount"].kind, "changed")
  assert.equal(byKey["cursor.worktreeMaxCount"].from, 25)
  assert.equal(byKey["cursor.worktreeMaxCount"].to, 40)
  assert.equal(byKey["cursor.general.disableHttp2"].kind, "removed")
  assert.equal(byKey["git.showCursorWorktrees"].kind, "added")
})

test("diffSettings returns nothing for identical states", () => {
  assert.deepEqual(diffSettings(defaultTweakState(), defaultTweakState()), [])
})

test("savePreset upserts by name and keeps the list sorted", () => {
  const state = defaultTweakState()
  let presets = savePreset([], "Beta", state)
  presets = savePreset(presets, "Alpha", state)
  assert.deepEqual(presets.map((preset) => preset.name), ["Alpha", "Beta"])

  const changed = defaultTweakState()
  changed.values["cursor.worktreeMaxCount"] = 10
  presets = savePreset(presets, "Alpha", changed)
  assert.equal(presets.length, 2)
  assert.equal(presets.find((preset) => preset.name === "Alpha")?.state.values["cursor.worktreeMaxCount"], 10)
})

test("savePreset ignores blank names and deletePreset removes by name", () => {
  const presets = savePreset([], "   ", defaultTweakState())
  assert.equal(presets.length, 0)

  const withOne = savePreset([], "Keep", defaultTweakState())
  assert.deepEqual(deletePreset(withOne, "Keep"), [])
})

test("mergePresets validates persisted presets and drops junk", () => {
  const merged = mergePresets([
    { name: "Good", state: { values: { "cursor.worktreeMaxCount": 30 }, enabled: {} } },
    { name: "" },
    "nope",
    { state: {} },
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].name, "Good")
  assert.equal(merged[0].state.values["cursor.worktreeMaxCount"], 30)
})
