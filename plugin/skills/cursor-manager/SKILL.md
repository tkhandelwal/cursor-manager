---
name: cursor-manager
description: Cursor on steroids — hidden settings, memory cleanup, 5-agent cap, and when to start a new chat.
---

# Cursor Manager

Use when the user asks about Cursor memory, hidden settings, missing settings, too many agents, or a heavy chat.

## Hidden settings (real JSON)

Merge only `plugin/recommended/settings.json`. Catalog: `plugin/recommended/SETTINGS.md`.

Prefer `/hidden-settings` or `/steroids`.

## Missing in Cursor

No JSON exists for: concurrent running-agent cap, auto-new-chat, auto-delete History, RAM limits.
Workarounds: this plugin's hooks/rule, `/rotate-chat`, `/memory-cleanup`.

## Always

- Max 5 concurrent agents.
- Rotate after ~20 messages, 45 minutes, or a full context ring. Cmd/Ctrl+N.
- Never invent setting IDs. Never claim Cursor auto-deletes IDE chats.
