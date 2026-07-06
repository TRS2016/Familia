import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, startOfWeek, subWeeks, addDays } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useToast } from '../../components/useToast'
import { POINTS_KEY, memberPoints, type PointMap } from './useGamification'

// ── Volet « Équilibre du foyer » ──────────────────────────────────────────────
// Philosophie : maintenir un équilibre entre les deux adultes, pas désigner un
// gagnant. Tout se calcule sur le même ledger point_events que le reste.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChoreThanks {
  id: string
  household_id: string
  log_id: string | null
  from_member: string
  to_member: string
  created_at: string
}

export interface ChoreDislike {
  id: string
  household_id: string
  chore_id: string
  member_id: string
  created_at: string
}

export type FeedbackVerdict = 'easier' | 'as_expected' | 'harder'

export interface ChoreFeedback {
  id: string
  household_id: string
  chore_id: string | null
  log_id: string | null
  member_id: string
  verdict: FeedbackVerdict
  created_at: string
}

export interface WeeklyPointRow { week_start: string; member_id: string; total: number }

// ── Query keys ────────────────────────────────────────────────────────────────

export const THANKS_KEY   = ['chore-thanks', HOUSEHOLD_ID] as const
export const DISLIKES_KEY = ['chore-dislikes', HOUSEHOLD_ID] as const
export const FEEDBACK_KEY = ['chore-feedback', HOUSEHOLD_ID] as const
// Préfixe POINTS_KEY : l'invalidation realtime de point_events couvre aussi
// les sommes hebdomadaires.
const WEEKLY_KEY = [...POINTS_KEY, 'weekly'] as const

// ── Balance d'équité (helpers purs) ───────────────────────────────────────────

/** Zone « équilibrée » : chacun porte au moins 40 % des points de la semaine. */
export const BALANCED_MIN_SHARE = 0.4

export interface BalanceState {
  aPts: number
  bPts: number
  total: number
  aPct: number      // 0..100, arrondi (bPct = 100 - aPct)
  balanced: boolean // vrai aussi quand total = 0 (rien à pencher)
}

export function balanceOf(points: PointMap, aId: string, bId: string): BalanceState {
  const aPts = memberPoints(points, aId)
  const bPts = memberPoints(points, bId)
  const total = aPts + bPts
  const aShare = total > 0 ? aPts / total : 0.5
  const aPct = Math.round(aShare * 100)
  const minShare = Math.min(aShare, 1 - aShare)
  return { aPts, bPts, total, aPct, balanced: total === 0 || minShare >= BALANCED_MIN_SHARE }
}

/** Lundi (yyyy-MM-dd) de la semaine d'une date. */
export function weekStartOf(d: Date): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

/**
 * Streak de couple : semaines consécutives terminées dans la zone équilibrée,
 * en remontant depuis `fromWeek` (incluse). Une semaine sans aucun point est
 * neutre (sautée : les vacances ne cassent pas la série) ; une semaine
 * déséquilibrée l'arrête. Même règle que l'edge recap-chores.
 */
export function coupleStreak(rows: WeeklyPointRow[], aId: string, bId: string, fromWeek: string, maxWeeks = 26): number {
  const byWeek = new Map<string, PointMap>()
  for (const r of rows) {
    const m = byWeek.get(r.week_start) ?? {}
    m[r.member_id] = (m[r.member_id] ?? 0) + Number(r.total)
    byWeek.set(r.week_start, m)
  }
  let streak = 0
  let week = new Date(fromWeek + 'T12:00')
  for (let i = 0; i < maxWeeks; i++) {
    const ws = format(week, 'yyyy-MM-dd')
    const b = balanceOf(byWeek.get(ws) ?? {}, aId, bId)
    if (b.total > 0) {
      if (!b.balanced) break
      streak++
    }
    week = subWeeks(week, 1)
  }
  return streak
}

/** Sommes hebdomadaires par membre sur ~26 semaines (balance + streak de couple). */
export function useWeeklyPoints() {
  const since = format(subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 26), 'yyyy-MM-dd')
  return useQuery({
    queryKey: [...WEEKLY_KEY, since],
    queryFn: async (): Promise<WeeklyPointRow[]> => {
      const { data, error } = await supabase.rpc('member_points_by_week', { p_since: since })
      if (error) throw error
      return ((data ?? []) as WeeklyPointRow[]).map(r => ({ ...r, total: Number(r.total) }))
    },
  })
}

// ── Mercis ────────────────────────────────────────────────────────────────────

export function useThanks() {
  return useQuery({
    queryKey: THANKS_KEY,
    queryFn: async (): Promise<ChoreThanks[]> => {
      const { data, error } = await supabase
        .from('chore_thanks')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as unknown as ChoreThanks[]
    },
  })
}

