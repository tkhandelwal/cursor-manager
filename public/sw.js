// Service worker for the locally-installed app shell.
//
// Three rules, each learned from verification rather than assumed:
//
// 1. /api/ is NEVER cached. A stale health reading would tell the user their
//    disk-usage problem was solved when it was not — the same class of lie the
//    delta calculation was fixed to avoid.
//
// 2. A failed navigation serves an explicit offline page, NOT the cached app
//    shell. Serving the cached shell was tried first and is actively worse:
//    the page renders and looks live, but React never hydrates without the dev
//    server, so every control silently does nothing. A UI that looks healthy
//    while being dead is the exact failure this project guards against.
//
// 3. That offline page is built inline, not precached from a file. Fetching it
//    at install time failed silently in testing and left no fallback at all —
//    a fallback that depends on a network fetch succeeding is not a fallback.
const CACHE = "cursor-manager-shell-v3"

const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0a0a0a">
<title>Cursor Manager — server not running</title>
<style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#fafafa;padding:2rem;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:34rem}h1{font-size:1.5rem;margin:0 0 .75rem}
p{color:#a1a1a1;line-height:1.6;margin:0 0 1rem}
code{font-family:ui-monospace,Consolas,monospace;font-size:.875rem;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:.5rem;padding:.65rem .85rem;display:block;color:#fafafa}
button{margin-top:1.25rem;font:inherit;font-size:.875rem;cursor:pointer;background:#fafafa;color:#0a0a0a;border:0;border-radius:.6rem;padding:.55rem 1rem}
</style></head><body><main>
<h1>The local server isn't running</h1>
<p>Cursor Manager reads the Cursor data directories on <em>this</em> machine, so it needs its own server running locally. Start it, then reload:</p>
<code>npm run dev</code>
<p>It listens on <strong>http://localhost:43127</strong>.</p>
<button onclick="location.reload()">Reload</button>
</main></body></html>`

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })
}

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") {
    return
  }

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) {
    return
  }
  if (url.pathname.startsWith("/api/")) {
    return // live measurements must never be served from cache
  }

  // Navigations: network, else the inline offline page. Never a stale shell.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => offlineResponse()))
    return
  }

  // Assets: network-first, falling back to cache so repeat loads stay quick
  // while the server is up.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches
            .open(CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => {})
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
  )
})
