"use client"

import { useEffect } from "react"

/**
 * Registers the app-shell service worker. Renders nothing.
 *
 * Registration is deferred to `load` so it never competes with the first
 * paint, and every failure is swallowed: a browser without service-worker
 * support, or a refused registration, must not break the app — the PWA layer
 * is additive.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration refused (private mode, unsupported, insecure origin) */
      })
    }

    if (document.readyState === "complete") {
      register()
      return
    }
    window.addEventListener("load", register)
    return () => window.removeEventListener("load", register)
  }, [])

  return null
}
