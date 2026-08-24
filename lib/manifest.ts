import type { MetadataRoute } from "next"

/**
 * The app's dark shell colour (`--background` in the `.dark` theme,
 * oklch(0.145 0 0)). Used for both the manifest colours and the browser
 * theme-colour so an installed window does not flash white on launch.
 */
export const THEME_COLOR = "#0a0a0a"

/** Single source of truth for the icon set; the files live in `public/icons`. */
export const PWA_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
] as const

/**
 * Installed as a LOCAL app shell, not a deployed web app.
 *
 * `start_url` points at this app's own origin, which is the dev server on
 * :43127. That is deliberate: the health panel reads the machine the server
 * runs on, so an install that pointed anywhere else would measure the wrong
 * computer. `localhost` counts as a secure context, so no HTTPS is needed
 * for the browser to offer the install.
 */
export function buildManifest(): MetadataRoute.Manifest {
  return {
    name: "Cursor Manager — Session Guard",
    short_name: "Cursor Mgr",
    description:
      "Measure and tune a local Cursor install: hidden settings, ignore files, launch flags, and install health.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    icons: PWA_ICONS.map((icon) => ({ ...icon })),
  }
}
