#!/usr/bin/env node

import {
  formatDiagnostic,
  loadSettings,
  loadState,
  pruneStaleConversations,
  statusReport,
  writeDiagnostic,
  writeStatus,
} from "./lib.mjs"

try {
  const settings = await loadSettings()
  // Report the same live count the hooks enforce. This command only reads, so
  // the prune is not persisted here; the next session hook writes it.
  const state = pruneStaleConversations(await loadState(), Date.now())
  // EPIPE is a normal early close (for example `status | head`); writeStatus
  // returns false instead of throwing so this command stays silent.
  await writeStatus(process.stdout, `${statusReport(state, settings)}\n`)
} catch (error) {
  writeDiagnostic(formatDiagnostic("status", error))
  process.exitCode = 1
}
