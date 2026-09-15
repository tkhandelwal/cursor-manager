import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { IGNORE_ENTRIES } from "@/lib/cursorignore"
import { CursorignoreGenerator } from "@/components/cursorignore-generator"
import { ManualChecklist } from "@/components/manual-checklist"
import { CursorTweaks } from "@/components/cursor-tweaks"
import { LaunchFlags } from "@/components/launch-flags"
import { DashboardNav } from "@/components/dashboard-nav"
import { SessionApp } from "@/components/session-app"
import { ThemeSelect } from "@/components/theme-select"
import { DASHBOARD_SECTIONS } from "@/lib/dashboard"
import { THEME_STORAGE_KEY } from "@/lib/theme"

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

test("a rejected custom pattern explains itself instead of clearing silently", () => {
  render(<CursorignoreGenerator />)
  const field = screen.getByPlaceholderText(/Add a pattern/) as HTMLInputElement
  const covered = IGNORE_ENTRIES[0].pattern

  fireEvent.change(field, { target: { value: covered } })
  fireEvent.click(screen.getByRole("button", { name: "Add pattern" }))

  assert.ok(screen.getByText(/already has a toggle above/))
  assert.equal(field.value, covered)
  assert.ok(screen.getByText("No custom patterns."))
})

test("clearing a numeric tweak field does not snap the value to zero", () => {
  render(<CursorTweaks />)
  const field = screen.getAllByRole("spinbutton")[0] as HTMLInputElement
  const before = field.value
  assert.notEqual(before, "0")

  fireEvent.change(field, { target: { value: "" } })
  assert.equal(field.value, before)

  fireEvent.change(field, { target: { value: "12" } })
  assert.equal(field.value, "12")
})

test("toggling a launch flag updates the command preview", () => {
  render(<LaunchFlags />)
  assert.ok(screen.getByText("cursor"))

  fireEvent.click(screen.getByRole("switch", { name: "Disable GPU acceleration" }))

  assert.ok(screen.getByText("cursor --disable-gpu"))
})

test("enabling two launch flags emits them in catalog order", () => {
  render(<LaunchFlags />)

  fireEvent.click(screen.getByRole("switch", { name: "Disable all extensions" }))
  fireEvent.click(screen.getByRole("switch", { name: "Disable GPU acceleration" }))

  assert.ok(screen.getByText("cursor --disable-gpu --disable-extensions"))
})

test("turning a launch flag back off removes it from the command", () => {
  render(<LaunchFlags />)
  const toggle = screen.getByRole("switch", { name: "Disable GPU acceleration" })

  fireEvent.click(toggle)
  assert.ok(screen.getByText("cursor --disable-gpu"))

  fireEvent.click(toggle)
  assert.ok(screen.getByText("cursor"))
})

test("dashboard section nav exposes a link for every region", () => {
  render(<DashboardNav />)
  const nav = screen.getByRole("navigation", { name: "Dashboard sections" })
  for (const section of DASHBOARD_SECTIONS) {
    const link = within(nav).getByRole("link", { name: section.label })
    assert.equal(link.getAttribute("href"), `#${section.id}`)
  }
})

test("SessionApp current chat is marked for assistive tech", () => {
  render(<SessionApp />)
  const currentChat = screen.getByRole("button", { name: /Auth timeout/, current: true })
  assert.equal(currentChat.getAttribute("aria-current"), "true")
})

test("every dashboard jump target can receive focus", () => {
  render(<SessionApp />)
  for (const section of DASHBOARD_SECTIONS) {
    const target = document.getElementById(section.id)
    assert.ok(target, `${section.id} must exist`)
    assert.equal(target.getAttribute("tabindex"), "-1")
    assert.equal(target.getAttribute("aria-labelledby"), `${section.id}-title`)
  }
})

test("choosing Accessible appearance writes data-theme and persists it", async () => {
  document.documentElement.removeAttribute("data-theme")
  render(<ThemeSelect />)

  fireEvent.change(screen.getByLabelText("Appearance"), { target: { value: "accessible" } })

  await waitFor(() => {
    assert.equal(document.documentElement.getAttribute("data-theme"), "accessible")
  })
  assert.equal(window.localStorage.getItem(THEME_STORAGE_KEY), "accessible")
})
