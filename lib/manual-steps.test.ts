import assert from "node:assert/strict"
import { test } from "node:test"

import {
  MANUAL_GROUPS,
  MANUAL_STEPS,
  completedCount,
  defaultChecklistState,
  mergeChecklistState,
} from "./manual-steps"

test("defaults mark every step as not done", () => {
  const state = defaultChecklistState()
  assert.equal(Object.keys(state).length, MANUAL_STEPS.length)
  assert.ok(MANUAL_STEPS.every((step) => state[step.id] === false))
  assert.equal(completedCount(state), 0)
})

test("every step has a label, location, and known group", () => {
  assert.ok(MANUAL_STEPS.length > 0)
  assert.ok(MANUAL_STEPS.every((step) => step.label && step.where && MANUAL_GROUPS.includes(step.group)))
})

test("completedCount reflects checked steps", () => {
  const state = defaultChecklistState()
  state[MANUAL_STEPS[0].id] = true
  state[MANUAL_STEPS[1].id] = true
  assert.equal(completedCount(state), 2)
})

test("mergeChecklistState keeps known booleans and drops junk", () => {
  const merged = mergeChecklistState({ [MANUAL_STEPS[0].id]: true, bogus: true })
  assert.equal(merged[MANUAL_STEPS[0].id], true)
  assert.equal("bogus" in merged, false)
  assert.equal(merged[MANUAL_STEPS[1].id], false)
})
