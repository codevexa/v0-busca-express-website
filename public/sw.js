/*
 * OSSALA | service worker
 * - Arquivos estáticos versionados (/_next/static) e ícones: cache-first.
 * - Navegação no /app: sempre rede; sem conexão, exibe /app/offline.
 * - API, Supabase, mapas e qualquer dado do usuário NUNCA são armazenados em cache
 *   (nada financeiro ou credencial fica no dispositivo).
 */
const VERSION = "ossala-v1"
const STATIC_CACHE = `${VERSION}-static`
const OFFLINE_URL = "/app/offline"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/pwa-icon/192", "/pwa-icon/512"])),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting()
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
    return
  }

  if (request.mode === "navigate" && url.pathname.startsWith("/app")) {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
  }
})
