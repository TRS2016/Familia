import { createClient } from 'jsr:@supabase/supabase-js@2'
import { configureWebPush, sendPush, cleanupAndTouch, parisDate } from '../_shared/push.ts'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Rappel du soir : pour chaque tâche assignée encore « pending » aujourd'hui,
// on notifie la personne assignée (ou tout le foyer si la tâche est libre).
Deno.serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  const todayStr = parisDate(now)
  console.log(`[remind-chores] ${todayStr} (Paris)`)

  // Assignations du jour encore à faire, avec le libellé de la tâche.
  const { data: assignments, error } = await supabase
    .from('chore_assignments')
    .select('id, household_id, member_id, chore:chores(name, emoji, archived_at)')
    .eq('date', todayStr)
    .eq('status', 'pending')

  if (error) {
    console.error('[remind-chores] DB error:', error.message)
    return json({ error: 'DB error' }, 500)
  }
  if (!assignments || assignments.length === 0) {
    return json({ reminders_sent: 0 })
  }

  // Exclut les tâches dont le template a été archivé.
  type Row = {
    id: string; household_id: string; member_id: string | null
    chore: { name: string; emoji: string; archived_at: string | null } | null
  }
  const live = (assignments as Row[]).filter(a => a.chore && !a.chore.archived_at)
  if (live.length === 0) return json({ reminders_sent: 0 })

  // Dédup : assignations déjà rappelées aujourd'hui.
  const ids = live.map(a => a.id)
  const { data: alreadySent } = await supabase
    .from('chore_reminders_sent')
    .select('assignment_id')
    .in('assignment_id', ids)
    .eq('sent_date', todayStr)
  const sentIds = new Set((alreadySent ?? []).map((r: { assignment_id: string }) => r.assignment_id))
  const toRemind = live.filter(a => !sentIds.has(a.id))
  if (toRemind.length === 0) return json({ reminders_sent: 0 })

  if (!configureWebPush()) {
    console.error('[remind-chores] Missing VAPID keys')
    return json({ error: 'Server misconfiguration' }, 500)
  }

  let totalSent = 0

  // ── Digest : 1 notification par membre listant ses tâches du soir ───────────
  // (au lieu d'une push par tâche). Tâche assignée → l'assigné ; tâche libre →
  // tous les membres du foyer (notifications activées).
  const households = [...new Set(toRemind.map(a => a.household_id))]
  for (const hh of households) {
    const { data: members } = await supabase.from('members')
      .select('id').eq('household_id', hh).eq('notifications_enabled', true)
    if (!members || members.length === 0) continue
    const memberIds = members.map((m: { id: string }) => m.id)

    // memberId → libellés de tâches à lui rappeler
    const byMember = new Map<string, string[]>(memberIds.map(id => [id, []]))
    for (const a of toRemind.filter(x => x.household_id === hh)) {
      const label = `${a.chore!.emoji} ${a.chore!.name}`
      if (a.member_id) byMember.get(a.member_id)?.push(label)
      else for (const id of memberIds) byMember.get(id)!.push(label)
    }

    for (const [memberId, labels] of byMember) {
      if (labels.length === 0) continue
      const { data: subs } = await supabase.from('push_subscriptions')
        .select('endpoint, p256dh, auth').eq('member_id', memberId)
      if (!subs || subs.length === 0) continue

      const body = labels.length === 1
        ? `${labels[0]} — encore à faire ce soir`
        : `${labels.length} tâches encore à faire : ${labels.slice(0, 4).join(', ')}${labels.length > 4 ? '…' : ''}`
      const payload = JSON.stringify({
        title: '🧹 Tâches du soir',
        body,
        module: 'chores',
        tag: 'chores-evening-digest',
        actions: [{ action: 'view', title: 'Voir' }],
      })
      const { sent, dead, ok } = await sendPush(subs, payload)
      totalSent += sent
      await cleanupAndTouch(supabase, dead, ok)
    }
  }

  // Marque toutes les assignations rappelées (dédup par jour).
  await supabase.from('chore_reminders_sent').upsert(
    toRemind.map(a => ({ assignment_id: a.id, sent_date: todayStr })),
    { onConflict: 'assignment_id,sent_date', ignoreDuplicates: true },
  )

  // Ménage : marqueurs de plus de 7 jours.
  const purgeBefore = parisDate(new Date(now.getTime() - 7 * 24 * 3600 * 1000))
  await supabase.from('chore_reminders_sent').delete().lt('sent_date', purgeBefore)

  console.log(`[remind-chores] ${totalSent} push(es) sent.`)
  return json({ reminders_sent: totalSent, assignments_processed: toRemind.length })
})