/** Envoie un merci (un par tâche et par personne, non annulable, 0 point). */
export function useSendThanks() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async ({ logId, fromMember, toMember }: { logId: string; fromMember: string; toMember: string; label?: string }) => {
      const { error } = await supabase.from('chore_thanks').insert({
        household_id: HOUSEHOLD_ID, log_id: logId, from_member: fromMember, to_member: toMember,
      } as never)
      // Doublon (UNIQUE log_id,from_member) = déjà remercié : pas une erreur.
      if (error && error.code !== '23505') throw error
      return { duplicate: error?.code === '23505' }
    },
    onSuccess: ({ duplicate }, vars) => {
      queryClient.invalidateQueries({ queryKey: THANKS_KEY })
      if (duplicate) return
      showToast({ type: 'success', message: 'Merci envoyé 💛' })
      // Notifie l'autre (notify-household exclut l'émetteur).
      if (vars.label) {
        void supabase.functions.invoke('notify-household', {
          body: { title: '💛 Merci !', body: `On te remercie pour « ${vars.label} »`, module: 'chores' },
        })
      }
    },
    onError: () => showToast({ type: 'error', message: 'Impossible d\'envoyer le merci.' }),
  })
}

/** Petite célébration à la réception d'un merci (toast temps réel). */
export function useThanksCelebration(currentMemberId: string | null) {
  const { showToast } = useToast()
  useEffect(() => {
    if (!currentMemberId) return
    const channel = supabase
      .channel('chore-thanks-celebration')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chore_thanks' }, (payload) => {
        const row = payload.new as { to_member?: string }
        if (row.to_member === currentMemberId) {
          showToast({ type: 'success', message: '💛 Tu as reçu un merci !' })
        }
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMemberId])
}

/** Compteurs de mercis reçus par membre (semaine courante + total). */
export function thanksReceived(thanks: ChoreThanks[], memberId: string): { week: number; total: number } {
  const weekStart = weekStartOf(new Date())
  const weekStartIso = new Date(weekStart + 'T00:00').toISOString()
  let week = 0, total = 0
  for (const t of thanks) {
    if (t.to_member !== memberId) continue
    total++
    if (t.created_at >= weekStartIso) week++
  }
  return { week, total }
}

export function thanksSentCount(thanks: ChoreThanks[], memberId: string): number {
  return thanks.filter(t => t.from_member === memberId).length
}

// ── Tâches détestées ──────────────────────────────────────────────────────────

export function useDislikes() {
  return useQuery({
    queryKey: DISLIKES_KEY,
    queryFn: async (): Promise<ChoreDislike[]> => {
      const { data, error } = await supabase
        .from('chore_dislikes')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as unknown as ChoreDislike[]
    },
  })
}

/** Marque/démarque une tâche comme détestée par le membre courant. */
export function useToggleDislike() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async ({ choreId, memberId, disliked }: { choreId: string; memberId: string; disliked: boolean }) => {
      if (disliked) {
        const { error } = await supabase
          .from('chore_dislikes')
          .delete()
          .eq('chore_id', choreId)
          .eq('member_id', memberId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('chore_dislikes').insert({
          household_id: HOUSEHOLD_ID, chore_id: choreId, member_id: memberId,
        } as never)
        if (error && error.code !== '23505') throw error
      }
    },
    onMutate: async ({ choreId, memberId, disliked }) => {
      await queryClient.cancelQueries({ queryKey: DISLIKES_KEY })
      const previous = queryClient.getQueryData<ChoreDislike[]>(DISLIKES_KEY) ?? []
      const next = disliked
        ? previous.filter(d => !(d.chore_id === choreId && d.member_id === memberId))
        : [...previous, {
            id: `opt-${choreId}-${memberId}`, household_id: HOUSEHOLD_ID,
            chore_id: choreId, member_id: memberId, created_at: new Date().toISOString(),
          }]
      queryClient.setQueryData<ChoreDislike[]>(DISLIKES_KEY, next)
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(DISLIKES_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Action impossible.' })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: DISLIKES_KEY }),
  })
}

// ── Recalibrage de pénibilité ─────────────────────────────────────────────────

export function useFeedback() {
  return useQuery({
    queryKey: FEEDBACK_KEY,
    queryFn: async (): Promise<ChoreFeedback[]> => {
      const { data, error } = await supabase
        .from('chore_feedback')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as ChoreFeedback[]
    },
  })
}

export function useAddFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ choreId, logId, memberId, verdict }: { choreId: string; logId: string; memberId: string; verdict: FeedbackVerdict }) => {
      const { error } = await supabase.from('chore_feedback').insert({
        household_id: HOUSEHOLD_ID, chore_id: choreId, log_id: logId, member_id: memberId, verdict,
      } as never)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY }),
    // Optionnel et silencieux : un échec ne doit pas gêner le pointage.
  })
}

/**
 * Tendance nette sur les 5 dernières réponses d'une tâche : ≥3 « plus pénible »
 * → suggérer d'augmenter les points ; ≥3 « plus facile » → suggérer de baisser.
 * La décision reste humaine (simple suggestion affichée au catalogue).
 */
export function feedbackTendency(feedbacks: ChoreFeedback[], choreId: string): 'harder' | 'easier' | null {
  const last5 = feedbacks.filter(f => f.chore_id === choreId).slice(0, 5)
  if (last5.length < 3) return null
  const harder = last5.filter(f => f.verdict === 'harder').length
  const easier = last5.filter(f => f.verdict === 'easier').length
  if (harder >= 3) return 'harder'
  if (easier >= 3) return 'easier'
  return null
}

// Réexport utilitaire pour les vues (évite un import croisé de date-fns).
export function lastCompletedWeekStart(): string {
  return format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), -7), 'yyyy-MM-dd')
}
