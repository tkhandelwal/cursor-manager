import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DEFAULT_THEME,
  SHELL_THEMES,
  THEME_BOOT_SCRIPT,
  THEME_STORAGE_KEY,
  applyShellTheme,
  colorSchemeFor,
  parseShellTheme,
  persistShellTheme,
  readStoredTheme,
} from "./theme"

test("unknown theme names fall back to the default dark shell", () => {
  assert.equal(parseShellTheme("light"), "light")
  assert.equal(parseShellTheme("accessible"), "accessible")
  assert.equal(parseShellTheme("dark"), "dark")
  assert.equal(parseShellTheme("high-contrast"), DEFAULT_THEME)
  assert.equal(parseShellTheme(null), DEFAULT_THEME)
  assert.deepEqual([...SHELL_THEMES], ["dark", "light", "accessible"])
})

test("light is the only theme that sets a light color-scheme", () => {
  assert.equal(colorSchemeFor("light"), "light")
  assert.equal(colorSchemeFor("dark"), "dark")
  assert.equal(colorSchemeFor("accessible"), "dark")
})

test("applyShellTheme writes data-theme without depending on a .dark class", () => {
  const root = document.createElement("html")
  applyShellTheme("light", root)
  assert.equal(root.getAttribute("data-theme"), "light")
  assert.equal(root.style.colorScheme, "light")

  applyShellTheme("accessible", root)
  assert.equal(root.getAttribute("data-theme"), "accessible")
  assert.equal(root.style.colorScheme, "dark")
})

test("stored theme round-trips and junk is ignored", () => {
  window.localStorage.clear()
  assert.equal(readStoredTheme(), DEFAULT_THEME)
  persistShellTheme("light")
  assert.equal(window.localStorage.getItem(THEME_STORAGE_KEY), "light")
  assert.equal(readStoredTheme(), "light")
  window.localStorage.setItem(THEME_STORAGE_KEY, "nope")
  assert.equal(readStoredTheme(), DEFAULT_THEME)
})

test("the boot script names the storage key and default theme", () => {
  assert.match(THEME_BOOT_SCRIPT, new RegExp(THEME_STORAGE_KEY))
  assert.match(THEME_BOOT_SCRIPT, /data-theme/)
  assert.match(THEME_BOOT_SCRIPT, /accessible/)
})
