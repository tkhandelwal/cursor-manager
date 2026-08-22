# Cursor Manager

[github.com/tkhandelwal/cursor-manager](https://github.com/tkhandelwal/cursor-manager)

Cursor on steroids: **hidden settings** the UI does not show, **memory cleanup** commands Cursor buried in the palette, a **5-agent cap** reminder, and **rotate-chat** before the renderer melts.

This project is unrelated to the PyPI package also named `cursor-manager`.

## Install

```bash
git clone https://github.com/tkhandelwal/cursor-manager.git
cd cursor-manager
chmod +x scripts/install-plugin.sh
./scripts/install-plugin.sh
```

Reload Window → **Customize → Plugins** → enable **cursor-manager** (user scope).

Then run **`/steroids`** in Agent chat to merge hidden `settings.json` keys and print the UI-only checklist.

## Slash commands

| Command | What it does |
| --- | --- |
| `/steroids` | Full power-user pass: hidden JSON, ignore file, 5-agent policy |
| `/hidden-settings` | Merge verified keys into User Settings JSON |
| `/memory-cleanup` | Walk **Delete Old Chats**, **GC Agent KV Blobs**, Process Explorer |
| `/rotate-chat` | 5-bullet handoff, then Cmd/Ctrl+N |

## Settings in Cursor but not in the UI

These exist. Most people never see them. Merge from [`plugin/recommended/settings.json`](plugin/recommended/settings.json) or run `/hidden-settings`.

| Key | Why it is hidden | Cursor Manager default |
| --- | --- | --- |
| `cursor.worktreeMaxCount` | Official, JSON-only | `25` |
| `cursor.worktreeCleanupIntervalHours` | Official, JSON-only | `6` |
| `cursor.worktreesGlobalMaxSizeGb` | Staff forum; `0` disables size eviction | `0` |
| `git.showCursorWorktrees` | Staff forum | `true` |
| `cursor.composer.usageSummaryDisplay` | Agents UI exists; JSON is `auto` / `always` | `"always"` |
| `cursor.composer.textSizeScale` | Agents → Text Size | `1` |
| `cursor.general.disableHttp2` | Official; MDM `NetworkDisableHttp2` | `false` |

Full table and file-based config: [`plugin/recommended/SETTINGS.md`](plugin/recommended/SETTINGS.md).

**Palette commands that are also hidden:** Developer: Delete Old Chats…, GC Agent KV Blobs, Open Process Explorer, Open Extension Monitor, Open User Settings (JSON).

## Settings missing in Cursor (need workarounds)

| You want | Cursor does not have | What Cursor Manager does |
| --- | --- | --- |
| Cap running agents at 5 | No JSON / UI cap | `sessionStart` warning + always-on rule |
| Auto-start a new chat | Compaction stays in the same thread | `/rotate-chat` + Cmd/Ctrl+N banner on `preCompact` |
| Auto-delete old chats | Staff: no retention setting | `/memory-cleanup` → Delete Old Chats + GC blobs |
| RAM / renderer limit | No RSS cap | Process Explorer + reload / quit |
| Max open chat tabs in JSON | UI only: Agents → Max Tab Count | `/steroids` tells you to set it to 5 |
| Run Mode in JSON | UI only (YOLO was renamed) | Point at Agents → Approvals & Execution |
| Privacy / default model in JSON | UI + `state.vscdb` | Do not invent keys |

## What the plugin applies by itself

| Piece | Applies |
| --- | --- |
| Hooks | Track chats, warn at 5, compact banner |
| Rule | Do not spawn a 6th agent; ask to rotate heavy threads |
| `/cursor-manager` skill | Same playbook on demand |
| Recommended JSON | Only when you run `/hidden-settings` or `/steroids` |

Plugins cannot write `settings.json` for you without the agent. They cannot open or delete IDE chats.

## Repo

| | |
| --- | --- |
| GitHub | [https://github.com/tkhandelwal/cursor-manager](https://github.com/tkhandelwal/cursor-manager) |
| Plugin | [`plugin/`](plugin/) |
| Hidden settings pack | [`plugin/recommended/`](plugin/recommended/) |
