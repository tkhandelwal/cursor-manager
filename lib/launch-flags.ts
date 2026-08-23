export type LaunchFlag = {
  id: string
  flag: string
  label: string
  description: string
  group: string
}

/**
 * Cursor CLI flags that take no argument. These are launch-time only — none of
 * them has a settings.json key or a UI toggle, which is why they are neither a
 * TWEAK nor a MANUAL_STEP. Text is taken from `cursor --help` (Cursor 3.17.8);
 * do not add a flag without confirming it there first.
 */
export const LAUNCH_FLAGS: LaunchFlag[] = [
  {
    id: "disable-gpu",
    flag: "--disable-gpu",
    label: "Disable GPU acceleration",
    description: "Disable GPU hardware acceleration. Try this for flicker, blank panes, or driver crashes.",
    group: "Performance",
  },
  {
    id: "disable-lcd-text",
    flag: "--disable-lcd-text",
    label: "Disable LCD font rendering",
    description: "Disable LCD font rendering (subpixel antialiasing). Helps with blurry text on some displays.",
    group: "Performance",
  },
  {
    id: "disable-extensions",
    flag: "--disable-extensions",
    label: "Disable all extensions",
    description:
      "Disable all installed extensions. Not persisted, and effective only for the new window this command opens.",
    group: "Troubleshooting",
  },
  {
    id: "verbose",
    flag: "--verbose",
    label: "Verbose output",
    description: "Print verbose output. Implies --wait, so the command does not return until the window closes.",
    group: "Troubleshooting",
  },
  {
    id: "status",
    flag: "--status",
    label: "Print process diagnostics",
    description: "Print process usage and diagnostics instead of opening a window. Use this one on its own.",
    group: "Troubleshooting",
  },
  {
    id: "prof-startup",
    flag: "--prof-startup",
    label: "Profile startup",
    description: "Run the CPU profiler during startup, to find what is making launch slow.",
    group: "Troubleshooting",
  },
  {
    id: "new-window",
    flag: "--new-window",
    label: "Force a new window",
    description: "Open a new window instead of reusing the last active one.",
    group: "Window",
  },
  {
    id: "suppress-popups-on-startup",
    flag: "--suppress-popups-on-startup",
    label: "Suppress startup popups",
    description: "Suppress notification popups on startup.",
    group: "Window",
  },
]

export const LAUNCH_GROUPS: string[] = [...new Set(LAUNCH_FLAGS.map((entry) => entry.group))]

export type FlagState = Record<string, boolean>

export function defaultFlagState(): FlagState {
  const state: FlagState = {}
  for (const entry of LAUNCH_FLAGS) {
    state[entry.id] = false
  }
  return state
}

export function mergeFlagState(value: unknown): FlagState {
  const base = defaultFlagState()
  if (!value || typeof value !== "object") {
    return base
  }
  const incoming = value as Record<string, unknown>
  for (const entry of LAUNCH_FLAGS) {
    if (typeof incoming[entry.id] === "boolean") {
      base[entry.id] = incoming[entry.id] as boolean
    }
  }
  return base
}

export function enabledFlagCount(state: FlagState): number {
  return LAUNCH_FLAGS.filter((entry) => state[entry.id]).length
}

/** The command to paste into a terminal, with enabled flags in catalog order. */
export function buildLaunchCommand(state: FlagState): string {
  const flags = LAUNCH_FLAGS.filter((entry) => state[entry.id]).map((entry) => entry.flag)
  return ["cursor", ...flags].join(" ")
}
