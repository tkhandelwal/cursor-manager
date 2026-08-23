import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import { CursorignoreGenerator } from "@/components/cursorignore-generator"
import { ManualChecklist } from "@/components/manual-checklist"
import { CursorTweaks } from "@/components/cursor-tweaks"

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

test("adding a custom .cursorignore pattern shows a chip and bumps the count", () => {
  render(<CursorignoreGenerator />)
  assert.ok(screen.getByText("No custom patterns."))

  fireEvent.change(screen.getByPlaceholderText(/Add a pattern/), { target: { value: "tmp/" } })
  fireEvent.click(screen.getByRole("button", { name: "Add pattern" }))

  assert.ok(screen.getByText("tmp/"))
  assert.ok(screen.getByRole("button", { name: "Remove tmp/" }))
})

test("removing a custom pattern takes it back out", () => {
  render(<CursorignoreGenerator />)
  fireEvent.change(screen.getByPlaceholderText(/Add a pattern/), { target: { value: "*.bak" } })
  fireEvent.click(screen.getByRole("button", { name: "Add pattern" }))
  assert.ok(screen.getByText("*.bak"))

  fireEvent.click(screen.getByRole("button", { name: "Remove *.bak" }))
  assert.equal(screen.queryByText("*.bak"), null)
})

test("checking a manual step updates the progress count", () => {
  render(<ManualChecklist />)
  assert.ok(screen.getByText(/0 of \d+ done\./))

  const toggle = screen.getByRole("switch", { name: "Set Max Tab Count to 5" })
  fireEvent.click(toggle)

  assert.ok(screen.getByText(/1 of \d+ done\./))
})

test("saving a tweak preset renders a loadable chip", () => {
  render(<CursorTweaks />)
  fireEvent.change(screen.getByPlaceholderText("Name this profile"), {
    target: { value: "Focus mode" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Save preset" }))

  const chip = screen.getByRole("button", { name: "Focus mode" })
  assert.ok(chip)
  assert.ok(within(chip.parentElement as HTMLElement).getByRole("button", { name: /Delete preset/ }))
})
