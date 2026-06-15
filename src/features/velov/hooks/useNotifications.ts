import { useState, useCallback } from 'react'

export interface UseNotificationsResult {
  permission: NotificationPermission
  requestPermission: () => Promise<boolean>
  sendNotification: (title: string, options?: NotificationOptions) => void
}

export function useNotifications(): UseNotificationsResult {
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    return 'Notification' in window ? Notification.permission : 'default'
  })

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false
    const result = await Notification.requestPermission()
    setPermission(result)
    return result === 'granted'
  }, [])

  const sendNotification = useCallback((title: string, options: NotificationOptions = {}) => {
    if (permission !== 'granted') return

    const opts: NotificationOptions = {
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      body: options.body || '',
      tag: options.tag || 'velov-notification',
      ...options,
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title, opts))
        .catch(() => {
          try { new Notification(title, opts) } catch { /* ignore */ }
        })
      return
    }

    try { new Notification(title, opts) } catch { /* ignore */ }
  }, [permission])

  return { permission, requestPermission, sendNotification }
}
