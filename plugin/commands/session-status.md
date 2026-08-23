---
name: session-status
description: Report how many chats Cursor Manager is tracking and whether you are at the agent cap
---

Show the user their current Cursor Manager session status.

1. Run `node ~/.cursor/plugins/local/cursor-manager/scripts/status.mjs` and read its output. Use an absolute path: slash commands run with the workspace as the working directory, not the plugin directory. That path is where `scripts/install-plugin.sh` links the plugin; if it is installed elsewhere, use that directory's `scripts/status.mjs`. This reads the live conversation state the hooks maintain in `~/.cursor/cursor-manager/state.json`.
2. Report the tracked-chat count, the cap, and the rotation thresholds to the user.
3. If at the cap, advise finishing or closing an older agent — or run `/rotate-chat` — before starting more parallel work.
4. Do not invent Cursor setting IDs. Do not claim Cursor auto-deletes IDE chats.
