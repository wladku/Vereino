// Vereino's service worker (D-045, E31-S01 #873): the installed app shows an offline page instead of the browser's
// error. It keeps exactly one response, the offline page (`/offline`), which names no person and no club. Every
// navigation goes to the network first and is never stored; API calls, assets and every other request are not handled
// here at all, so the browser loads them as without a service worker. No push: there is no `push` handler (N02).
// Navigation preload (#906): where the browser supports it, a navigation's network request starts while the worker
// boots, and the worker answers with that preloaded response. It is used once and never stored, like any navigation.
const OFFLINE_CACHE_PREFIX = 'vereino-offline-'
const OFFLINE_CACHE = `${OFFLINE_CACHE_PREFIX}v1`
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload', credentials: 'omit' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(OFFLINE_CACHE_PREFIX) && key !== OFFLINE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => (self.registration.navigationPreload ? self.registration.navigationPreload.enable() : undefined))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.mode !== 'navigate' || request.method !== 'GET') return
  event.respondWith(
    Promise.resolve(event.preloadResponse)
      .then((preloaded) => preloaded ?? fetch(request))
      .catch(() =>
        caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE }).then((offline) => offline ?? Response.error()),
      ),
  )
})
