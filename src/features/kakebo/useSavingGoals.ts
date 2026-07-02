import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useToast } from '../../components/useToast'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SavingGoal {
  id: string
  household_id: string
  name: string
  emoji: string
  target_amount: number
  archived_at: string | null
  created_at: string
}

export const SAVING_GOALS_KEY = ['kakebo-saving-goals', HOUSEHOLD_ID] as const
export const SAVING_GOAL_TOTALS_KEY = ['kakebo-saving-goal-totals', HOUSEHOLD_ID] as const

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useSavingGoals() {
  return useQuery({
    queryKey: SAVING_GOALS_KEY,
    queryFn: async (): Promise<SavingGoal[]> => {
      const { data, error } = await supabase
        .from('kakebo_saving_goals')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .is('archived_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data as unknown as SavingGoal[]).map(g => ({ ...g, target_amount: Number(g.target_amount) }))
    },
  })
}

/** Montant cumulé par projet (toutes les opérations rattachées, tous mois). */
export function useSavingGoalTotals() {
  return useQuery({
    queryKey: SAVING_GOAL_TOTALS_KEY,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('kakebo_entries')
        .select('saving_goal_id, amount')
        .eq('household_id', HOUSEHOLD_ID)
        .not('saving_goal_id', 'is', null)
      if (error) throw error
      const totals: Record<string, number> = {}
      for (const row of data as { saving_goal_id: string | null; amount: number }[]) {
        if (!row.saving_goal_id) continue
        totals[row.saving_goal_id] = (totals[row.saving_goal_id] ?? 0) + Number(row.amount)
      }
      return totals
    },
  })
}

export function useUpsertSavingGoal() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; emoji: string; target_amount: number }) => {
      const fields = { name: input.name.trim(), emoji: input.emoji, target_amount: input.target_amount }
      if (input.id) {
        const { error } = await supabase.from('kakebo_saving_goals').update(fields as never).eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('kakebo_saving_goals')
          .insert({ ...fields, household_id: HOUSEHOLD_ID } as never)
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAVING_GOALS_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible d\'enregistrer le projet.' }),
  })
}

/** Archive un projet (les opérations rattachées et leur historique sont conservés). */
export function useArchiveSavingGoal() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('kakebo_saving_goals')
        .update({ archived_at: new Date().toISOString() } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SAVING_GOALS_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible d\'archiver le projet.' }),
  })
}
