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

export type SettingsChange = {
  key: string
  kind: "added" | "removed" | "changed"
  from?: TweakValue
  to?: TweakValue
}

/** Compare the effective (enabled) settings of two states, newest applied over current. */
export function diffSettings(current: TweakState, next: TweakState): SettingsChange[] {
  const before = buildSettings(current)
  const after = buildSettings(next)
  const changes: SettingsChange[] = []
  for (const tweak of TWEAKS) {
    const inBefore = tweak.key in before
    const inAfter = tweak.key in after
    if (inBefore && inAfter) {
      if (before[tweak.key] !== after[tweak.key]) {
        changes.push({ key: tweak.key, kind: "changed", from: before[tweak.key], to: after[tweak.key] })
      }
    } else if (inAfter) {
      changes.push({ key: tweak.key, kind: "added", to: after[tweak.key] })
    } else if (inBefore) {
      changes.push({ key: tweak.key, kind: "removed", from: before[tweak.key] })
    }
  }
  return changes
}

export type TweakPreset = {
  name: string
  state: TweakState
}

/** Insert or replace a preset by (trimmed) name; ignores blank names. */
export function savePreset(presets: TweakPreset[], name: string, state: TweakState): TweakPreset[] {
  const trimmed = name.trim()
  if (!trimmed) {
    return presets
  }
  const rest = presets.filter((preset) => preset.name !== trimmed)
  return [...rest, { name: trimmed, state }].sort((a, b) => a.name.localeCompare(b.name))
}

export function deletePreset(presets: TweakPreset[], name: string): TweakPreset[] {
  return presets.filter((preset) => preset.name !== name)
}

export function mergePresets(value: unknown): TweakPreset[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: TweakPreset[] = []
  for (const item of value) {
    if (item && typeof item === "object" && typeof (item as TweakPreset).name === "string") {
      const name = (item as TweakPreset).name.trim()
      if (name && !out.some((preset) => preset.name === name)) {
        out.push({ name, state: mergeTweakState((item as TweakPreset).state) })
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export type ImportResult =
  | { ok: true; state: TweakState; unmanagedKeys: string[] }
  | { ok: false; error: string }

/**
 * Parse a pasted User Settings JSON into a TweakState: managed keys that are
 * present are included with coerced values, keys that are absent are excluded,
 * and any keys we do not manage are reported so nothing is silently dropped.
 */
export function importSettings(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: "That is not valid JSON." }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Expected a JSON object of settings." }
  }

  const incoming = parsed as Record<string, unknown>
  const managed = new Set(TWEAKS.map((tweak) => tweak.key))
  const values: Record<string, TweakValue> = {}
  const enabled: Record<string, boolean> = {}

  for (const tweak of TWEAKS) {
    const present = tweak.key in incoming
    values[tweak.key] = present ? coerce(tweak, incoming[tweak.key]) : tweak.recommended
    enabled[tweak.key] = present
  }

  const unmanagedKeys = Object.keys(incoming).filter((key) => !managed.has(key))
  return { ok: true, state: { values, enabled }, unmanagedKeys }
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
