# Cursor Manager

Install from Cursor, then run `/steroids`. That is the complete setup.

## Install from Cursor

Requirements: a current Cursor release and `node` on `PATH` for the lifecycle
hook scripts.

1. Open [Cursor Manager in Cursor Directory](https://cursor.directory/plugins/cursor-manager).
2. Select **Add to Cursor** and install for **User** scope.
3. Run `/steroids` in Agent chat.
4. Run `/session-status` to verify the installation.

The plugin supplies the session hooks, five-agent guard, verified hidden-setting
workflow, memory-cleanup checklist, and chat-rotation command.

For an unpublished checkout, use `scripts/install-plugin.sh` on macOS, Linux, or
Git Bash, or `scripts/install-plugin.ps1` from Windows PowerShell. Then reload
the Cursor window and enable `cursor-manager` under **Customize → Plugins**.
Full commands and troubleshooting are in the
[repository installation guide](https://github.com/tkhandelwal/cursor-manager#install).

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
