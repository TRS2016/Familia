import { createClient } from 'jsr:@supabase/supabase-js@2'
import { configureWebPush, sendPush, cleanupAndTouch, parisDate } from '../_shared/push.ts'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

interface Cat { id: string; household_id: string; name: string; type: string; monthly_budget: number | null }
interface Entry { household_id: string; category_id: string | null; member_id: string | null; amount: number }
interface MemberBudget { member_id: string; category_id: string; household_id: string; monthly_budget: number | null }

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  const period = parisDate(now).slice(0, 7)         // 'YYYY-MM' Paris
  const monthStart = `${period}-01`
  // Mois entier, pas « jusqu'à aujourd'hui » : les charges fixes sont
  // matérialisées à leur date d'échéance, souvent en fin de mois. S'arrêter à
  // aujourd'hui retardait la détection du dépassement sur ces catégories.
  const [py, pm] = period.split('-').map(Number)
  const monthEnd = `${period}-${String(new Date(py, pm, 0).getDate()).padStart(2, '0')}`

  // ── Données ────────────────────────────────────────────────────────────────
  const [catsRes, entriesRes, mbRes] = await Promise.all([
    supabase.from('kakebo_categories').select('id, household_id, name, type, monthly_budget'),
    supabase.from('kakebo_entries').select('household_id, category_id, member_id, amount')
      .gte('date', monthStart).lte('date', monthEnd),
    supabase.from('kakebo_member_budgets').select('member_id, category_id, household_id, monthly_budget'),
  ])
  if (catsRes.error || entriesRes.error || mbRes.error) {
    console.error('[remind-budget] DB error', catsRes.error ?? entriesRes.error ?? mbRes.error)
    return json({ error: 'DB error' }, 500)
  }
  const cats = (catsRes.data ?? []) as Cat[]
  const entries = (entriesRes.data ?? []) as Entry[]
  const memberBudgets = (mbRes.data ?? []) as MemberBudget[]

  const catById = new Map(cats.map(c => [c.id, c]))

  // Types comptés comme dépense de consommation. Doit rester aligné sur
  // `isSpendType` du client (src/features/kakebo/kakebo.utils.ts) : les
  // catégories 'saving' sont des virements vers l'épargne, pas des dépenses —
  // les inclure aurait produit des alertes « budget dépassé » sur une épargne.
  const isSpendType = (t: string) => t !== 'income' && t !== 'saving'

  // ── Agrégats du mois (dépenses uniquement, hors revenus) ────────────────────
  const foyerSpend = new Map<string, number>()                 // `${hh}|${cat}`
  const memberSpend = new Map<string, number>()                // `${member}|${cat}`
  for (const e of entries) {
    if (!e.category_id) continue
    const cat = catById.get(e.category_id)
    if (!cat || !isSpendType(cat.type)) continue
    const amt = Number(e.amount)
    if (e.member_id == null) {
      const k = `${e.household_id}|${e.category_id}`
      foyerSpend.set(k, (foyerSpend.get(k) ?? 0) + amt)
    } else {
      const k = `${e.member_id}|${e.category_id}`
      memberSpend.set(k, (memberSpend.get(k) ?? 0) + amt)
    }
  }

  // ── Candidats dépassés ──────────────────────────────────────────────────────
  // scope_key : 'foyer:<cat>' (notifie tout le foyer) ou 'member:<m>:<cat>' (le membre).
  interface Alert { household_id: string; scope_key: string; target_member_id: string | null; body: string }
  const candidates: Alert[] = []

  for (const c of cats) {
    if (!isSpendType(c.type) || c.monthly_budget == null) continue
    const spent = foyerSpend.get(`${c.household_id}|${c.id}`) ?? 0
    if (spent > Number(c.monthly_budget)) {
      candidates.push({
        household_id: c.household_id,
        scope_key: `foyer:${c.id}`,
        target_member_id: null,
        body: `Budget ${c.name} dépassé : ${Math.round(spent)} € / ${Math.round(Number(c.monthly_budget))} € ce mois.`,
      })
    }
  }
  for (const mb of memberBudgets) {
    if (mb.monthly_budget == null) continue
    const cat = catById.get(mb.category_id)
    if (!cat || !isSpendType(cat.type)) continue
    const spent = memberSpend.get(`${mb.member_id}|${mb.category_id}`) ?? 0
    if (spent > Number(mb.monthly_budget)) {
      candidates.push({
        household_id: mb.household_id,
        scope_key: `member:${mb.member_id}:${mb.category_id}`,
        target_member_id: mb.member_id,
        body: `Ton budget ${cat.name} est dépassé : ${Math.round(spent)} € / ${Math.round(Number(mb.monthly_budget))} € ce mois.`,
      })
    }
  }

  if (candidates.length === 0) return json({ alerts_sent: 0 })

  // ── Dédup : une alerte par périmètre et par mois ────────────────────────────
  const { data: already } = await supabase
    .from('kakebo_budget_alerts_sent')
    .select('scope_key')
    .eq('period', period)
    .in('scope_key', candidates.map(c => c.scope_key))
  const sent = new Set((already ?? []).map((r: { scope_key: string }) => r.scope_key))
  const toSend = candidates.filter(c => !sent.has(c.scope_key))
  if (toSend.length === 0) return json({ alerts_sent: 0 })

  if (!configureWebPush()) return json({ error: 'Server misconfiguration' }, 500)

  let total = 0
  for (const a of toSend) {
    // Destinataires : le membre ciblé (budget perso) ou tout le foyer (budget commun).
    let memberQuery = supabase.from('members').select('id')
      .eq('household_id', a.household_id).eq('notifications_enabled', true)
    if (a.target_member_id) memberQuery = memberQuery.eq('id', a.target_member_id)
    const { data: members } = await memberQuery
    const memberIds = (members ?? []).map((m: { id: string }) => m.id)
    if (memberIds.length === 0) {
      // Rien à notifier, mais on marque comme traité pour ne pas réessayer en boucle.
      await supabase.from('kakebo_budget_alerts_sent').upsert(
        { household_id: a.household_id, scope_key: a.scope_key, period },
        { onConflict: 'scope_key,period', ignoreDuplicates: true },
      )
      continue
    }
    const { data: subs } = await supabase.from('push_subscriptions')
      .select('endpoint, p256dh, auth').in('member_id', memberIds)

    if (subs && subs.length > 0) {
      const payload = JSON.stringify({
        title: '💸 Budget dépassé',
        body: a.body,
        module: 'kakebo',
        tag: `budget-${a.scope_key}-${period}`,
        actions: [{ action: 'view', title: 'Voir' }],
      })
      const { sent: s, dead, ok } = await sendPush(subs, payload)
      total += s
      await cleanupAndTouch(supabase, dead, ok)
    }

    await supabase.from('kakebo_budget_alerts_sent').upsert(
      { household_id: a.household_id, scope_key: a.scope_key, period },
      { onConflict: 'scope_key,period', ignoreDuplicates: true },
    )
  }

  return json({ alerts_sent: total, alerts_processed: toSend.length })
})
