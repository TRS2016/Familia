import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushErrorCode =
  | 'NOT_SUPPORTED'
  | 'IOS_NOT_INSTALLED'
  | 'PERMISSION_DENIED'
  | 'PERMISSION_DISMISSED'
  | 'SW_TIMEOUT'
  | 'SUBSCRIBE_FAILED'
  | 'DB_ERROR'

export class PushError extends Error {
  readonly code: PushErrorCode
  constructor(code: PushErrorCode, message: string) {
    super(message)
    this.name = 'PushError'
    this.code = code
  }
}

export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function isIOSNonStandalone(): boolean {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  if (!isIOS) return false
  return !window.matchMedia('(display-mode: standalone)').matches
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i)
  }
  return view
}

export async function subscribeToPush(memberId: string): Promise<void> {
  if (!isPushSupported()) throw new PushError('NOT_SUPPORTED', 'Push not supported')
  if (isIOSNonStandalone()) throw new PushError('IOS_NOT_INSTALLED', 'Not installed as PWA on iOS')
  if (Notification.permission === 'denied') throw new PushError('PERMISSION_DENIED', 'Permission denied')

  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission()
    if (result === 'denied') throw new PushError('PERMISSION_DENIED', 'Permission denied')
    if (result === 'default') throw new PushError('PERMISSION_DISMISSED', 'Permission dismissed')
  }

  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new PushError('SW_TIMEOUT', 'Service worker not ready after 10s')), 10_000)
    ),
  ])

  let subscription: PushSubscription
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY ?? ''),
    })
  } catch (err) {
    throw new PushError('SUBSCRIBE_FAILED', String(err))
  }

  const json = subscription.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!p256dh || !auth) throw new PushError('SUBSCRIBE_FAILED', 'Missing subscription keys')

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      member_id: memberId,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw new PushError('DB_ERROR', error.message)
}

export async function unsubscribeFromPush(memberId: string): Promise<void> {
  if (!isPushSupported()) return

  const registration = await navigator.serviceWorker.ready.catch(() => null)
  if (!registration) return

  const subscription = await registration.pushManager.getSubscription().catch(() => null)
  if (!subscription) return

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', subscription.endpoint)
    .eq('member_id', memberId)

  await subscription.unsubscribe().catch(() => null)
}
