import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import axe from "axe-core"
import { cleanup, render } from "@testing-library/react"

import { SessionApp } from "@/components/session-app"
import { applyShellTheme, type ShellTheme } from "@/lib/theme"

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  document.documentElement.removeAttribute("data-theme")
})

async function assertNoAxeViolations(theme: ShellTheme): Promise<void> {
  applyShellTheme(theme)
  render(<SessionApp />)

  const result = await axe.run(document.body, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
    },
  })

  assert.deepEqual(
    result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html,
      })),
    })),
    [],
  )
}

test("primary Session Guard shell has no axe WCAG A/AA violations in dark mode", async () => {
  await assertNoAxeViolations("dark")
})

test("primary Session Guard shell has no axe WCAG A/AA violations in light mode", async () => {
  await assertNoAxeViolations("light")
})

test("primary Session Guard shell has no axe WCAG A/AA violations in accessible mode", async () => {
  await assertNoAxeViolations("accessible")
})
