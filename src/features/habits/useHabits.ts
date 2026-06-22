import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useToast } from '../../components/useToast'
import { useMember } from '../../auth/useMember'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Habit {
  id: string
  household_id: string
  member_id: string | null
  name: string
  emoji: string
  color: string | null
  kind: 'do' | 'avoid'             // 'do' = à faire, 'avoid' = à éviter (cocher = tenu)
  target_count: number             // objectif quotidien (1 = simple oui/non)
  frequency: string
  frequency_days: number[] | null  // 1=lun…7=dim — remplace frequency si défini
  start_date: string | null        // date ISO yyyy-MM-dd, null = pas de restriction
  archived_at: string | null
  reminder_time: string | null     // HH:MM heure Paris
  position: number | null          // ordre d'affichage personnalisé
  created_at: string
  member: { id: string; display_name: string } | null
}

export interface HabitCompletion {
  id: string
  habit_id: string
  date: string
  completed: boolean
  count: number
  created_at: string
  note: string | null
}

export interface NewHabitInput {
  name: string
  emoji: string
  member_id: string | null
  color: string | null
  kind?: 'do' | 'avoid'
  target_count?: number
  frequency?: string
  frequency_days?: number[] | null
  start_date?: string | null
  reminder_time?: string | null
}

export interface EditHabitInput {
  id: string
  name: string
  emoji: string
  member_id: string | null
  kind?: 'do' | 'avoid'
  target_count?: number
  frequency?: string
  frequency_days?: number[] | null
  start_date?: string | null
  reminder_time?: string | null
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
        .is('archived_at', null)
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as Habit[]
    },
  })
}

export function useReorderHabits() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    // orderedIds = liste complète des habitudes dans le nouvel ordre
    mutationFn: async (orderedIds: string[]) => {
      const { error } = await supabase.rpc('reorder_habits', { p_ids: orderedIds })
      if (error) throw error
    },
    onMutate: async (orderedIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: HABITS_KEY })
      const previous = queryClient.getQueryData<Habit[]>(HABITS_KEY) ?? []
      const byId = new Map(previous.map(h => [h.id, h]))
      const reordered: Habit[] = []
      orderedIds.forEach((id, i) => {
        const h = byId.get(id)
        if (h) reordered.push({ ...h, position: i + 1 })
      })
      queryClient.setQueryData<Habit[]>(HABITS_KEY, reordered)
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(HABITS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de réordonner les habitudes.' })
    },
  })
}

export function useArchivedHabits() {
  return useQuery({
    queryKey: ['habits-archived', HOUSEHOLD_ID],
    queryFn: async (): Promise<Habit[]> => {
      const { data, error } = await supabase
        .from('habits')
        .select('*, member:members(id, display_name)')
        .eq('household_id', HOUSEHOLD_ID)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
      if (error) throw error
      return data as unknown as Habit[]
    },
  })
}

/** Last 120 days of completions — used for streak + week grid */
export function useRecentCompletions(habitIds: string[]) {
  const from = format(subDays(new Date(), 120), 'yyyy-MM-dd')
  const to   = format(new Date(), 'yyyy-MM-dd')
  const key  = completionsKey('recent')

  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<HabitCompletion[]> => {
      const validIds = habitIds.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
      if (validIds.length === 0) return []
      // On récupère aussi les lignes partielles (compteur non terminé) pour afficher
      // la progression du jour ; le filtre completed se fait côté client.
      const { data, error } = await supabase
        .from('habit_completions')
        .select('*')
        .in('habit_id', validIds)
        .gte('date', from)
        .lte('date', to)
      if (error) throw error
      return data as HabitCompletion[]
    },
    enabled: habitIds.length > 0,
  })
}

/** Toutes les complétions d'une habitude sur une année — heatmap des stats.
 *  Inclut les lignes partielles (completed=false) pour l'intensité des cases ;
 *  les calculs de stats filtrent `completed` côté consommateur. */
