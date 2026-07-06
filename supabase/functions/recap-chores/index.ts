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

/** Lundi (yyyy-MM-dd) de la semaine d'une date Paris (yyyy-MM-dd). */
function mondayOf(dateStr: string): string {
  const [Y, M, D] = dateStr.split('-').map(Number)
  const dow = new Date(Date.UTC(Y, M - 1, D)).getUTCDay() // 0=dim..6=sam
  const back = (dow + 6) % 7
  return new Date(Date.UTC(Y, M - 1, D - back)).toISOString().slice(0, 10)
}
function weeksBefore(mondayStr: string, n: number): string {
  const [Y, M, D] = mondayStr.split('-').map(Number)
  return new Date(Date.UTC(Y, M - 1, D - 7 * n)).toISOString().slice(0, 10)
}

// Zone « équilibrée » : chacun porte au moins 40 % des points de la semaine.
const BALANCED_MIN_SHARE = 0.4
const STREAK_MAX_WEEKS = 26

// Récap hebdo (dimanche soir). Pour un foyer de 2 adultes, la balance d'équité
// et le streak de couple passent en premier ; les points de chacun suivent
// (le podium devient secondaire). Ton factuel, jamais culpabilisant.
Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Lundi de la semaine courante (Paris) + départ de l'historique (26 semaines).
  const today = parisDate(new Date())
  const mondayStr = mondayOf(today)
  const historyStart = weeksBefore(mondayStr, STREAK_MAX_WEEKS)
  const sinceIso = new Date(parisWallToUtcMs(historyStart, '00:00')).toISOString()

  const { data: events, error } = await supabase
    .from('point_events')
    .select('household_id, member_id, points, created_at')
    .gte('created_at', sinceIso)
  if (error) {
    console.error('[recap-chores] DB error', error.message)
    return json({ error: 'DB error' }, 500)
  }
  if (!events || events.length === 0) return json({ recaps_sent: 0 })

  // household → semaine (lundi) → membre → points
  type Ev = { household_id: string; member_id: string; points: number; created_at: string }
  const byHousehold = new Map<string, Map<string, Map<string, number>>>()
  for (const e of events as Ev[]) {
    const week = mondayOf(parisDate(new Date(e.created_at)))
    const weeks = byHousehold.get(e.household_id) ?? new Map<string, Map<string, number>>()
    const perMember = weeks.get(week) ?? new Map<string, number>()
    perMember.set(e.member_id, (perMember.get(e.member_id) ?? 0) + Number(e.points))
    weeks.set(week, perMember)
    byHousehold.set(e.household_id, weeks)
  }

  if (!configureWebPush()) return json({ error: 'Server misconfiguration' }, 500)
  let total = 0

  for (const [hh, weeks] of byHousehold) {
    const currentWeek = weeks.get(mondayStr)
    if (!currentWeek || currentWeek.size === 0) continue // rien cette semaine

    const { data: members } = await supabase
      .from('members')
      .select('id, display_name, notifications_enabled, created_at')
      .eq('household_id', hh)
      .order('created_at', { ascending: true })
    if (!members || members.length === 0) continue
    type Member = { id: string; display_name: string; notifications_enabled: boolean }
    const nameById = new Map((members as Member[]).map(m => [m.id, m.display_name]))

    // Objectif familial hebdo (optionnel).
    let goalLine = ''
    const { data: goals } = await supabase
      .from('family_goals').select('label, target_points, period')
      .eq('household_id', hh).eq('active', true).eq('period', 'week').limit(1)
    if (goals && goals.length > 0) {
      const g = goals[0] as { label: string; target_points: number }
      const weekTotal = [...currentWeek.values()].reduce((s, v) => s + v, 0)
      const reached = weekTotal >= g.target_points
      goalLine = ` · 🎯 ${weekTotal}/${g.target_points}${reached ? ' atteint !' : ''}`
    }

    let title: string
    let body: string

    if (members.length === 2) {
      // ── Balance d'équité + streak de couple (avant les points de chacun) ──
      const [a, b] = members as Member[]
      const aPts = currentWeek.get(a.id) ?? 0
      const bPts = currentWeek.get(b.id) ?? 0
      const weekTotal = aPts + bPts
      const aPct = weekTotal > 0 ? Math.round((aPts / weekTotal) * 100) : 50
      const minShare = weekTotal > 0 ? Math.min(aPts, bPts) / weekTotal : 0
      const balanced = weekTotal > 0 && minShare >= BALANCED_MIN_SHARE

      // Streak : semaines consécutives équilibrées, en remontant depuis la
      // semaine courante (qui se termine ce dimanche). Semaine sans point =
      // neutre (sautée) ; semaine déséquilibrée = fin de série. Même règle
      // que le client (useEquilibre.coupleStreak).
      let streak = 0
      for (let i = 0; i < STREAK_MAX_WEEKS; i++) {
        const wk = weeks.get(weeksBefore(mondayStr, i))
        const wa = wk?.get(a.id) ?? 0
        const wb = wk?.get(b.id) ?? 0
        const wt = wa + wb
        if (wt === 0) continue
        if (Math.min(wa, wb) / wt < BALANCED_MIN_SHARE) break
        streak++
      }

      const balanceLine = balanced
        ? `⚖️ Semaine équilibrée ${aPct}/${100 - aPct} — bravo à vous deux`
        : `⚖️ Balance ${aPct}/${100 - aPct} cette semaine — elle s'équilibre sur la durée`
      const streakLine = balanced && streak > 0
        ? ` · 🤝 ${streak} semaine${streak > 1 ? 's' : ''} d'équilibre d'affilée`
        : ''
      const pointsLine = ` · ${a.display_name} ${aPts} · ${b.display_name} ${bPts}`

      title = '⚖️ Récap de la semaine'
      body = `${balanceLine}${streakLine}${pointsLine}${goalLine}`
    } else {
      // Foyer hors duo : classement classique.
      const ranking = [...currentWeek.entries()]
        .map(([id, pts]) => ({ name: nameById.get(id) ?? '?', pts }))
        .sort((x, y) => y.pts - x.pts)
      const medals = ['🥇', '🥈', '🥉']
      const rankLine = ranking.map((r, i) => `${medals[i] ?? `${i + 1}.`} ${r.name} ${r.pts}`).join(' · ')
      title = '🏆 Récap de la semaine'
      body = `${rankLine}${goalLine}`
    }

    const recipients = (members as Member[]).filter(m => m.notifications_enabled)
    if (recipients.length === 0) continue
    const { data: subs } = await supabase
      .from('push_subscriptions').select('endpoint, p256dh, auth')
      .in('member_id', recipients.map(m => m.id))
    if (!subs || subs.length === 0) continue

    const payload = JSON.stringify({
      title,
      body,
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
