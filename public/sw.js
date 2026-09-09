/*
 * App-shell service worker.
 *  - install: precache the shell (index, hashed JS/CSS discovered from the index,
 *    manifest, icons) so the app opens offline right after the first visit —
 *    Chrome requires this before it offers "Install app".
 *  - fetch: network-first, cache fallback. Always fresh when online.
 */
const CACHE = 'tournament-shell-v2'

async function precache() {
  const cache = await caches.open(CACHE)
  const scope = self.registration.scope // e.g. https://host/tournament/
  const res = await fetch(scope, { cache: 'no-cache' })
  if (!res.ok) throw new Error('shell fetch failed')
  const html = await res.text()
  await cache.put(scope, new Response(html, { headers: res.headers }))
  const urls = new Set(['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'sw.js'].map((p) => new URL(p, scope).href))
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(m[1], scope)
    if (url.origin === self.location.origin) urls.add(url.href)
  }
  await Promise.all(
    [...urls].map((u) =>
      fetch(u, { cache: 'no-cache' })
        .then((r) => (r.ok ? cache.put(u, r) : undefined))
        .catch(() => undefined),
    ),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true })
        if (cached) return cached
        if (request.mode === 'navigate') {
          const shell = await caches.match(self.registration.scope)
          if (shell) return shell
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' })
      }),
  )
})
