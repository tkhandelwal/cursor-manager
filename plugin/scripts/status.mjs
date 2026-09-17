#!/usr/bin/env node

import { loadSettings, loadState, pruneStaleConversations, statusReport } from "./lib.mjs"

const settings = await loadSettings()
// Report the same live count the hooks enforce. This command only reads, so
// the prune is not persisted here; the next session hook writes it.
const state = pruneStaleConversations(await loadState(), Date.now())

process.stdout.write(`${statusReport(state, settings)}\n`)
