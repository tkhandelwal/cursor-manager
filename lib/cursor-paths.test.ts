import assert from "node:assert/strict"
import { test } from "node:test"

import { cursorPaths } from "./cursor-paths"

test("windows uses APPDATA when provided", () => {
  const paths = cursorPaths("win32", "C:\\Users\\me", "C:\\Users\\me\\AppData\\Roaming")
  assert.equal(paths.chatDb, "C:\\Users\\me\\AppData\\Roaming\\Cursor\\User\\globalStorage\\state.vscdb")
  assert.equal(paths.workspaceStorage, "C:\\Users\\me\\AppData\\Roaming\\Cursor\\User\\workspaceStorage")
  assert.equal(paths.cachedData, "C:\\Users\\me\\AppData\\Roaming\\Cursor\\CachedData")
  assert.equal(paths.cache, "C:\\Users\\me\\AppData\\Roaming\\Cursor\\Cache")
  assert.equal(paths.blobStorage, "C:\\Users\\me\\AppData\\Roaming\\Cursor\\blob_storage")
})

test("windows falls back to the conventional AppData location", () => {
  const paths = cursorPaths("win32", "C:\\Users\\me")
  assert.equal(paths.cache, "C:\\Users\\me\\AppData\\Roaming\\Cursor\\Cache")
})

test("macos uses Application Support", () => {
  const paths = cursorPaths("darwin", "/Users/me")
  assert.equal(paths.chatDb, "/Users/me/Library/Application Support/Cursor/User/globalStorage/state.vscdb")
  assert.equal(paths.cache, "/Users/me/Library/Application Support/Cursor/Cache")
})

test("linux uses .config", () => {
  const paths = cursorPaths("linux", "/home/me")
  assert.equal(paths.chatDb, "/home/me/.config/Cursor/User/globalStorage/state.vscdb")
  assert.equal(paths.cache, "/home/me/.config/Cursor/Cache")
})

test("an unknown platform is treated as linux rather than throwing", () => {
  const paths = cursorPaths("freebsd", "/home/me")
  assert.equal(paths.cache, "/home/me/.config/Cursor/Cache")
})

test("every path sits under the same root", () => {
  const paths = cursorPaths("linux", "/home/me")
  for (const value of Object.values(paths)) {
    assert.ok(value.startsWith("/home/me/.config/Cursor/"), `${value} escaped the root`)
  }
})
