---
name: steroids
description: Put Cursor on steroids — hidden settings, run mode, ignore files, memory cleanup, 5-agent cap
---

Turn this machine into a Cursor Manager setup. Do the work; do not only list tips.

1. Run the same verified User Settings JSON merge as `/hidden-settings`.
2. Check for `.cursorignore`. If missing, propose one that excludes `node_modules`, `dist`, `build`, `.next`, coverage, large media, and secrets. Do not block source the user needs.
3. If this is a CLI-heavy user, mention `~/.cursor/cli-config.json` official fields only: `model`, `maxMode`, `approvalMode`, `sandbox.mode`.
4. Remind UI-only controls: Agents → Max Tab Count = 5, Privacy Mode, default model, Extension Monitor.
5. Inject Session Guard policy: max 5 concurrent agents; rotate after ~20 messages / 45 min / full context ring; use `/rotate-chat` then Cmd/Ctrl+N.
6. Offer `/memory-cleanup` if they said Cursor is slow or RAM-heavy.
7. Never claim Cursor can auto-delete IDE History or auto-open a new composer.
