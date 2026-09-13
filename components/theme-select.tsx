"use client"

import { useEffect, useState } from "react"

import { Label } from "@/components/ui/label"
import {
  DEFAULT_THEME,
  SHELL_THEMES,
  THEME_LABELS,
  applyShellTheme,
  parseShellTheme,
  persistShellTheme,
  readStoredTheme,
  type ShellTheme,
} from "@/lib/theme"

export function ThemeSelect() {
  const [theme, setTheme] = useState<ShellTheme>(DEFAULT_THEME)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore stored theme after mount */
    const stored = readStoredTheme()
    setTheme(stored)
    applyShellTheme(stored)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="shell-theme">Appearance</Label>
      <select
        id="shell-theme"
        value={theme}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        onChange={(event) => {
          const next = parseShellTheme(event.target.value)
          setTheme(next)
          persistShellTheme(next)
          applyShellTheme(next)
        }}
      >
        {SHELL_THEMES.map((name) => (
          <option key={name} value={name}>
            {THEME_LABELS[name]}
          </option>
        ))}
      </select>
    </div>
  )
}
