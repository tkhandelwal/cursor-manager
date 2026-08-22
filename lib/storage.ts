import { DEFAULT_SETTINGS, type GuardState, type Settings } from "./types"
import { isGuardState, mergeSettings, normalizeState, seedState } from "./guard"

const SETTINGS_KEY = "session-guard:settings"
const STATE_KEY = "session-guard:state"

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
