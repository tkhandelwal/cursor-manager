import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = dirname(scriptsDir)

function read(relativePath) {
  return readFileSync(join(pluginRoot, relativePath), "utf8")
}

test("plugin.json declares the expected manifest fields", () => {
  const manifest = JSON.parse(read(".cursor-plugin/plugin.json"))
  assert.equal(manifest.name, "cursor-manager")
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
  assert.equal(typeof manifest.description, "string")
  assert.ok(manifest.description.length > 0)
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
    const frontmatter = body.match(/^---\n([\s\S]*?)\n---/)
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
