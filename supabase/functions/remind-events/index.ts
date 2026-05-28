import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Format a Date as "YYYY-MM-DD" in Europe/Paris timezone
function parisDate(d: Date): string {
  return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
}

// Format a Date as "HH:MM" in Europe/Paris timezone
function parisTime(d: Date): string {
  return d.toLocaleTimeString('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Compute 25–35 min window in Paris local time ───────────────────────────
  const now = Date.now()
  const winStart = new Date(now + 25 * 60 * 1000)
  const winEnd   = new Date(now + 35 * 60 * 1000)

  const dateStr      = parisDate(winStart)
  const timeStartStr = parisTime(winStart)
  const timeEndStr   = parisTime(winEnd)

  console.log(`[remind-events] Window: ${dateStr} ${timeStartStr}–${timeEndStr}`)

  // ── Fetch upcoming events not yet reminded ─────────────────────────────────
  const { data: events, error: eventsErr } = await supabase
    .from('events')
    .select('id, title, date, start_time, household_id, location')
    .eq('all_day', false)
    .eq('date', dateStr)
    .gte('start_time', timeStartStr)
    .lte('start_time', timeEndStr)
    .not('start_time', 'is', null)

  if (eventsErr) {
    console.error('[remind-events] DB error fetching events:', eventsErr.message)
    return json({ error: 'DB error' }, 500)
  }

  if (!events || events.length === 0) {
    console.log('[remind-events] No upcoming events.')
    return json({ reminders_sent: 0 })
  }

  console.log(`[remind-events] Found ${events.length} event(s) to remind.`)

  // ── Filter out already-reminded events ────────────────────────────────────
  const eventIds = events.map((e: { id: string }) => e.id)
  const { data: alreadySent } = await supabase
    .from('event_reminders_sent')
    .select('event_id')
    .in('event_id', eventIds)

  const sentIds = new Set((alreadySent ?? []).map((r: { event_id: string }) => r.event_id))
  const toRemind = events.filter((e: { id: string }) => !sentIds.has(e.id))

  if (toRemind.length === 0) {
    console.log('[remind-events] All events already reminded.')
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
      id: string; title: string; start_time: string
      household_id: string; location: string | null
    }

    // Get all members with notifications enabled for this household
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

    const payload = JSON.stringify({
      title: `⏰ Rappel : ${ev.title}`,
      body: `Dans ~30 min${ev.location ? ` · ${ev.location}` : ''} à ${ev.start_time}`,
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

    // Clean up dead subscriptions
    if (deadEndpoints.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', deadEndpoints)
    }

    // Mark event as reminded (upsert + ignoreDuplicates = no error si déjà présent)
    await supabase
      .from('event_reminders_sent')
      .upsert({ event_id: ev.id }, { onConflict: 'event_id', ignoreDuplicates: true })

    console.log(`[remind-events] Reminded "${ev.title}" → ${totalSent} push(es) sent.`)
  }

  return json({ reminders_sent: totalSent, events_processed: toRemind.length })
})
