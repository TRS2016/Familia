import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, startOfWeek, startOfMonth, subDays } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useToast } from '../../components/useToast'
import { memberStreakDays } from './chores.utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PointEvent {
  id: string
  household_id: string
  member_id: string
  points: number
  reason: string
  ref_type: string | null
  ref_id: string | null
  created_at: string
}

export interface MemberAchievement {
  id: string
  household_id: string
  member_id: string
  achievement_key: string
  unlocked_at: string
}

export interface FamilyGoal {
  id: string
  household_id: string
  label: string
  target_points: number
  reward_text: string | null
  period: 'week' | 'month' | 'open'
  period_start: string
  active: boolean
  created_at: string
}

export interface FamilyGoalInput {
  label: string
  target_points: number
  reward_text: string | null
  period: 'week' | 'month' | 'open'
}

// ── Query keys ────────────────────────────────────────────────────────────────

// Préfixe commun à tous les dérivés du ledger (totaux, période) → une seule
// invalidation realtime sur POINTS_KEY rafraîchit tout.
export const POINTS_KEY       = ['point-events', HOUSEHOLD_ID] as const
export const COUNTS_KEY       = ['chore-counts', HOUSEHOLD_ID] as const
export const ACHIEVEMENTS_KEY = ['member-achievements', HOUSEHOLD_ID] as const
export const GOALS_KEY        = ['family-goals', HOUSEHOLD_ID] as const

export interface MemberCount { member_id: string; category: string; cnt: number }

// ── Helpers (purs) ────────────────────────────────────────────────────────────

/** Date de début (yyyy-MM-dd) de la période d'un objectif (semaine/mois/ouvert). */
export function periodStart(goal: Pick<FamilyGoal, 'period' | 'period_start'>): string {
  const now = new Date()
  if (goal.period === 'week')  return format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  if (goal.period === 'month') return format(startOfMonth(now), 'yyyy-MM-dd')
  return goal.period_start
}

// ── Queries (agrégats serveur — pas de chargement de tout l'historique) ────────

// On renvoie des objets simples (Record) plutôt que des Map : le cache TanStack
// Query (structural sharing + persistance PWA) ne préserve pas les Map → au
// rechargement la donnée redeviendrait un objet et `.get` planterait.
export type PointMap = Record<string, number>

function rowsToRecord(rows: { member_id: string; total: number }[] | null): PointMap {
  const out: PointMap = {}
  for (const r of rows ?? []) out[r.member_id] = Number(r.total)
  return out
}

export const memberPoints = (m: PointMap, id: string): number => m[id] ?? 0
export const sumPoints = (m: PointMap): number => Object.values(m).reduce((a, b) => a + b, 0)

/** XP à vie par membre (Record member_id → total). */
export function useMemberTotals() {
  return useQuery({
    queryKey: [...POINTS_KEY, 'totals'],
    queryFn: async (): Promise<PointMap> => {
      const { data, error } = await supabase.rpc('member_point_totals')
      if (error) throw error
      return rowsToRecord(data as { member_id: string; total: number }[] | null)
    },
  })
}

/** Points par membre depuis une date (Record member_id → total). */
export function useMemberPointsSince(start: string) {
  return useQuery({
    queryKey: [...POINTS_KEY, 'since', start],
    queryFn: async (): Promise<PointMap> => {
      const { data, error } = await supabase.rpc('member_points_since', { p_start: start })
      if (error) throw error
      return rowsToRecord(data as { member_id: string; total: number }[] | null)
    },
  })
}

/** Compteurs de tâches à vie par membre+catégorie (pour les badges, non fenêtrés). */
export function useChoreCounts() {
  return useQuery({
    queryKey: COUNTS_KEY,
    queryFn: async (): Promise<MemberCount[]> => {
      const { data, error } = await supabase.rpc('chore_counts_by_category')
      if (error) throw error
      return ((data ?? []) as { member_id: string; category: string; cnt: number }[])
        .map(r => ({ member_id: r.member_id, category: r.category, cnt: Number(r.cnt) }))
    },
  })
}

export function useMemberAchievements() {
  return useQuery({
    queryKey: ACHIEVEMENTS_KEY,
    queryFn: async (): Promise<MemberAchievement[]> => {
      const { data, error } = await supabase
        .from('member_achievements')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as unknown as MemberAchievement[]
    },
  })
}

export function useFamilyGoals() {
  return useQuery({
    queryKey: GOALS_KEY,
    queryFn: async (): Promise<FamilyGoal[]> => {
      const { data, error } = await supabase
        .from('family_goals')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .eq('active', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as FamilyGoal[]
    },
  })
}

// ── Bonus de série automatique ────────────────────────────────────────────────

export const STREAK_BONUS_STEP = 7
export const STREAK_BONUS_POINTS = 10

/**
 * Après un pointage réussi : +10 pts automatiques à chaque palier de 7 jours
 * d'affilée (7, 14, 21…). Dédup : un seul bonus par membre et par jour (deux
 * pointages le même jour donnent la même série). Retourne la série primée,
 * ou null si pas de palier / déjà primé / erreur (silencieuse : le bonus est
 * un plus, il ne doit jamais faire échouer le pointage).
 */
export async function maybeAwardStreakBonus(memberId: string): Promise<number | null> {
  const from = format(subDays(new Date(), 66), 'yyyy-MM-dd')
  const { data: logs, error } = await supabase
    .from('chore_logs')
    .select('member_id, done_on')
    .eq('member_id', memberId)
    .gte('done_on', from)
  if (error || !logs) return null

  const streak = memberStreakDays(logs, memberId)
  if (streak < STREAK_BONUS_STEP || streak % STREAK_BONUS_STEP !== 0) return null

  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const { data: existing } = await supabase
    .from('point_events')
    .select('id')
    .eq('member_id', memberId)
    .eq('ref_type', 'streak_bonus')
    .gte('created_at', dayStart.toISOString())
    .limit(1)
  if (existing && existing.length > 0) return null

  const { error: insErr } = await supabase.from('point_events').insert({
    household_id: HOUSEHOLD_ID,
    member_id: memberId,
    points: STREAK_BONUS_POINTS,
    reason: `Série de ${streak} jours 🔥`,
    ref_type: 'streak_bonus',
    ref_id: null,
  } as never)
  if (insErr) return null
  return streak
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Débloque des badges (idempotent via UNIQUE member_id,achievement_key). */
export function useUnlockAchievements() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rows: { member_id: string; achievement_key: string }[]) => {
      if (rows.length === 0) return
      const { error } = await supabase
        .from('member_achievements')
        .upsert(
          rows.map(r => ({ household_id: HOUSEHOLD_ID, ...r })) as never,
          { onConflict: 'member_id,achievement_key', ignoreDuplicates: true },
        )
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACHIEVEMENTS_KEY }),
  })
}

export function useUpsertFamilyGoal() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (input: FamilyGoalInput & { id?: string }) => {
      if (input.id) {
        const { error } = await supabase
          .from('family_goals')
          .update({ label: input.label.trim(), target_points: input.target_points, reward_text: input.reward_text, period: input.period } as never)
          .eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('family_goals')
          .insert({ household_id: HOUSEHOLD_ID, label: input.label.trim(), target_points: input.target_points, reward_text: input.reward_text, period: input.period } as never)
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GOALS_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible d\'enregistrer l\'objectif.' }),
  })
}

export function useDeleteFamilyGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('family_goals').update({ active: false } as never).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GOALS_KEY }),
  })
}
