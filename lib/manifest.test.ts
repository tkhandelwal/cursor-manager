import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { PWA_ICONS, buildManifest } from "./manifest"

test("the manifest declares what a browser needs to offer an install", () => {
  const manifest = buildManifest()
  assert.ok(manifest.name && manifest.name.length > 0)
  assert.ok(manifest.short_name && manifest.short_name.length > 0)
  assert.ok(manifest.short_name.length <= 12, "short_name is truncated on home screens past ~12 chars")
  assert.equal(manifest.start_url, "/")
  assert.equal(manifest.scope, "/")
  assert.equal(manifest.display, "standalone")
  assert.ok(manifest.description && manifest.description.length > 0)
})

test("the manifest ships both icon sizes browsers require", () => {
  const sizes = (buildManifest().icons ?? []).map((icon) => icon.sizes)
  assert.ok(sizes.includes("192x192"), "192x192 is required for an install prompt")
  assert.ok(sizes.includes("512x512"), "512x512 is required for the splash screen")
})

test("every icon the manifest references actually exists on disk", () => {
  for (const icon of buildManifest().icons ?? []) {
    const file = join(process.cwd(), "public", String(icon.src).replace(/^\//, ""))
    assert.ok(existsSync(file), `manifest points at ${icon.src} but ${file} is missing`)
    assert.equal(icon.type, "image/png")
  }
})

test("colours match the app's dark shell so the install does not flash white", () => {
  const manifest = buildManifest()
  assert.match(String(manifest.background_color), /^#[0-9a-f]{6}$/i)
  assert.match(String(manifest.theme_color), /^#[0-9a-f]{6}$/i)
})

test("PWA_ICONS is the single source of truth for the icon set", () => {
  assert.ok(PWA_ICONS.length >= 2)
  for (const icon of PWA_ICONS) {
    assert.match(icon.src, /^\/icons\//)
    assert.match(icon.sizes, /^\d+x\d+$/)
  }
})
