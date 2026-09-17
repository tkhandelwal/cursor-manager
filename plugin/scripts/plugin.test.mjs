import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = dirname(scriptsDir)
const repoRoot = dirname(pluginRoot)

function read(relativePath) {
  return readFileSync(join(pluginRoot, relativePath), "utf8")
}

function runScript(name, input, home) {
  return spawnSync(process.execPath, [join(scriptsDir, name)], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home, APPDATA: join(home, "AppData") },
  })
}

test("plugin.json declares the expected manifest fields", () => {
  const manifest = JSON.parse(read(".cursor-plugin/plugin.json"))
  assert.equal(manifest.name, "cursor-manager")
  assert.equal(manifest.displayName, "Cursor Manager")
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
  assert.equal(typeof manifest.description, "string")
  assert.ok(manifest.description.length > 0)
  assert.equal(manifest.author.name, "Tanuj Khandelwal")
  assert.equal(manifest.repository, "https://github.com/tkhandelwal/cursor-manager")
  assert.equal(manifest.homepage, "https://github.com/tkhandelwal/cursor-manager")
  assert.equal(manifest.license, "MIT")
  assert.ok(manifest.logo)
  assert.ok(existsSync(join(pluginRoot, manifest.logo)), `missing logo: ${manifest.logo}`)
})

test("repository marketplace manifest exposes one installable plugin", () => {
  const marketplace = JSON.parse(
    readFileSync(join(repoRoot, ".cursor-plugin", "marketplace.json"), "utf8"),
  )

  assert.equal(marketplace.name, "cursor-manager")
  assert.equal(marketplace.owner.name, "Tanuj Khandelwal")
  assert.equal(marketplace.plugins.length, 1)
  assert.equal(marketplace.plugins[0].name, "cursor-manager")
  assert.equal(marketplace.plugins[0].source, "plugin")
})

test("repository includes marketplace-facing license and plugin usage docs", () => {
  const license = readFileSync(join(repoRoot, "LICENSE"), "utf8")
  const pluginReadme = read("README.md")

  assert.match(license, /MIT License/)
  assert.match(license, /Copyright \(c\) 2026 Tanuj Khandelwal/)
  assert.match(pluginReadme, /Install from Cursor/i)
  assert.match(pluginReadme, /optional companion/i)
})

test("every hook command points at a script file that exists", () => {
  const hooks = JSON.parse(read("hooks/hooks.json"))
  const commands = Object.values(hooks.hooks)
    .flat()
    .map((entry) => entry.command)

  assert.ok(commands.length > 0)
  for (const command of commands) {
    const match = command.match(/\.\/scripts\/([\w.-]+\.mjs)/)
    assert.ok(match, `hook command should reference a scripts/*.mjs file: ${command}`)
    assert.ok(
      existsSync(join(pluginRoot, "scripts", match[1])),
      `missing hook script: ${match[1]}`,
    )
  }
})

test("every slash-command has name and description frontmatter", () => {
  const commandsDir = join(pluginRoot, "commands")
  const files = readdirSync(commandsDir).filter((file) => file.endsWith(".md"))
  assert.ok(files.length > 0)

  for (const file of files) {
    const body = readFileSync(join(commandsDir, file), "utf8")
    const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    assert.ok(frontmatter, `${file} is missing a frontmatter block`)
    assert.match(frontmatter[1], /\bname:\s*\S+/, `${file} is missing a name`)
    assert.match(frontmatter[1], /\bdescription:\s*\S+/, `${file} is missing a description`)
  }
})

test("the /session-status command is wired to status.mjs", () => {
  const command = read("commands/session-status.md")
  assert.match(command, /name:\s*session-status/)
  assert.match(command, /scripts\/status\.mjs/)
  assert.ok(existsSync(join(scriptsDir, "status.mjs")))
})

test("the /conductor command starts or resumes from git records", () => {
  const command = read("commands/conductor.md")
  assert.match(command, /name:\s*conductor/)
  assert.match(command, /GATE-RECORD/)
  assert.match(command, /intake/i)
  assert.match(command, /do not sign gates/i)
  assert.match(command, /Do not resubmit/)
  assert.match(command, /npm run evidence/)
})

