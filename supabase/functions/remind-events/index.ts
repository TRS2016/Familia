import { createClient } from 'jsr:@supabase/supabase-js@2'
import { configureWebPush, sendPush, cleanupAndTouch, parisDate } from '../_shared/push.ts'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Décalage (en minutes) de Paris par rapport à UTC à l'instant donné (gère l'heure d'été).
function parisOffsetMinutes(d: Date): number {
  const s = d.toLocaleString('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'longOffset' })
  const m = s.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!m) return 0
  const sign = m[1] === '-' ? -1 : 1
  return sign * (Number(m[2]) * 60 + Number(m[3]))
}

// Convertit une date+heure « murale » Paris (YYYY-MM-DD, HH:MM[:SS]) en epoch UTC (ms).
function parisWallToUtcMs(dateStr: string, timeStr: string): number {
  const [Y, M, D] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  const guess = Date.UTC(Y, M - 1, D, h, mi)
  const offset = parisOffsetMinutes(new Date(guess))
  return guess - offset * 60000
}

function reminderLabel(mins: number): string {
  if (mins % 1440 === 0) {
    const days = mins / 1440
    if (days === 7) return '1 semaine'
    return days === 1 ? '1 jour' : `${days} jours`
  }
  if (mins >= 60 && mins % 60 === 0) return `${mins / 60}h`
  return `${mins} min`
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  const nowMs = now.getTime()
  const todayStr = parisDate(now)
  // Le rappel le plus long est « 1 semaine » : on regarde jusqu'à 8 jours devant (marge).
  const maxStr = parisDate(new Date(nowMs + 8 * 24 * 60 * 60 * 1000))

  console.log(`[remind-events] Now: ${now.toISOString()} — window ${todayStr} → ${maxStr} (Paris)`)

  // ── Fetch upcoming timed events that have a reminder set ────────────────────
  const { data: events, error: eventsErr } = await supabase
    .from('events')
    .select('id, title, date, start_time, household_id, location, reminder_minutes')
    .eq('all_day', false)
    .gte('date', todayStr)
    .lte('date', maxStr)
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

  // ── Filter events whose reminder instant matches now (±5 min) ──────────────
  // On garde l'instant de déclenchement : il sert de clé de dédup (re-notifie si
  // l'événement est modifié → instant différent).
  const candidates = events
    .map((e) => {
      const ev = e as { date: string; start_time: string; reminder_minutes: number }
      const triggerMs = parisWallToUtcMs(ev.date, ev.start_time) - ev.reminder_minutes * 60000
      return { e, triggerMs }
    })
    .filter(({ triggerMs }) => Math.abs(nowMs - triggerMs) <= 5 * 60000)

  if (candidates.length === 0) {
    console.log('[remind-events] No reminders due now.')
    return json({ reminders_sent: 0 })
  }

  console.log(`[remind-events] ${candidates.length} reminder(s) due.`)

  // ── Filter out reminders already sent FOR THIS trigger instant ─────────────
  const candidateIds = candidates.map(({ e }) => (e as { id: string }).id)
  const { data: alreadySent } = await supabase
    .from('event_reminders_sent')
    .select('event_id, trigger_at')
    .in('event_id', candidateIds)

  const sentKeys = new Set(
    (alreadySent ?? [])
      .filter((r: { trigger_at: string | null }) => r.trigger_at != null)
      .map((r: { event_id: string; trigger_at: string }) => `${r.event_id}|${Date.parse(r.trigger_at)}`)
  )
  const toRemind = candidates.filter(
    ({ e, triggerMs }) => !sentKeys.has(`${(e as { id: string }).id}|${triggerMs}`)
  )

  if (toRemind.length === 0) {
    console.log('[remind-events] All due reminders already sent.')
    return json({ reminders_sent: 0 })
  }

  // ── Setup web-push ─────────────────────────────────────────────────────────
  if (!configureWebPush()) {
    console.error('[remind-events] Missing VAPID keys')
    return json({ error: 'Server misconfiguration' }, 500)
  }

  let totalSent = 0

  for (const { e, triggerMs } of toRemind) {
    const ev = e as {
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

    const label = reminderLabel(ev.reminder_minutes)

    const payload = JSON.stringify({
      title: `⏰ Rappel : ${ev.title}`,
      body: `Dans ${label}${ev.location ? ` · ${ev.location}` : ''} à ${ev.start_time.slice(0, 5)}`,
      module: 'calendar',
      tag: `event-${ev.id}`,
      actions: [{ action: 'view', title: 'Voir' }],
    })

    const { sent, dead, ok } = await sendPush(subscriptions, payload)
    totalSent += sent
    await cleanupAndTouch(supabase, dead, ok)

    await supabase
      .from('event_reminders_sent')
      .upsert(
        { event_id: ev.id, trigger_at: new Date(triggerMs).toISOString() },
        { onConflict: 'event_id,trigger_at', ignoreDuplicates: true },
      )

    console.log(`[remind-events] Reminded "${ev.title}" (${label} before) → ${totalSent} push(es) sent.`)
  }

  return json({ reminders_sent: totalSent, events_processed: toRemind.length })
})
