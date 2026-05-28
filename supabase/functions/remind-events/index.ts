import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function parisDate(d: Date): string {
  return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
}

function parisMinutesSinceMidnight(d: Date): number {
  const str = d.toLocaleTimeString('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const [h, m] = str.split(':').map(Number)
  return h * 60 + m
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  const todayStr = parisDate(now)
  const nowMinutes = parisMinutesSinceMidnight(now)

  console.log(`[remind-events] Now: ${todayStr} ${nowMinutes}min since midnight (Paris)`)

  // ── Fetch today's timed events that have a reminder set ────────────────────
  const { data: events, error: eventsErr } = await supabase
    .from('events')
    .select('id, title, date, start_time, household_id, location, reminder_minutes')
    .eq('all_day', false)
    .eq('date', todayStr)
    .not('start_time', 'is', null)
    .not('reminder_minutes', 'is', null)

  if (eventsErr) {
    console.error('[remind-events] DB error:', eventsErr.message)
    return json({ error: 'DB error' }, 500)
  }

  if (!events || events.length === 0) {
    console.log('[remind-events] No timed events with reminder today.')
    return json({ reminders_sent: 0 })
  }

  // ── Filter events whose reminder window matches now (±5 min) ───────────────
  const candidates = events.filter((e) => {
    const ev = e as { start_time: string; reminder_minutes: number }
    const [h, m] = ev.start_time.split(':').map(Number)
    const triggerMins = h * 60 + m - ev.reminder_minutes
    return Math.abs(nowMinutes - triggerMins) <= 5
  })

  if (candidates.length === 0) {
    console.log('[remind-events] No reminders due now.')
    return json({ reminders_sent: 0 })
  }

  console.log(`[remind-events] ${candidates.length} reminder(s) due.`)

  // ── Filter out already-reminded events ────────────────────────────────────
  const candidateIds = candidates.map((e: { id: string }) => e.id)
  const { data: alreadySent } = await supabase
    .from('event_reminders_sent')
    .select('event_id')
    .in('event_id', candidateIds)

  const sentIds = new Set((alreadySent ?? []).map((r: { event_id: string }) => r.event_id))
  const toRemind = candidates.filter((e: { id: string }) => !sentIds.has(e.id))

  if (toRemind.length === 0) {
    console.log('[remind-events] All due reminders already sent.')
    return json({ reminders_sent: 0 })
  }

  // ── Setup web-push ─────────────────────────────────────────────────────────
  const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('[remind-events] Missing VAPID keys')
    return json({ error: 'Server misconfiguration' }, 500)
  }
  webpush.setVapidDetails(
    Deno.env.get('VAPID_CONTACT_EMAIL') ?? 'mailto:dyrecas@gmail.com',
    vapidPublicKey,
    vapidPrivateKey,
  )

  let totalSent = 0

  for (const event of toRemind) {
    const ev = event as {
      id: string; title: string; start_time: string; reminder_minutes: number
      household_id: string; location: string | null
    }

    const { data: members } = await supabase
      .from('members')
      .select('id')
      .eq('household_id', ev.household_id)
      .eq('notifications_enabled', true)

    if (!members || members.length === 0) continue

    const memberIds = members.map((m: { id: string }) => m.id)
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('member_id', memberIds)

    if (!subscriptions || subscriptions.length === 0) continue

    const reminderLabel = ev.reminder_minutes >= 60
      ? `${ev.reminder_minutes / 60}h`
      : `${ev.reminder_minutes} min`

    const payload = JSON.stringify({
      title: `⏰ Rappel : ${ev.title}`,
      body: `Dans ${reminderLabel}${ev.location ? ` · ${ev.location}` : ''} à ${ev.start_time}`,
      module: 'calendar',
    })

    const deadEndpoints: string[] = []

    await Promise.allSettled(
      subscriptions.map((sub: { endpoint: string; p256dh: string; auth: string }) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        ).then(
          () => { totalSent++ },
          (err: { statusCode?: number }) => {
            if (err?.statusCode === 410 || err?.statusCode === 404) {
              deadEndpoints.push(sub.endpoint)
            }
          },
        )
      )
    )

    if (deadEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', deadEndpoints)
    }

    await supabase
      .from('event_reminders_sent')
      .upsert({ event_id: ev.id }, { onConflict: 'event_id', ignoreDuplicates: true })

    console.log(`[remind-events] Reminded "${ev.title}" (${reminderLabel} before) → ${totalSent} push(es) sent.`)
  }

  return json({ reminders_sent: totalSent, events_processed: toRemind.length })
})