test("session-start surfaces malformed state without overwriting it", () => {
  const home = mkdtempSync(join(tmpdir(), "cursor-manager-hook-"))
  const dataDir = join(home, ".cursor", "cursor-manager")
  const stateFile = join(dataDir, "state.json")
  try {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(stateFile, '{"conversations":')

    const result = runScript("session-start.mjs", { conversation_id: "new-chat" }, home)

    assert.equal(result.status, 0, result.stderr)
    assert.match(JSON.parse(result.stdout).additional_context, /state read failed \(SyntaxError\)/)
    assert.match(result.stderr, /state read failed \(SyntaxError\)/)
    assert.equal(readFileSync(stateFile, "utf8"), '{"conversations":')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("session-start surfaces an invalid state shape without overwriting it", () => {
  const home = mkdtempSync(join(tmpdir(), "cursor-manager-hook-"))
  const dataDir = join(home, ".cursor", "cursor-manager")
  const stateFile = join(dataDir, "state.json")
  try {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(stateFile, '{"conversations":null}')

    const result = runScript("session-start.mjs", { conversation_id: "new-chat" }, home)

    assert.equal(result.status, 0, result.stderr)
    assert.match(JSON.parse(result.stdout).additional_context, /state read failed \(TypeError\)/)
    assert.equal(readFileSync(stateFile, "utf8"), '{"conversations":null}')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("session-end reports a missing conversation identifier without breaking stdout JSON", () => {
  const home = mkdtempSync(join(tmpdir(), "cursor-manager-hook-"))
  try {
    const result = runScript("session-end.mjs", {}, home)

    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {})
    assert.match(result.stderr, /missing conversation identifier/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("session-end preserves malformed state while returning hook JSON", () => {
  const home = mkdtempSync(join(tmpdir(), "cursor-manager-hook-"))
  const dataDir = join(home, ".cursor", "cursor-manager")
  const stateFile = join(dataDir, "state.json")
  try {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(stateFile, '{"conversations":')

    const result = runScript("session-end.mjs", { conversation_id: "old-chat" }, home)

    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {})
    assert.match(result.stderr, /state read failed \(SyntaxError\)/)
    assert.equal(readFileSync(stateFile, "utf8"), '{"conversations":')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test("session-start reports a state save failure while preserving hook JSON", () => {
  const home = mkdtempSync(join(tmpdir(), "cursor-manager-hook-"))
  const dataDir = join(home, ".cursor", "cursor-manager")
  const stateFile = join(dataDir, "state.json")
  try {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(stateFile, '{"conversations":{},"health":{"samples":[]}}\n')
    if (process.platform === "win32") {
      chmodSync(stateFile, 0o444)
    } else {
      chmodSync(dataDir, 0o555)
    }

    const result = runScript("session-start.mjs", { conversation_id: "new-chat" }, home)

    assert.equal(result.status, 0, result.stderr)
    assert.match(JSON.parse(result.stdout).additional_context, /state save failed/)
    assert.match(result.stderr, /state save failed/)
    assert.equal(readFileSync(stateFile, "utf8"), '{"conversations":{},"health":{"samples":[]}}\n')
    assert.deepEqual(readdirSync(dataDir), ["state.json"])
  } finally {
    if (process.platform === "win32") {
      chmodSync(stateFile, 0o666)
    } else {
      chmodSync(dataDir, 0o755)
    }
    rmSync(home, { recursive: true, force: true })
  }
})

test("status reports malformed state without an uncaught stack trace", () => {
  const home = mkdtempSync(join(tmpdir(), "cursor-manager-hook-"))
  const dataDir = join(home, ".cursor", "cursor-manager")
  try {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(join(dataDir, "state.json"), '{"conversations":')

    const result = runScript("status.mjs", {}, home)

    assert.equal(result.status, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /status failed \(SyntaxError\)/)
    assert.doesNotMatch(result.stderr, /\n\s+at /)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
