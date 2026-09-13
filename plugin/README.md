# Cursor Manager

Install from Cursor, then run `/steroids`. That is the complete setup.

## Install from Cursor

1. Open the Cursor Manager listing in Cursor Directory.
2. Select **Add to Cursor** and install for **User** scope.
3. Run `/steroids` in Agent chat.

The plugin supplies the session hooks, five-agent guard, verified hidden-setting
workflow, memory-cleanup checklist, and chat-rotation command.

## Optional companion

The repository also contains a local Session Guard dashboard for users who want
to tune thresholds or preview generated configuration. It is an optional
companion, not a second install and not required for the plugin.

## Commands

- `/steroids` — complete initial setup
- `/memory-cleanup` — reclaim local chat and renderer memory
- `/session-status` — show tracked chats and remaining agent capacity
- `/rotate-chat` — generate a handoff before starting a fresh chat
- `/hidden-settings` — apply only verified Cursor settings
- `/conductor` — start or resume a human-gated product run from git records

Source and support: https://github.com/tkhandelwal/cursor-manager
