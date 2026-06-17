// Helpers partagés pour l'envoi de notifications push (VAPID / web-push).
// Factorise le setup, l'envoi en lot, le nettoyage des endpoints morts et la
// mise à jour de last_used_at, communs aux edges notify-household / remind-*.
import webpush from 'npm:web-push@3.6.7'

export interface PushSub {
  endpoint: string
  p256dh: string
  auth: string
}

/** Configure web-push depuis les variables d'env. Retourne false si VAPID manquant. */
export function configureWebPush(): boolean {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) return false
  webpush.setVapidDetails(
    Deno.env.get('VAPID_CONTACT_EMAIL') ?? 'mailto:dyrecas@gmail.com',
    pub,
    priv,
  )
  return true
}

/** Envoie un payload à une liste d'abonnements. Sépare succès / endpoints morts. */
export async function sendPush(subs: PushSub[], payload: string): Promise<{
  sent: number
  dead: string[]
  ok: string[]
}> {
  let sent = 0
  const dead: string[] = []
  const ok: string[] = []
  await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ).then(
        () => { sent++; ok.push(sub.endpoint) },
        (err: { statusCode?: number }) => {
          if (err?.statusCode === 410 || err?.statusCode === 404) dead.push(sub.endpoint)
        },
      )
    )
  )
  return { sent, dead, ok }
}

/** Supprime les endpoints morts et rafraîchit last_used_at des envois réussis. */
// deno-lint-ignore no-explicit-any
export async function cleanupAndTouch(supabase: any, dead: string[], ok: string[]): Promise<void> {
  if (dead.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', dead)
  }
  if (ok.length > 0) {
    await supabase.from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .in('endpoint', ok)
  }
}

/** Date YYYY-MM-DD dans le fuseau Europe/Paris. */
export function parisDate(d: Date): string {
  return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
}
