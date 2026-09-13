export const THEME_STORAGE_KEY = "session-guard:theme"

export const SHELL_THEMES = ["dark", "light", "accessible"] as const

export type ShellTheme = (typeof SHELL_THEMES)[number]

export const DEFAULT_THEME: ShellTheme = "dark"

export const THEME_LABELS: Record<ShellTheme, string> = {
  dark: "Dark",
  light: "Light",
  accessible: "Accessible",
}

const ALLOWED = new Set<string>(SHELL_THEMES)

export function parseShellTheme(value: unknown): ShellTheme {
  return typeof value === "string" && ALLOWED.has(value) ? (value as ShellTheme) : DEFAULT_THEME
}

export function colorSchemeFor(theme: ShellTheme): "light" | "dark" {
  return theme === "light" ? "light" : "dark"
}

export function applyShellTheme(theme: ShellTheme, root: HTMLElement = document.documentElement): void {
  const resolved = parseShellTheme(theme)
  root.setAttribute("data-theme", resolved)
  root.style.colorScheme = colorSchemeFor(resolved)
}

export function readStoredTheme(): ShellTheme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME
  }
  try {
    return parseShellTheme(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

export function persistShellTheme(theme: ShellTheme): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, parseShellTheme(theme))
}

/** Inline boot script: apply the stored name before first paint. */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var a={dark:1,light:1,accessible:1};var t=localStorage.getItem(k);if(!a[t])t=${JSON.stringify(DEFAULT_THEME)};var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t==="light"?"light":"dark";}catch(e){var r=document.documentElement;r.setAttribute("data-theme",${JSON.stringify(DEFAULT_THEME)});r.style.colorScheme="dark";}})();`
