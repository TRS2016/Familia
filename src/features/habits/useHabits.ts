import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useToast } from '../../components/Toast'
import type { Tables } from '../../lib/database.types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Habit {
  id: string
  household_id: string
  member_id: string | null
  name: string
  emoji: string
  color: string | null
  frequency: string
  created_at: string
  member: { id: string; display_name: string } | null
}

export type HabitCompletion = Tables<'habit_completions'>

export interface NewHabitInput {
  name: string
  emoji: string
  member_id: string | null
  color: string | null
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const HABITS_KEY = ['habits', HOUSEHOLD_ID] as const

export function completionsKey(suffix: string) {
  return ['habit-completions', HOUSEHOLD_ID, suffix] as const
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useHabits() {
  return useQuery({
    queryKey: HABITS_KEY,
    queryFn: async (): Promise<Habit[]> => {
      const { data, error } = await supabase
        .from('habits')
        .select('*, member:members(id, display_name)')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as Habit[]
    },
  })
}

/** Last 60 days of completions — used for streak + week grid */
export function useRecentCompletions(habitIds: string[]) {
  const from = format(subDays(new Date(), 60), 'yyyy-MM-dd')
  const to   = format(new Date(), 'yyyy-MM-dd')
  const key  = completionsKey('recent')

  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<HabitCompletion[]> => {
      if (habitIds.length === 0) return []
      const { data, error } = await supabase
        .from('habit_completions')
        .select('*')
        .in('habit_id', habitIds)
        .gte('date', from)
        .lte('date', to)
        .eq('completed', true)
      if (error) throw error
      return data
    },
    enabled: habitIds.length > 0,
  })
}

/** All completions for one habit in a given year — for heatmap in stats modal */
export function useYearCompletions(habitId: string | null, year: number) {
  return useQuery({
    queryKey: ['habit-completions', habitId, 'year', year],
    queryFn: async (): Promise<HabitCompletion[]> => {
      const { data, error } = await supabase
        .from('habit_completions')
        .select('*')
        .eq('habit_id', habitId!)
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`)
        .eq('completed', true)
      if (error) throw error
      return data
    },
    enabled: !!habitId,
  })
}

// ── Streak helper ─────────────────────────────────────────────────────────────

export function calcStreak(habitId: string, completions: HabitCompletion[]): number {
  const doneSet = new Set(
    completions.filter(c => c.habit_id === habitId).map(c => c.date)
  )
  let streak = 0
  let d = new Date()
  // If today isn't done yet, start checking from yesterday
  if (!doneSet.has(format(d, 'yyyy-MM-dd'))) d = subDays(d, 1)
  for (let i = 0; i < 60; i++) {
    if (doneSet.has(format(d, 'yyyy-MM-dd'))) {
      streak++
      d = subDays(d, 1)
    } else {
      break
    }
  }
  return streak
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useAddHabit() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: NewHabitInput): Promise<Habit> => {
      const { data, error } = await supabase
        .from('habits')
        .insert({
          household_id: HOUSEHOLD_ID,
          member_id: input.member_id,
          name: input.name.trim(),
          emoji: input.emoji,
          color: input.color,
        })
        .select('*, member:members(id, display_name)')
        .single()
      if (error) throw error
      return data as unknown as Habit
    },
    onSuccess: newHabit => {
      queryClient.setQueryData<Habit[]>(HABITS_KEY, old => [...(old ?? []), newHabit])
    },
    onError: () => showToast({ type: 'error', message: 'Impossible de créer l\'habitude.' }),
  })
}

export function useDeleteHabit() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('habits').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: HABITS_KEY })
      const previous = queryClient.getQueryData<Habit[]>(HABITS_KEY) ?? []
      queryClient.setQueryData<Habit[]>(HABITS_KEY, previous.filter(h => h.id !== id))
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(HABITS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de supprimer l\'habitude.' })
    },
  })
}

export interface EditHabitInput {
  id: string
  name: string
  emoji: string
  member_id: string | null
}

export function useEditHabit() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: EditHabitInput): Promise<Habit> => {
      const { data, error } = await supabase
        .from('habits')
        .update({ name: input.name.trim(), emoji: input.emoji, member_id: input.member_id })
        .eq('id', input.id)
        .select('*, member:members(id, display_name)')
        .single()
      if (error) throw error
      return data as unknown as Habit
    },
    onSuccess: updated => {
      queryClient.setQueryData<Habit[]>(HABITS_KEY, old =>
        (old ?? []).map(h => h.id === updated.id ? updated : h)
      )
    },
    onError: () => showToast({ type: 'error', message: 'Impossible de modifier l\'habitude.' }),
  })
}

export function useToggleCompletion() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const key = completionsKey('recent')

  return useMutation({
    mutationFn: async ({ habitId, date, done }: { habitId: string; date: string; done: boolean }) => {
      if (done) {
        const { error } = await supabase
          .from('habit_completions')
          .upsert({ habit_id: habitId, date, completed: true }, { onConflict: 'habit_id,date' })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('habit_completions')
          .delete()
          .eq('habit_id', habitId)
          .eq('date', date)
        if (error) throw error
      }
    },
    onMutate: async ({ habitId, date, done }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<HabitCompletion[]>(key) ?? []
      queryClient.setQueryData<HabitCompletion[]>(key, done
        ? [...previous.filter(c => !(c.habit_id === habitId && c.date === date)),
           { id: `opt-${habitId}-${date}`, habit_id: habitId, date, completed: true, created_at: new Date().toISOString() }]
        : previous.filter(c => !(c.habit_id === habitId && c.date === date))
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(key, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de mettre à jour l\'habitude.' })
    },
  })
}
