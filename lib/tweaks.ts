export type TweakValue = number | boolean | string

export type TweakDef = {
  key: string
  label: string
  description: string
  status: "Official" | "Staff"
} & (
  | { type: "boolean"; recommended: boolean }
  | { type: "enum"; recommended: string; options: [string, string] }
  | { type: "number"; recommended: number; min: number; max: number; step: number }
)

/**
 * Verified Cursor `settings.json` keys that the Settings UI does not surface.
 * Only "official" and "staff-confirmed" keys belong here — never invented ids.
 * Catalog mirrors plugin/recommended/SETTINGS.md.
 */
export const TWEAKS: TweakDef[] = [
  {
    key: "cursor.worktreeMaxCount",
    label: "Worktree max count",
    description: "Machine-wide cap on leftover git worktrees.",
    status: "Official",
    type: "number",
    recommended: 25,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    key: "cursor.worktreeCleanupIntervalHours",
    label: "Worktree cleanup interval",
    description: "How often old worktrees are swept (hours). Keep under ~596 to avoid timer overflow.",
    status: "Official",
    type: "number",
    recommended: 6,
    min: 1,
    max: 168,
    step: 1,
  },
  {
    key: "cursor.worktreesGlobalMaxSizeGb",
    label: "Worktrees max size (GB)",
    description: "Size-based worktree eviction. 0 disables it.",
    status: "Staff",
    type: "number",
    recommended: 0,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "git.showCursorWorktrees",
    label: "Show Cursor worktrees in SCM",
    description: "Surface Cursor worktrees in the Source Control view.",
    status: "Staff",
    type: "boolean",
    recommended: true,
  },
  {
    key: "cursor.composer.usageSummaryDisplay",
    label: "Usage summary display",
    description: "Keep the usage ring visible. Also under Agents → Usage Summary.",
    status: "Staff",
    type: "enum",
    recommended: "always",
    options: ["auto", "always"],
  },
  {
    key: "cursor.composer.textSizeScale",
    label: "Composer text scale",
    description: "Composer text size multiplier. Also under Agents → Text Size.",
    status: "Staff",
    type: "number",
    recommended: 1,
    min: 0.8,
    max: 2,
    step: 0.1,
  },
  {
    key: "cursor.general.disableHttp2",
    label: "Disable HTTP/2",
    description: "Force HTTP/1.1 when the agent flakes on HTTP/2. MDM: NetworkDisableHttp2.",
    status: "Official",
    type: "boolean",
    recommended: false,
  },
]

export type TweakState = {
  values: Record<string, TweakValue>
  enabled: Record<string, boolean>
}

export function defaultTweakState(): TweakState {
  const values: Record<string, TweakValue> = {}
  const enabled: Record<string, boolean> = {}
  for (const tweak of TWEAKS) {
    values[tweak.key] = tweak.recommended
    enabled[tweak.key] = true
  }
  return { values, enabled }
}

function clampNumber(tweak: Extract<TweakDef, { type: "number" }>, value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : tweak.recommended
  const clamped = Math.min(tweak.max, Math.max(tweak.min, parsed))
  return Math.round(clamped / tweak.step) * tweak.step
}

function coerce(tweak: TweakDef, value: unknown): TweakValue {
  switch (tweak.type) {
    case "boolean":
      return typeof value === "boolean" ? value : tweak.recommended
    case "enum":
      return tweak.options.includes(value as string) ? (value as string) : tweak.recommended
    case "number":
      return clampNumber(tweak, value)
  }
}

/** Build the settings.json object, including only enabled keys, with coerced values. */
export function buildSettings(state: TweakState): Record<string, TweakValue> {
  const out: Record<string, TweakValue> = {}
  for (const tweak of TWEAKS) {
    if (state.enabled[tweak.key]) {
      out[tweak.key] = coerce(tweak, state.values[tweak.key])
    }
  }
  return out
}

export function tweakSettingsJson(state: TweakState): string {
  return `${JSON.stringify(buildSettings(state), null, 2)}\n`
}

export function mergeTweakState(value: unknown): TweakState {
  const base = defaultTweakState()
  if (!value || typeof value !== "object") {
    return base
  }
  const incoming = value as Partial<TweakState>
  for (const tweak of TWEAKS) {
    if (incoming.values && tweak.key in incoming.values) {
      base.values[tweak.key] = coerce(tweak, incoming.values[tweak.key])
    }
    if (incoming.enabled && typeof incoming.enabled[tweak.key] === "boolean") {
      base.enabled[tweak.key] = incoming.enabled[tweak.key]
    }
  }
  return base
}
