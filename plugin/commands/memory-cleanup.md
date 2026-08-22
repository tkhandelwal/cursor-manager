---
name: memory-cleanup
description: Walk through hidden Cursor commands that actually free local chat and renderer memory
---

Cursor has no auto-delete or RAM cap. Walk the user through this exact sequence. Do not run destructive file deletes on `state.vscdb`.

1. Finish or pause any running local agents.
2. Tell them to run Command Palette:
   - **Developer: Delete Old Chats…** (pick a day cutoff)
   - **Developer: GC Agent KV Blobs**
   - **Developer: Open Process Explorer** if RAM is still high — kill the bloated renderer / Cursor Agents process, or
   - **Developer: Reload Window**
3. If the UI is frozen: fully quit Cursor (Cmd/Ctrl+Q), then reopen.
4. Start a new chat with Cmd/Ctrl+N. Do not keep working in the old thread.
5. Cap parallel agents at 5. Keep 1–2 workspaces open.
6. Optional UI: Application → Experimental → Extension Monitor Enabled, then **Developer: Open Extension Monitor**.