export function useYearCompletions(habitId: string | null, year: number) {
  return useQuery({
    queryKey: ['habit-completions', HOUSEHOLD_ID, habitId, 'year', year],
    queryFn: async (): Promise<HabitCompletion[]> => {
      const { data, error } = await supabase
        .from('habit_completions')
        .select('*')
        .eq('habit_id', habitId!)
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`)
      if (error) throw error
      return data as HabitCompletion[]
    },
    enabled: !!habitId,
  })
}

// Les calculs de série (calcStreak, calcBestStreak) vivent dans habits.utils.ts
// — ils tiennent compte des jours prévus (frequency_days) et de start_date.

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useAddHabit() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
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
          kind: input.kind ?? 'do',
          target_count: input.target_count ?? 1,
          frequency: input.frequency ?? 'daily',
          frequency_days: input.frequency_days ?? null,
          start_date: input.start_date ?? null,
          reminder_time: input.reminder_time ?? null,
        } as never)
        .select('*, member:members(id, display_name)')
        .single()
      if (error) throw error
      return data as unknown as Habit
    },
    onMutate: async (input: NewHabitInput) => {
      await queryClient.cancelQueries({ queryKey: HABITS_KEY })
      const previous = queryClient.getQueryData<Habit[]>(HABITS_KEY) ?? []
      const optimistic: Habit = {
        id: `optimistic-${Date.now()}`,
        household_id: HOUSEHOLD_ID,
        member_id: input.member_id,
        name: input.name.trim(),
        emoji: input.emoji,
        color: input.color,
        kind: input.kind ?? 'do',
        target_count: input.target_count ?? 1,
        frequency: input.frequency ?? 'daily',
        frequency_days: input.frequency_days ?? null,
        start_date: input.start_date ?? null,
        archived_at: null,
        reminder_time: input.reminder_time ?? null,
        position: null,
        created_at: new Date().toISOString(),
        member: (member && input.member_id === member.id)
          ? { id: member.id, display_name: member.display_name }
          : null,
      }
      queryClient.setQueryData<Habit[]>(HABITS_KEY, [...previous, optimistic])
      return { previous, optimisticId: optimistic.id }
    },
    onSuccess: (newHabit, _input, context) => {
      queryClient.setQueryData<Habit[]>(HABITS_KEY, old =>
        (old ?? []).map(h => h.id === context?.optimisticId ? newHabit : h)
      )
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(HABITS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de créer l\'habitude.' })
    },
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

export function useEditHabit() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: EditHabitInput): Promise<Habit> => {
      const { data, error } = await supabase
        .from('habits')
        .update({
          name: input.name.trim(),
          emoji: input.emoji,
          member_id: input.member_id,
          kind: input.kind,
          target_count: input.target_count,
          frequency: input.frequency,
          frequency_days: input.frequency_days,
          start_date: input.start_date,
          reminder_time: input.reminder_time,
        } as never)
        .eq('id', input.id)
        .select('*, member:members(id, display_name)')
        .single()
      if (error) throw error
      return data as unknown as Habit
    },
    onMutate: async (input: EditHabitInput) => {
      await queryClient.cancelQueries({ queryKey: HABITS_KEY })
      const previous = queryClient.getQueryData<Habit[]>(HABITS_KEY) ?? []
      queryClient.setQueryData<Habit[]>(HABITS_KEY, old =>
        (old ?? []).map(h => h.id !== input.id ? h : {
          ...h,
          name: input.name.trim(),
          emoji: input.emoji,
          member_id: input.member_id,
          kind: input.kind ?? h.kind,
          target_count: input.target_count ?? h.target_count,
          frequency: input.frequency ?? h.frequency,
          frequency_days: input.frequency_days !== undefined ? input.frequency_days : h.frequency_days,
          start_date: input.start_date !== undefined ? input.start_date : h.start_date,
          reminder_time: input.reminder_time !== undefined ? input.reminder_time : h.reminder_time,
          member: h.member_id === input.member_id ? h.member : null,
        })
      )
      return { previous }
    },
    onSuccess: updated => {
      queryClient.setQueryData<Habit[]>(HABITS_KEY, old =>
        (old ?? []).map(h => h.id === updated.id ? updated : h)
      )
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(HABITS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de modifier l\'habitude.' })
    },
  })
}

export function useArchiveHabit() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('habits')
        .update({ archived_at: new Date().toISOString() } as never)
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: HABITS_KEY })
      const previous = queryClient.getQueryData<Habit[]>(HABITS_KEY) ?? []
      queryClient.setQueryData<Habit[]>(HABITS_KEY, previous.filter(h => h.id !== id))
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits-archived', HOUSEHOLD_ID] })
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(HABITS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible d\'archiver l\'habitude.' })
    },
  })
}

export function useUnarchiveHabit() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('habits')
        .update({ archived_at: null } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY })
      queryClient.invalidateQueries({ queryKey: ['habits-archived', HOUSEHOLD_ID] })
      // La query « recent » n'est pas clé sur la liste d'ids : sans ça,
      // l'historique (série, semaine) d'une habitude restaurée reste vide.
      queryClient.invalidateQueries({ queryKey: ['habit-completions'] })
    },
    onError: () => {
      showToast({ type: 'error', message: 'Impossible de désarchiver l\'habitude.' })
    },
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
           { id: `opt-${habitId}-${date}`, habit_id: habitId, date, completed: true, count: 1, created_at: new Date().toISOString(), note: null }]
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

/** Définit la progression du jour pour une habitude quantifiable (compteur). */
export function useSetCount() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const key = completionsKey('recent')

  return useMutation({
    mutationFn: async ({ habitId, date, count, target }: { habitId: string; date: string; count: number; target: number }) => {
      if (count <= 0) {
        const { error } = await supabase.from('habit_completions').delete().eq('habit_id', habitId).eq('date', date)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('habit_completions')
          .upsert({ habit_id: habitId, date, count, completed: count >= target } as never, { onConflict: 'habit_id,date' })
        if (error) throw error
      }
    },
    onMutate: async ({ habitId, date, count, target }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<HabitCompletion[]>(key) ?? []
      const others = previous.filter(c => !(c.habit_id === habitId && c.date === date))
      const next = count <= 0
        ? others
        : [...others, {
            id: `opt-${habitId}-${date}`, habit_id: habitId, date,
            completed: count >= target, count, created_at: new Date().toISOString(),
            note: previous.find(c => c.habit_id === habitId && c.date === date)?.note ?? null,
          }]
      queryClient.setQueryData<HabitCompletion[]>(key, next)
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(key, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de mettre à jour l\'habitude.' })
    },
  })
}

export function useUpdateCompletionNote() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const key = completionsKey('recent')

  return useMutation({
    mutationFn: async ({ habitId, date, note }: { habitId: string; date: string; note: string | null }) => {
      // Met à jour la note sans toucher au compteur d'une habitude quantifiable.
      const { data: existing, error: selErr } = await supabase
        .from('habit_completions').select('id').eq('habit_id', habitId).eq('date', date).maybeSingle()
      if (selErr) throw selErr
      if (existing) {
        const { error } = await supabase.from('habit_completions').update({ note: note || null } as never).eq('id', existing.id)
        if (error) throw error
      } else {
        // Pas de complétion ce jour : la note ne doit PAS marquer l'habitude
        // comme faite (« pas eu le temps » cochait le jour).
        const { error } = await supabase.from('habit_completions').insert({ habit_id: habitId, date, completed: false, count: 0, note: note || null } as never)
        if (error) throw error
      }
    },
    onMutate: async ({ habitId, date, note }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<HabitCompletion[]>(key) ?? []
      queryClient.setQueryData<HabitCompletion[]>(key,
        previous.map(c => c.habit_id === habitId && c.date === date ? { ...c, note: note || null } : c)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(key, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de sauvegarder la note.' })
    },
  })
}
