---
name: hidden-settings
description: Apply Cursor Manager hidden settings.json keys that the Settings UI does not show
---

You are configuring Cursor Manager power-user settings.

1. Read `plugin/recommended/settings.json` and `plugin/recommended/SETTINGS.md` in this repo if present.
2. Use the built-in `/update-cursor-settings` skill to merge ONLY these verified keys into User Settings JSON:
   - `cursor.worktreeMaxCount` = 25
   - `cursor.worktreeCleanupIntervalHours` = 6
   - `cursor.worktreesGlobalMaxSizeGb` = 0
   - `git.showCursorWorktrees` = true
   - `cursor.composer.usageSummaryDisplay` = "always"
   - `cursor.composer.textSizeScale` = 1
   - `cursor.general.disableHttp2` = false
3. Do not invent keys. Do not write `cursor.composer.maxAgents`, YOLO flags, or Privacy Mode into settings.json.
4. Then tell the user to set these in the Cursor Settings UI (no published JSON id):
   - Agents → Max Tab Count → 5
   - Agents → Approvals & Execution (Run Mode)
   - Application → Experimental → Extension Monitor Enabled
5. Remind them: Command Palette → Developer: Reload Window after JSON edits.
