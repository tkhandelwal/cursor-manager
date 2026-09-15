# Cursor Manager

[github.com/tkhandelwal/cursor-manager](https://github.com/tkhandelwal/cursor-manager)

Cursor on steroids: **hidden settings** the UI does not show, **memory cleanup** commands Cursor buried in the palette, a **5-agent cap** reminder, and **rotate-chat** before the renderer melts.

This project is unrelated to the PyPI package also named `cursor-manager`.

## Build a product with the conductor

The [zero-to-hero product conductor](docs/PIPELINE.md) guides a founder or product manager through one human-gated secure lifecycle. Every product uses the same ten-stage core; intake adds only the profiles it needs:

- **AI** for models, LLMs, embeddings, RAG, agents, or generated decisions.
- **Commercial** for anything offered publicly, free or paid.
- **Regulated** for health, finance, government, children, high-impact decisions, or enterprise trust obligations.

Run **`/conductor`** in Agent chat to start or resume a run from git records. Start with the [intake profiles and risk tiers](docs/checklists/profiles.md). Git gate records—not chat approval—advance the lifecycle. Agents draft and verify; humans sign gates, merge releases, and enable production.

The existing Directory listing remains unchanged; do not resubmit it.

## Install

One install, one setup command:

1. Open [Cursor Manager in Cursor Directory](https://cursor.directory/plugins/cursor-manager).
2. Select **Add to Cursor** and install for **User** scope.
3. Run **`/steroids`** in Agent chat.

That installs the hooks, rule, skill, and commands. The web dashboard in this
repository is an optional advanced companion; you do not need to install or run
it to use Cursor Manager.

### Local development install

Only contributors testing an unpublished checkout need this:

```bash
git clone https://github.com/tkhandelwal/cursor-manager.git
cd cursor-manager
chmod +x scripts/install-plugin.sh
./scripts/install-plugin.sh
```

Then run **Developer: Reload Window** and enable `cursor-manager` under
**Customize → Plugins**.

### If you will run `gh` against this repo

Only needed if you are signed in to more than one GitHub account — otherwise skip
it. Once per shell:

```bash
source scripts/gh-env.sh          # bash / Git Bash
```

```powershell
. .\scripts\gh-env.ps1            # PowerShell
```

Without it, `gh pr` and friends can fail with a permissions error, because `gh`
resolves its account from one machine-wide setting that any other shell can
change. See [Working with `gh` on this repo](#working-with-gh-on-this-repo) for
what it does and why. Plain `git` never needs it.

## Slash commands

| Command | What it does |
| --- | --- |
| `/steroids` | Full power-user pass: hidden JSON, ignore file, 5-agent policy |
| `/hidden-settings` | Merge verified keys into User Settings JSON |
| `/memory-cleanup` | Walk **Delete Old Chats**, **GC Agent KV Blobs**, Process Explorer |
| `/rotate-chat` | 5-bullet handoff, then Cmd/Ctrl+N |
| `/session-status` | Report tracked-chat count vs the cap via `scripts/status.mjs` |
| `/conductor` | Start or resume a human-gated product run from git records |

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

## Optional Session Guard dashboard

This advanced local dashboard is not required for the plugin. It never touches
Cursor directly; it previews the cap/rotation policies and generates
configuration for users who want to customize them.

```bash
npm install
npm run dev   # http://localhost:43127
```

| Panel | What it does |
| --- | --- |
| Dashboard nav | Jump to each panel from the sticky in-page section list |
| Chats | Simulate message/time/context load and watch rotation fire |
| Agents | Enforce the concurrent-agent cap; **pause** an agent to free a slot without losing it |
| Policy | Tune thresholds, then **Export for plugin** (`~/.cursor/cursor-manager/settings.json`) |
| Cursor tweaks | Toggle the hidden `settings.json` keys, **Import**/**Export** them, and save named **presets** |
| Cursorignore | Build and export a `.cursorignore` from grouped, toggleable patterns |
| Checklist | Track the UI-only controls and memory-cleanup steps that have no JSON key |
| Appearance | Named shell themes (`dark` default, `light`, `accessible`) |

Scripts: `npm run lint`, `npm test` (logic + plugin + component + axe accessibility tests),
`npm run evidence`, and `npm run build`.

## Working with `gh` on this repo

`gh` picks its account from a machine-wide "active account" setting. If you are
signed in to more than one GitHub account it can drift back to the other one on
its own — sometimes between two consecutive commands — and `gh pr` calls then
fail with a permissions error. Pin it for the current shell:

```bash
source scripts/gh-env.sh          # bash / Git Bash
```

```powershell
. .\scripts\gh-env.ps1            # PowerShell
```

That exports `GH_TOKEN`, which overrides the active account entirely. The token
is read from `gh`'s keyring each time and never written to disk.

It is **shell**-scoped, not repo-scoped: every `gh` command in that shell uses
this account, including in other directories. Open a new shell to work on
another account.

Git itself is unaffected either way — the remote uses SSH (`github-personal`),
which does not consult `gh` at all.

## Repo

| | |
| --- | --- |
| GitHub | [https://github.com/tkhandelwal/cursor-manager](https://github.com/tkhandelwal/cursor-manager) |
| Plugin | [`plugin/`](plugin/) |
| Hidden settings pack | [`plugin/recommended/`](plugin/recommended/) |
