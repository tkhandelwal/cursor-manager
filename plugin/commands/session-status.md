---
name: session-status
description: Report how many chats Cursor Manager is tracking and whether you are at the agent cap
---

Show the user their current Cursor Manager session status.

1. Run `node ./scripts/status.mjs` from this plugin directory and read its output. This reads the live conversation state the hooks maintain in `~/.cursor/cursor-manager/state.json`.
2. Report the tracked-chat count, the cap, and the rotation thresholds to the user.
3. If at the cap, advise finishing or closing an older agent — or run `/rotate-chat` — before starting more parallel work.
4. Do not invent Cursor setting IDs. Do not claim Cursor auto-deletes IDE chats.
