import { createClient } from 'jsr:@supabase/supabase-js@2'
import { configureWebPush, sendPush, cleanupAndTouch, parisDate } from '../_shared/push.ts'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Digest du matin (~8h Paris via cron) : une seule push par membre résumant sa
// journée — événements, tâches assignées, habitudes prévues, repas planifiés.
// Pas de table de dédup : le cron ne tire qu'une fois par jour.
Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  const todayStr = parisDate(now)
  const jsDay = now.getDay()
  const todayDow = jsDay === 0 ? 7 : jsDay // 1=lun…7=dim

  const [eventsRes, assignRes, habitsRes, mealsRes, membersRes] = await Promise.all([
    supabase.from('events')
      .select('household_id, member_id, title, all_day, start_time')
      .eq('date', todayStr),
    supabase.from('chore_assignments')
      .select('household_id, member_id, chore:chores(name, emoji, archived_at)')
      .eq('date', todayStr)
      .eq('status', 'pending'),
    supabase.from('habits')
      .select('household_id, member_id, frequency_days, start_date')
      .is('archived_at', null),
    supabase.from('meal_plan_entries')
      .select('household_id, meal_type, recipe:recipes(title)')
      .eq('date', todayStr),
    supabase.from('members')
      .select('id, household_id')
      .eq('notifications_enabled', true),
  ])
  const dbError = eventsRes.error ?? assignRes.error ?? habitsRes.error ?? mealsRes.error ?? membersRes.error
  if (dbError) {
    console.error('[daily-digest] DB error:', dbError.message)
    return json({ error: 'DB error' }, 500)
  }

  type EventRow = { household_id: string; member_id: string | null; title: string; all_day: boolean; start_time: string | null }
  type AssignRow = { household_id: string; member_id: string | null; chore: { name: string; emoji: string; archived_at: string | null } | null }
  type HabitRow = { household_id: string; member_id: string | null; frequency_days: number[] | null; start_date: string | null }
  type MealRow = { household_id: string; meal_type: string; recipe: { title: string } | null }

  const events = (eventsRes.data ?? []) as EventRow[]
  const assignments = ((assignRes.data ?? []) as AssignRow[]).filter(a => a.chore && !a.chore.archived_at)
  const habitsDue = ((habitsRes.data ?? []) as HabitRow[]).filter(h => {
    if (h.start_date && todayStr < h.start_date) return false
    if (h.frequency_days && h.frequency_days.length > 0 && !h.frequency_days.includes(todayDow)) return false
    return true
  })
  const meals = (mealsRes.data ?? []) as MealRow[]
  const members = (membersRes.data ?? []) as { id: string; household_id: string }[]

  if (members.length === 0) return json({ digests_sent: 0 })

  if (!configureWebPush()) {
    console.error('[daily-digest] Missing VAPID keys')
    return json({ error: 'Server misconfiguration' }, 500)
  }

  const MEAL_LABEL: Record<string, string> = {
    petit_dej: 'Petit-déj', dejeuner: 'Déjeuner', collation: 'Collation', diner: 'Dîner',
  }

  let totalSent = 0
  for (const member of members) {
    const lines: string[] = []

    // Événements du foyer + les siens (heure en tête si horodaté).
    const myEvents = events
      .filter(e => e.household_id === member.household_id && (e.member_id === null || e.member_id === member.id))
      .sort((a, b) => (a.start_time ?? '') < (b.start_time ?? '') ? -1 : 1)
    if (myEvents.length > 0) {
      const labels = myEvents.map(e => e.all_day || !e.start_time ? e.title : `${e.start_time.slice(0, 5)} ${e.title}`)
      lines.push(`📅 ${labels.slice(0, 3).join(' · ')}${labels.length > 3 ? ` (+${labels.length - 3})` : ''}`)
    }

    // Tâches : assignées à lui + tâches libres du foyer.
    const myChores = assignments.filter(a =>
      a.household_id === member.household_id && (a.member_id === null || a.member_id === member.id))
    if (myChores.length > 0) {
      const labels = myChores.map(a => `${a.chore!.emoji} ${a.chore!.name}`)
      lines.push(`🧹 ${labels.slice(0, 3).join(' · ')}${labels.length > 3 ? ` (+${labels.length - 3})` : ''}`)
    }

    // Habitudes prévues aujourd'hui (les siennes + celles du foyer).
    const myHabits = habitsDue.filter(h =>
      h.household_id === member.household_id && (h.member_id === null || h.member_id === member.id))
    if (myHabits.length > 0) {
      lines.push(`🔁 ${myHabits.length} habitude${myHabits.length > 1 ? 's' : ''} prévue${myHabits.length > 1 ? 's' : ''}`)
    }

    // Repas planifiés du foyer.
    const myMeals = meals.filter(m => m.household_id === member.household_id && m.recipe)
    if (myMeals.length > 0) {
      lines.push(`🍳 ${myMeals.map(m => `${MEAL_LABEL[m.meal_type] ?? m.meal_type} : ${m.recipe!.title}`).slice(0, 2).join(' · ')}`)
    }

    if (lines.length === 0) continue

    const { data: subs } = await supabase.from('push_subscriptions')
      .select('endpoint, p256dh, auth').eq('member_id', member.id)
    if (!subs || subs.length === 0) continue

    const payload = JSON.stringify({
      title: '☀️ Ta journée',
      body: lines.join('\n'),
      module: 'home',
      tag: 'daily-digest',
      actions: [{ action: 'view', title: 'Voir' }],
    })
    const { sent, dead, ok } = await sendPush(subs, payload)
    totalSent += sent
    await cleanupAndTouch(supabase, dead, ok)
  }

  console.log(`[daily-digest] ${totalSent} push(es) sent.`)
  return json({ digests_sent: totalSent })
})
