import assert from "node:assert/strict"
import { test } from "node:test"

import {
  TWEAKS,
  buildSettings,
  defaultTweakState,
  mergeTweakState,
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
