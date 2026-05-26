/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

// Typed as ServiceWorkerGlobalScope instead of Window — excluded from tsconfig.app.json
// to avoid the DOM/WebWorker lib conflict. Compiled by Vite/esbuild, not tsc.
declare const self: ServiceWorkerGlobalScope

// ── Precache ──────────────────────────────────────────────────────────────

precacheAndRoute(self.__WB_MANIFEST)

// ── Types ─────────────────────────────────────────────────────────────────

interface PushPayload {
  title: string
  body: string
  module?: string
  data?: Record<string, unknown>
}

// ── Module → route map ────────────────────────────────────────────────────

const MODULE_ROUTES: Record<string, string> = {
  groceries: '/groceries',
  calendar:  '/calendar',
  kakebo:    '/kakebo',
  habits:    '/habits',
  media:     '/media',
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

  const { title = 'Familia', body = '', module, data } = payload

  console.log('[sw] Push received — module:', module ?? 'none')

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      // Stored in event.notification.data for the notificationclick handler
      data: { module, ...data },
    })
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
