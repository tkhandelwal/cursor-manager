import { DEFAULT_SETTINGS, type GuardState, type Settings } from "./types"
import { isGuardState, mergeSettings, normalizeState, seedState } from "./guard"
import {
  defaultTweakState,
  mergePresets,
  mergeTweakState,
  type TweakPreset,
  type TweakState,
} from "./tweaks"
import {
  defaultIgnoreState,
  mergeIgnoreState,
  sanitizeCustomPatterns,
  type IgnoreState,
} from "./cursorignore"
import { defaultChecklistState, mergeChecklistState, type ChecklistState } from "./manual-steps"
import { defaultFlagState, mergeFlagState, type FlagState } from "./launch-flags"
import { type HealthReport } from "./health"

const SETTINGS_KEY = "session-guard:settings"
const STATE_KEY = "session-guard:state"
const TWEAKS_KEY = "session-guard:tweaks"
const PRESETS_KEY = "session-guard:tweak-presets"
const IGNORE_KEY = "session-guard:cursorignore"
const IGNORE_CUSTOM_KEY = "session-guard:cursorignore-custom"
const CHECKLIST_KEY = "session-guard:checklist"
const LAUNCH_FLAGS_KEY = "session-guard:launch-flags"
const HEALTH_SNAPSHOT_KEY = "session-guard:health-snapshot"

export function loadSettings(): Settings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    return raw ? mergeSettings(JSON.parse(raw) as unknown) : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings): void {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function loadState(): { state: GuardState; error: string | null } {
  if (typeof window === "undefined") {
    return { state: seedState(), error: null }
  }
  try {
    const raw = window.localStorage.getItem(STATE_KEY)
    if (!raw) {
      return { state: seedState(), error: null }
    }
    const parsed: unknown = JSON.parse(raw)
    if (!isGuardState(parsed)) {
      return { state: seedState(), error: "Saved session data was invalid, so a fresh set of chats was loaded." }
    }
    return { state: normalizeState(parsed), error: null }
  } catch {
    return {
      state: seedState(),
      error: "Could not read saved chats. A fresh session was loaded.",
    }
  }
}

export function saveState(state: GuardState): void {
  window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
}

export function clearState(): void {
  window.localStorage.removeItem(STATE_KEY)
}

export function loadTweaks(): TweakState {
  if (typeof window === "undefined") {
    return defaultTweakState()
  }
  try {
    const raw = window.localStorage.getItem(TWEAKS_KEY)
    return raw ? mergeTweakState(JSON.parse(raw) as unknown) : defaultTweakState()
  } catch {
    return defaultTweakState()
  }
}

export function saveTweaks(tweaks: TweakState): void {
  window.localStorage.setItem(TWEAKS_KEY, JSON.stringify(tweaks))
}

export function loadPresets(): TweakPreset[] {
  if (typeof window === "undefined") {
    return []
  }
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY)
    return raw ? mergePresets(JSON.parse(raw) as unknown) : []
  } catch {
    return []
  }
}

export function savePresets(presets: TweakPreset[]): void {
  window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
}

export function loadIgnore(): IgnoreState {
  if (typeof window === "undefined") {
    return defaultIgnoreState()
  }
  try {
    const raw = window.localStorage.getItem(IGNORE_KEY)
    return raw ? mergeIgnoreState(JSON.parse(raw) as unknown) : defaultIgnoreState()
  } catch {
    return defaultIgnoreState()
  }
}

export function saveIgnore(ignore: IgnoreState): void {
  window.localStorage.setItem(IGNORE_KEY, JSON.stringify(ignore))
}

export function loadIgnoreCustom(): string[] {
  if (typeof window === "undefined") {
    return []
  }
  try {
    const raw = window.localStorage.getItem(IGNORE_CUSTOM_KEY)
    return raw ? sanitizeCustomPatterns(JSON.parse(raw) as unknown) : []
  } catch {
    return []
  }
}

export function saveIgnoreCustom(patterns: string[]): void {
  window.localStorage.setItem(IGNORE_CUSTOM_KEY, JSON.stringify(patterns))
}

export function loadChecklist(): ChecklistState {
  if (typeof window === "undefined") {
    return defaultChecklistState()
  }
  try {
    const raw = window.localStorage.getItem(CHECKLIST_KEY)
    return raw ? mergeChecklistState(JSON.parse(raw) as unknown) : defaultChecklistState()
  } catch {
    return defaultChecklistState()
  }
}

export function saveChecklist(checklist: ChecklistState): void {
  window.localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checklist))
}

export function loadLaunchFlags(): FlagState {
  if (typeof window === "undefined") {
    return defaultFlagState()
  }
  try {
    const raw = window.localStorage.getItem(LAUNCH_FLAGS_KEY)
    return raw ? mergeFlagState(JSON.parse(raw) as unknown) : defaultFlagState()
  } catch {
    return defaultFlagState()
  }
}

export function saveLaunchFlags(flags: FlagState): void {
  window.localStorage.setItem(LAUNCH_FLAGS_KEY, JSON.stringify(flags))
}

export function loadHealthSnapshot(): HealthReport | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(HEALTH_SNAPSHOT_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as HealthReport
    return Array.isArray(parsed?.findings) ? parsed : null
  } catch {
    return null
  }
}

export function saveHealthSnapshot(report: HealthReport): void {
  window.localStorage.setItem(HEALTH_SNAPSHOT_KEY, JSON.stringify(report))
}
