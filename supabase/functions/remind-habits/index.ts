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

function parisTimeStr(d: Date): string {
  return d.toLocaleTimeString('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function parisMinutesSinceMidnight(d: Date): number {
  const [h, m] = parisTimeStr(d).split(':').map(Number)
  return h * 60 + m
}

Deno.serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  const todayStr  = parisDate(now)
  const nowMins   = parisMinutesSinceMidnight(now)
  const jsDay     = now.getDay()
  const todayDow  = jsDay === 0 ? 7 : jsDay  // 1=lun…7=dim

  console.log(`[remind-habits] ${todayStr} ${parisTimeStr(now)} Paris (dow=${todayDow})`)

  // Fetch active habits with a reminder time set
  const { data: habits, error: habitsErr } = await supabase
    .from('habits')
    .select('id, name, emoji, household_id, member_id, reminder_time, frequency_days, start_date')
    .is('archived_at', null)
    .not('reminder_time', 'is', null)

  if (habitsErr) {
    console.error('[remind-habits] DB error:', habitsErr.message)
    return json({ error: 'DB error' }, 500)
  }

  if (!habits || habits.length === 0) {
    return json({ reminders_sent: 0 })
  }

  // Filter habits applicable today and whose reminder window matches now (±3 min)
  const candidates = habits.filter((h) => {
    const habit = h as { reminder_time: string; frequency_days: number[] | null; start_date: string | null }
    if (habit.start_date && todayStr < habit.start_date) return false
    if (habit.frequency_days && habit.frequency_days.length > 0) {
      if (!habit.frequency_days.includes(todayDow)) return false
    }
    const [rh, rm] = habit.reminder_time.split(':').map(Number)
    return Math.abs(nowMins - (rh * 60 + rm)) <= 3
  })

  if (candidates.length === 0) {
    return json({ reminders_sent: 0 })
  }

  const candidateIds = candidates.map((h: { id: string }) => h.id)

  // Skip habits already completed today — pas de nag inutile.
  const { data: doneToday } = await supabase
    .from('habit_completions')
    .select('habit_id')
    .in('habit_id', candidateIds)
    .eq('date', todayStr)
    .eq('completed', true)
  const doneIds = new Set((doneToday ?? []).map((r: { habit_id: string }) => r.habit_id))

  // Dedup: skip habits already reminded today
  const { data: alreadySent } = await supabase
    .from('habit_reminders_sent')
    .select('habit_id')
    .in('habit_id', candidateIds)
    .eq('sent_date', todayStr)

  const sentIds = new Set((alreadySent ?? []).map((r: { habit_id: string }) => r.habit_id))
  const toRemind = candidates.filter((h: { id: string }) => !sentIds.has(h.id) && !doneIds.has(h.id))

  if (toRemind.length === 0) {
    return json({ reminders_sent: 0 })
  }

  // Setup web-push
  const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('[remind-habits] Missing VAPID keys')
    return json({ error: 'Server misconfiguration' }, 500)
  }
  webpush.setVapidDetails(
    Deno.env.get('VAPID_CONTACT_EMAIL') ?? 'mailto:dyrecas@gmail.com',
    vapidPublicKey,
    vapidPrivateKey,
  )

  let totalSent = 0

  for (const habit of toRemind) {
    const h = habit as { id: string; name: string; emoji: string; household_id: string; member_id: string | null }

    // Cible le membre propriétaire de l'habitude ; fallback foyer entier si
    // l'habitude n'a pas de propriétaire (member_id null).
    let membersQuery = supabase
      .from('members')
      .select('id')
      .eq('household_id', h.household_id)
      .eq('notifications_enabled', true)
    if (h.member_id) membersQuery = membersQuery.eq('id', h.member_id)
    const { data: members } = await membersQuery

    if (!members || members.length === 0) continue

    const memberIds = members.map((m: { id: string }) => m.id)
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('member_id', memberIds)

    if (!subscriptions || subscriptions.length === 0) continue

    const payload = JSON.stringify({
      title: `${h.emoji} ${h.name}`,
      body: `C'est l'heure de ton habitude !`,
      module: 'habits',
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
      .from('habit_reminders_sent')
      .upsert({ habit_id: h.id, sent_date: todayStr }, { onConflict: 'habit_id,sent_date', ignoreDuplicates: true })

    console.log(`[remind-habits] Reminded "${h.name}" → ${totalSent} push(es)`)
  }

  // Ménage : les marqueurs de déduplication de plus de 7 jours ne servent plus.
  const purgeBefore = parisDate(new Date(now.getTime() - 7 * 24 * 3600 * 1000))
  await supabase.from('habit_reminders_sent').delete().lt('sent_date', purgeBefore)

  return json({ reminders_sent: totalSent, habits_processed: toRemind.length })
})
