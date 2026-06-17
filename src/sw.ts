/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Typed as ServiceWorkerGlobalScope instead of Window — excluded from tsconfig.app.json
// to avoid the DOM/WebWorker lib conflict. Compiled by Vite/esbuild, not tsc.
declare const self: ServiceWorkerGlobalScope

// ── Lifecycle ─────────────────────────────────────────────────────────────

// In generateSW mode Workbox injected this automatically; in injectManifest we do it manually.
// useRegisterSW(registerType:'prompt') sends {type:'SKIP_WAITING'} when the user clicks "Recharger",
// then listens for the controllerchange event to reload the page.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

// ── Precache ─────────────────────────────────────────────────────────────

precacheAndRoute(self.__WB_MANIFEST)

// ── Runtime caching (feature Vélo'v : tuiles carto + GBFS + marqueurs) ──────

// Disponibilité GBFS Grand Lyon — fraîcheur prioritaire, court TTL
registerRoute(
  ({ url }) => url.href.startsWith('https://download.data.grandlyon.com/files/rdata/'),
  new NetworkFirst({
    cacheName: 'velov-gbfs',
    plugins: [
      new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 120 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

// Tuiles OpenStreetMap / CARTO — cache long
registerRoute(
  ({ url }) => /\.tile\.openstreetmap\.org$/.test(url.hostname) || /\.basemaps\.cartocdn\.com$/.test(url.hostname),
  new CacheFirst({
    cacheName: 'velov-map-tiles',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

// Marqueurs Leaflet (jsdelivr) — cache long
registerRoute(
  ({ url }) => url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com',
  new CacheFirst({
    cacheName: 'velov-markers',
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

// ── Types ─────────────────────────────────────────────────────────────────

interface NotificationAction { action: string; title: string }

interface PushPayload {
  title: string
  body: string
  module?: string
  tag?: string
  actions?: NotificationAction[]
  data?: Record<string, unknown>
}

// ── Module → route map ────────────────────────────────────────────────────

const MODULE_ROUTES: Record<string, string> = {
  groceries: '/groceries',
  calendar:  '/calendar',
  kakebo:    '/kakebo',
  habits:    '/habits',
  media:     '/media',
  moments:   '/moments',
  training:  '/training',
  velov:     '/velov',
  home:      '/',
}

// ── Push listener ─────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload: PushPayload
  try {
    payload = event.data.json() as PushPayload
  } catch {
    console.error('[sw] Could not parse push payload as JSON')
    return
  }

  const { title = 'Familia', body = '', module, tag, actions, data } = payload

  console.log('[sw] Push received — module:', module ?? 'none')

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      // tag : regroupe/remplace les rappels d'une même entité (au lieu d'empiler).
      ...(tag ? { tag, renotify: true } : {}),
      vibrate: [80, 40, 80],
      actions: actions ?? [],
      // Stored in event.notification.data for the notificationclick handler
      data: { module, ...data },
    } as NotificationOptions)
  )
})

// ── Notification click listener ───────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const notifData = event.notification.data as { module?: string } | null
  const route = (notifData?.module && MODULE_ROUTES[notifData.module]) ?? '/'

  console.log('[sw] Notification clicked — navigating to', route)

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Reuse an existing app window rather than opening a duplicate tab
        const windowClients = clientList as WindowClient[]
        for (const client of windowClients) {
          void client.navigate(route)
          return client.focus()
        }
        // No window open — launch the app at the target route
        return self.clients.openWindow(route)
      })
  )
})
