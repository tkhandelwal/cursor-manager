export type ManualStep = {
  id: string
  label: string
  where: string
  group: string
}

/**
 * Real Cursor controls that have NO settings.json key — they can only be set in
 * the UI or run from the command palette. Mirrors the "UI-only" and
 * "memory cleanup" sections of plugin/recommended/SETTINGS.md.
 */
export const MANUAL_STEPS: ManualStep[] = [
  { id: "max-tab-count", label: "Set Max Tab Count to 5", where: "Agents → Max Tab Count", group: "UI-only controls" },
  { id: "run-mode", label: "Pick a Run Mode", where: "Agents → Approvals & Execution", group: "UI-only controls" },
  { id: "privacy-mode", label: "Review Privacy Mode", where: "General → Privacy Mode", group: "UI-only controls" },
  { id: "ignore-files", label: "Enable hierarchical ignore files", where: "Indexing → Ignore Files", group: "UI-only controls" },
  { id: "extension-monitor", label: "Turn on Extension Monitor", where: "Application → Experimental → Extension Monitor Enabled", group: "UI-only controls" },
  { id: "delete-old-chats", label: "Delete Old Chats", where: "Palette → Developer: Delete Old Chats…", group: "Memory cleanup" },
  { id: "gc-kv-blobs", label: "GC Agent KV Blobs", where: "Palette → Developer: GC Agent KV Blobs", group: "Memory cleanup" },
  { id: "process-explorer", label: "Check the renderer in Process Explorer", where: "Palette → Developer: Open Process Explorer", group: "Memory cleanup" },
  { id: "reload-window", label: "Reload the window", where: "Palette → Developer: Reload Window", group: "Memory cleanup" },
]

export const MANUAL_GROUPS: string[] = [...new Set(MANUAL_STEPS.map((step) => step.group))]

export type ChecklistState = Record<string, boolean>

export function defaultChecklistState(): ChecklistState {
  const state: ChecklistState = {}
  for (const step of MANUAL_STEPS) {
    state[step.id] = false
  }
  return state
}

export function mergeChecklistState(value: unknown): ChecklistState {
  const base = defaultChecklistState()
  if (!value || typeof value !== "object") {
    return base
  }
  const incoming = value as Record<string, unknown>
  for (const step of MANUAL_STEPS) {
    if (typeof incoming[step.id] === "boolean") {
      base[step.id] = incoming[step.id] as boolean
    }
  }
  return base
}

export function completedCount(state: ChecklistState): number {
  return MANUAL_STEPS.filter((step) => state[step.id]).length
}
