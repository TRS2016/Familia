import { useState, useCallback, useEffect } from 'react'

export interface UseNotificationsResult {
  permission: NotificationPermission
  requestPermission: () => Promise<boolean>
  sendNotification: (title: string, options?: NotificationOptions) => void
}

export function useNotifications(): UseNotificationsResult {
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    return 'Notification' in window ? Notification.permission : 'default'
  })

  // L'autorisation peut changer dans les réglages OS pendant que l'app est en
  // arrière-plan : on resynchronise l'état au retour au premier plan.
  useEffect(() => {
    if (!('Notification' in window)) return
    const sync = () => setPermission(Notification.permission)
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

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
