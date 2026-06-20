import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, startOfWeek, startOfMonth } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useToast } from '../../components/useToast'

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

export const POINTS_KEY       = ['point-events', HOUSEHOLD_ID] as const
export const ACHIEVEMENTS_KEY = ['member-achievements', HOUSEHOLD_ID] as const
export const GOALS_KEY        = ['family-goals', HOUSEHOLD_ID] as const

// ── Helpers (purs) ────────────────────────────────────────────────────────────

/** XP à vie par membre (somme du ledger). */
export function totalsByMember(events: PointEvent[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of events) m.set(e.member_id, (m.get(e.member_id) ?? 0) + e.points)
  return m
}

/** Date de début (yyyy-MM-dd) de la période d'un objectif. */
export function periodStart(goal: Pick<FamilyGoal, 'period' | 'period_start'>): string {
  const now = new Date()
  if (goal.period === 'week')  return format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  if (goal.period === 'month') return format(startOfMonth(now), 'yyyy-MM-dd')
  return goal.period_start
}

/** Points du foyer cumulés depuis une date (yyyy-MM-dd). */
export function pointsSince(events: PointEvent[], startDate: string): number {
  return events
    .filter(e => e.created_at.slice(0, 10) >= startDate)
    .reduce((sum, e) => sum + e.points, 0)
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function usePointEvents() {
  return useQuery({
    queryKey: POINTS_KEY,
    queryFn: async (): Promise<PointEvent[]> => {
      const { data, error } = await supabase
        .from('point_events')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as PointEvent[]
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
