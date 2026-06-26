import { createClient } from 'jsr:@supabase/supabase-js@2'
import { configureWebPush, sendPush, cleanupAndTouch, parisDate } from '../_shared/push.ts'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

// Décalage Paris↔UTC (gère l'heure d'été).
function parisOffsetMinutes(d: Date): number {
  const s = d.toLocaleString('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'longOffset' })
  const m = s.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!m) return 0
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}
function parisWallToUtcMs(dateStr: string, timeStr: string): number {
  const [Y, M, D] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  const guess = Date.UTC(Y, M - 1, D, h, mi)
  return guess - parisOffsetMinutes(new Date(guess)) * 60000
}

// Récap hebdo (dimanche soir) : classement des points gagnés cette semaine
// (lundi → maintenant) par membre, + avancement de l'objectif familial hebdo.
Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Lundi de la semaine courante (Paris) → instant UTC de filtrage.
  const today = parisDate(new Date())
  const [Y, M, D] = today.split('-').map(Number)
  const dow = new Date(Date.UTC(Y, M - 1, D)).getUTCDay() // 0=dim..6=sam
  const sinceMonday = (dow + 6) % 7
  const monday = new Date(Date.UTC(Y, M - 1, D - sinceMonday))
  const mondayStr = monday.toISOString().slice(0, 10)
  const sinceIso = new Date(parisWallToUtcMs(mondayStr, '00:00')).toISOString()

  const { data: events, error } = await supabase
    .from('point_events')
    .select('household_id, member_id, points')
    .gte('created_at', sinceIso)
  if (error) {
    console.error('[recap-chores] DB error', error.message)
    return json({ error: 'DB error' }, 500)
  }
  if (!events || events.length === 0) return json({ recaps_sent: 0 })

  // points par foyer → par membre
  const byHousehold = new Map<string, Map<string, number>>()
  for (const e of events as { household_id: string; member_id: string; points: number }[]) {
    const m = byHousehold.get(e.household_id) ?? new Map<string, number>()
    m.set(e.member_id, (m.get(e.member_id) ?? 0) + Number(e.points))
    byHousehold.set(e.household_id, m)
  }

  if (!configureWebPush()) return json({ error: 'Server misconfiguration' }, 500)
  let total = 0

  for (const [hh, perMember] of byHousehold) {
    const { data: members } = await supabase
      .from('members').select('id, display_name, notifications_enabled').eq('household_id', hh)
    if (!members || members.length === 0) continue
    const nameById = new Map(members.map((m: { id: string; display_name: string }) => [m.id, m.display_name]))

    const ranking = [...perMember.entries()]
      .map(([id, pts]) => ({ name: nameById.get(id) ?? '?', pts }))
      .sort((a, b) => b.pts - a.pts)
    const medals = ['🥇', '🥈', '🥉']
    const rankLine = ranking.map((r, i) => `${medals[i] ?? `${i + 1}.`} ${r.name} ${r.pts}`).join(' · ')

    // Objectif familial hebdo (optionnel).
    let goalLine = ''
    const { data: goals } = await supabase
      .from('family_goals').select('label, target_points, period')
      .eq('household_id', hh).eq('active', true).eq('period', 'week').limit(1)
    if (goals && goals.length > 0) {
      const g = goals[0] as { label: string; target_points: number }
      const weekTotal = [...perMember.values()].reduce((s, v) => s + v, 0)
      const reached = weekTotal >= g.target_points
      goalLine = ` · 🎯 ${weekTotal}/${g.target_points}${reached ? ' atteint !' : ''}`
    }

    const recipients = members.filter((m: { notifications_enabled: boolean }) => m.notifications_enabled)
    if (recipients.length === 0) continue
    const { data: subs } = await supabase
      .from('push_subscriptions').select('endpoint, p256dh, auth')
      .in('member_id', recipients.map((m: { id: string }) => m.id))
    if (!subs || subs.length === 0) continue

    const payload = JSON.stringify({
      title: '🏆 Récap de la semaine',
      body: `${rankLine}${goalLine}`,
      module: 'chores',
      tag: 'chores-weekly-recap',
      actions: [{ action: 'view', title: 'Voir' }],
    })
    const { sent, dead, ok } = await sendPush(subs, payload)
    total += sent
    await cleanupAndTouch(supabase, dead, ok)
  }

  return json({ recaps_sent: total })
})
