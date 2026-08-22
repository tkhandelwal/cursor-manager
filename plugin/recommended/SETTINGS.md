# Hidden vs missing Cursor settings

Only keys below that are marked **official** or **staff** should be written to `settings.json`.
Do not invent `cursor.composer.maxAgents` or similar.

Apply JSON: Command Palette → **Preferences: Open User Settings (JSON)** and merge
`plugin/recommended/settings.json`. Or run `/hidden-settings`.

## Hidden but real (not in the main Cursor Settings tabs)

| Key | Status | Default | What it does |
| --- | --- | --- | --- |
| `cursor.worktreeMaxCount` | Official | 25 | Machine-wide cap on leftover git worktrees. |
| `cursor.worktreeCleanupIntervalHours` | Official | 6 (docs example) | How often old worktrees are swept. Do not set above ~596 (timer overflow). |
| `cursor.worktreesGlobalMaxSizeGb` | Staff forum | unset | Size-based worktree eviction. `0` disables it. |
| `git.showCursorWorktrees` | Staff forum | unset | Show Cursor worktrees in SCM. |
| `cursor.composer.usageSummaryDisplay` | Staff (`auto` / `always`) | `auto` | Keep the usage ring visible. Also Agents → Usage Summary. |
| `cursor.composer.textSizeScale` | Staff | `1.0` | Composer text scale. Also Agents → Text Size. |
| `cursor.general.disableHttp2` | Official | unset (HTTP/2) | Force HTTP/1.1 if the agent flakes on HTTP/2. MDM: `NetworkDisableHttp2`. |

## Real, but UI-only (no published JSON id)

Set these in **Cursor Settings** (Cmd/Ctrl+Shift+J), not by guessing a key:

| Control | Where |
| --- | --- |
| Max open chat tabs (default 5) | Agents → Max Tab Count |
| Run mode (Auto-review / Allowlist / Run Everything) | Agents → Approvals & Execution |
| Privacy Mode | General → Privacy Mode |
| Default model / Max Mode | Models / model picker |
| Hierarchical Cursor Ignore | Indexing → Ignore Files |
| Extension Monitor | Application → Experimental → Extension Monitor Enabled |

## Missing in Cursor (plugin has to work around)

| Need | Closest workaround |
| --- | --- |
| Cap concurrent *running* agents | Cursor Manager `sessionStart` warning + rule. No JSON cap. |
| Auto-start a new chat | `/rotate-chat` + Cmd/Ctrl+N. Hooks cannot open a composer. |
| Auto-delete local History | **Developer: Delete Old Chats…** then **Developer: GC Agent KV Blobs**. No retention setting. |
| RAM / renderer limit | New chats, 1–2 workspaces, Process Explorer, quit with Cmd/Ctrl+Q. |
| Per-repo Run Mode | Mode is app-global. Use project `permissions.json` / `sandbox.json` for allowlists. |

## Commands that are hidden (palette, not settings)

- **Developer: Reload Window**
- **Developer: Delete Old Chats…**
- **Developer: GC Agent KV Blobs**
- **Developer: Open Process Explorer**
- **Developer: Open Extension Monitor** (after Experimental toggle)
- **Preferences: Open User Settings (JSON)**

## File-based config (not settings.json)

| File | Purpose |
| --- | --- |
| `~/.cursor/cli-config.json` | CLI model, `maxMode`, `approvalMode`, sandbox |
| `~/.cursor/permissions.json` | Auto-review allow/block lists |
| `~/.cursor/sandbox.json` | Sandbox FS/network |
| `~/.cursor/hooks.json` | User hooks |
| `~/.cursor/mcp.json` | Personal MCP |
| `.cursorignore` | Block Agent/Tab/@ from paths |
| `.cursorindexingignore` | Indexing only |
