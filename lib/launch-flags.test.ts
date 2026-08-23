import assert from "node:assert/strict"
import { test } from "node:test"

import {
  LAUNCH_FLAGS,
  LAUNCH_GROUPS,
  buildLaunchCommand,
  defaultFlagState,
  enabledFlagCount,
  mergeFlagState,
} from "./launch-flags"

test("every catalog entry has a unique id and a real long-form flag", () => {
  assert.ok(LAUNCH_FLAGS.length > 0)
  const ids = new Set<string>()
  for (const entry of LAUNCH_FLAGS) {
    assert.ok(!ids.has(entry.id), `duplicate id ${entry.id}`)
    ids.add(entry.id)
    assert.match(entry.flag, /^--[a-z][a-z-]*$/, `${entry.id} is not a long-form flag`)
    assert.ok(entry.label.length > 0, `${entry.id} has no label`)
    assert.ok(entry.description.length > 0, `${entry.id} has no description`)
    assert.ok(LAUNCH_GROUPS.includes(entry.group), `${entry.id} has an unknown group`)
  }
})

test("defaults leave every flag off", () => {
  const state = defaultFlagState()
  assert.equal(enabledFlagCount(state), 0)
  for (const entry of LAUNCH_FLAGS) {
    assert.equal(state[entry.id], false)
  }
})

test("buildLaunchCommand returns a bare cursor call when nothing is enabled", () => {
  assert.equal(buildLaunchCommand(defaultFlagState()), "cursor")
})

test("buildLaunchCommand appends enabled flags in catalog order", () => {
  const state = defaultFlagState()
  state["disable-extensions"] = true
  state["disable-gpu"] = true

  const gpuFirst =
    LAUNCH_FLAGS.findIndex((entry) => entry.id === "disable-gpu") <
    LAUNCH_FLAGS.findIndex((entry) => entry.id === "disable-extensions")

  assert.equal(
    buildLaunchCommand(state),
    gpuFirst ? "cursor --disable-gpu --disable-extensions" : "cursor --disable-extensions --disable-gpu",
  )
  assert.equal(enabledFlagCount(state), 2)
})

test("the two flags this section was built for are in the catalog", () => {
  const flags = LAUNCH_FLAGS.map((entry) => entry.flag)
  assert.ok(flags.includes("--disable-gpu"))
  assert.ok(flags.includes("--disable-extensions"))
})

test("mergeFlagState keeps known booleans and drops junk", () => {
  const merged = mergeFlagState({ "disable-gpu": true, "not-a-flag": true, verbose: "yes" })
  assert.equal(merged["disable-gpu"], true)
  assert.equal("not-a-flag" in merged, false)
  assert.equal(merged["verbose"], false)
  assert.equal(Object.keys(merged).length, LAUNCH_FLAGS.length)
})

test("mergeFlagState falls back to defaults for non-objects", () => {
  assert.deepEqual(mergeFlagState(null), defaultFlagState())
  assert.deepEqual(mergeFlagState("nope"), defaultFlagState())
})
