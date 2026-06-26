import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useToast } from '../../components/useToast'
import { POINTS_KEY, COUNTS_KEY } from './useGamification'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Chore {
  id: string
  household_id: string
  name: string
  emoji: string
  color: string | null
  category: string
  points: number
  frequency: string                  // daily | weekly | none
  frequency_days: number[] | null    // 1=lun…7=dim
  start_date: string | null
  rotation_member_ids: string[] | null
  rotation_period: string            // 'week' | 'day'
  default_member_id: string | null
  position: number | null
  archived_at: string | null
  created_at: string
  instructions: string | null
  steps: string[]
  recipe_id: string | null
}

export interface ChoreAssignment {
  id: string
  household_id: string
  chore_id: string
  member_id: string | null
  date: string
  status: 'pending' | 'done' | 'skipped'
  created_at: string
  steps_done: number[]
}

export interface ChoreLog {
  id: string
  household_id: string
  chore_id: string | null
  assignment_id: string | null
  member_id: string
  done_on: string
  label: string | null
  points_awarded: number
  note: string | null
  created_at: string
}

export interface HouseholdMember {
  id: string
  display_name: string
}

export interface NewChoreInput {
  name: string
  emoji: string
  color: string | null
  category: string
  points: number
  frequency: string
  frequency_days: number[] | null
  start_date: string | null
  rotation_member_ids: string[] | null
  rotation_period: string
  default_member_id: string | null
  instructions: string | null
  steps: string[]
  recipe_id: string | null
}

export interface EditChoreInput extends NewChoreInput { id: string }

// ── Query keys ────────────────────────────────────────────────────────────────

export const CHORES_KEY      = ['chores', HOUSEHOLD_ID] as const
export const ASSIGNMENTS_KEY = ['chore-assignments', HOUSEHOLD_ID] as const
export const LOGS_KEY        = ['chore-logs', HOUSEHOLD_ID] as const
export const MEMBERS_KEY     = ['chore-members', HOUSEHOLD_ID] as const

// ── Queries ───────────────────────────────────────────────────────────────────

export function useHouseholdMembers() {
  return useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: async (): Promise<HouseholdMember[]> => {
      const { data, error } = await supabase
        .from('members')
        .select('id, display_name')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as HouseholdMember[]
    },
  })
}

export function useChores() {
  return useQuery({
    queryKey: CHORES_KEY,
    queryFn: async (): Promise<Chore[]> => {
      const { data, error } = await supabase
        .from('chores')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .is('archived_at', null)
        .order('position', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as Chore[]
    },
  })
}

/** Assignations sur une fenêtre [from, to] (yyyy-MM-dd). */
export function useChoreAssignments(from: string, to: string) {
  return useQuery({
    queryKey: [...ASSIGNMENTS_KEY, from, to],
    queryFn: async (): Promise<ChoreAssignment[]> => {
      const { data, error } = await supabase
        .from('chore_assignments')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .gte('date', from)
        .lte('date', to)
      if (error) throw error
      return data as unknown as ChoreAssignment[]
    },
  })
}

/** Logs récents (120 derniers jours) — historique + séries + base de stats. */
export function useRecentChoreLogs() {
  const from = format(subDays(new Date(), 120), 'yyyy-MM-dd')
  return useQuery({
    queryKey: [...LOGS_KEY, 'recent'],
    queryFn: async (): Promise<ChoreLog[]> => {
      const { data, error } = await supabase
        .from('chore_logs')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .gte('done_on', from)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as ChoreLog[]
    },
  })
}

// ── Mutations : templates ────────────────────────────────────────────────────

export function useAddChore() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (input: NewChoreInput): Promise<Chore> => {
      const { data, error } = await supabase
        .from('chores')
        .insert({ household_id: HOUSEHOLD_ID, ...normalize(input) } as never)
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as Chore
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Chore[]>(CHORES_KEY, old => [...(old ?? []), created])
    },
    onError: () => showToast({ type: 'error', message: 'Impossible de créer la tâche.' }),
  })
}

export function useEditChore() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (input: EditChoreInput): Promise<Chore> => {
      const { data, error } = await supabase
        .from('chores')
        .update(normalize(input) as never)
        .eq('id', input.id)
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as Chore
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Chore[]>(CHORES_KEY, old =>
        (old ?? []).map(c => c.id === updated.id ? updated : c))
      // La rotation/fréquence a pu changer : on re-matérialisera à la prochaine vue.
      queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY })
    },
    onError: () => showToast({ type: 'error', message: 'Impossible de modifier la tâche.' }),
  })
}

/** Suppression définitive d'une tâche du catalogue. Les assignations liées sont
 *  supprimées en cascade (FK), mais les logs/points déjà gagnés sont conservés
 *  (chore_logs.chore_id passe à NULL via ON DELETE SET NULL). */
export function useDeleteChore() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('chores').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: CHORES_KEY })
      const previous = queryClient.getQueryData<Chore[]>(CHORES_KEY) ?? []
      queryClient.setQueryData<Chore[]>(CHORES_KEY, previous.filter(c => c.id !== id))
      return { previous }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY })
      queryClient.invalidateQueries({ queryKey: LOGS_KEY })
    },
    onError: (_e, _id, ctx) => {
      queryClient.setQueryData(CHORES_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de supprimer la tâche.' })
    },
  })
}

export function useArchiveChore() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('chores')
        .update({ archived_at: new Date().toISOString() } as never)
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: CHORES_KEY })
      const previous = queryClient.getQueryData<Chore[]>(CHORES_KEY) ?? []
      queryClient.setQueryData<Chore[]>(CHORES_KEY, previous.filter(c => c.id !== id))
      return { previous }
    },
    onError: (_e, _id, ctx) => {
      queryClient.setQueryData(CHORES_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible d\'archiver la tâche.' })
    },
  })
}

function normalize(input: NewChoreInput) {
  return {
    name: input.name.trim(),
    emoji: input.emoji,
    color: input.color,
    category: input.category,
    points: input.points,
    frequency: input.frequency,
    frequency_days: input.frequency === 'weekly' ? input.frequency_days : null,
    start_date: input.start_date,
    rotation_member_ids: (input.rotation_member_ids && input.rotation_member_ids.length > 0)
      ? input.rotation_member_ids : null,
    rotation_period: input.rotation_period,
    default_member_id: input.default_member_id,
    instructions: input.instructions?.trim() || null,
    steps: input.steps.map(s => s.trim()).filter(Boolean),
    recipe_id: input.recipe_id ?? null,
  }
}

/** Coche/décoche une étape pour une assignation (progression partagée). */
export function useToggleStep() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async ({ assignmentId, stepsDone }: { assignmentId: string; stepsDone: number[] }) => {
      const { error } = await supabase
        .from('chore_assignments')
        .update({ steps_done: stepsDone } as never)
        .eq('id', assignmentId)
      if (error) throw error
    },
    onMutate: async ({ assignmentId, stepsDone }) => {
      await queryClient.cancelQueries({ queryKey: ASSIGNMENTS_KEY })
      const snapshots = queryClient.getQueriesData<ChoreAssignment[]>({ queryKey: ASSIGNMENTS_KEY })
      for (const [key, data] of snapshots) {
        if (!data) continue
        queryClient.setQueryData<ChoreAssignment[]>(key,
          data.map(a => a.id === assignmentId ? { ...a, steps_done: stepsDone } : a))
      }
      return { snapshots }
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      showToast({ type: 'error', message: 'Impossible de mettre à jour l\'étape.' })
    },
  })
}

// ── Mutations : matérialisation des assignations (rotation) ────────────────────

/** Upsert idempotent (UNIQUE(chore_id,date)) des assignations manquantes. */
export function useMaterializeAssignments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rows: { chore_id: string; member_id: string | null; date: string }[]) => {
      if (rows.length === 0) return
      const { error } = await supabase
        .from('chore_assignments')
        .upsert(
          rows.map(r => ({ household_id: HOUSEHOLD_ID, ...r })) as never,
          { onConflict: 'chore_id,date', ignoreDuplicates: true },
        )
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY }),
  })
}

// ── Mutations : pointage (RPC atomique) ───────────────────────────────────────

export interface LogChoreInput {
  chore_id: string | null
  assignment_id: string | null
  member_id: string
  done_on: string
  label?: string | null
  note?: string | null
  points?: number | null   // pour les tâches ad-hoc libres (sinon dérivé du chore)
}

const RECENT_LOGS_KEY = [...LOGS_KEY, 'recent'] as const

export function useLogChore() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (input: LogChoreInput) => {
      const { data, error } = await supabase.rpc('log_chore', {
        // Les args uuid/text de la fonction sont nullables côté Postgres mais
        // générés comme `string` non-null par supabase gen types → cast ciblé.
        p_chore_id: input.chore_id,
        p_assignment_id: input.assignment_id,
        p_member_id: input.member_id,
        p_done_on: input.done_on,
        p_label: input.label ?? null,
        p_note: input.note ?? null,
        p_points: input.points ?? null,
      } as never)
      if (error) throw error
      return data as string
    },
    // U1 : optimistic — la ligne pointée bascule en « fait » immédiatement via
    // un log temporaire dans le cache des logs récents.
    onMutate: async (input: LogChoreInput) => {
      if (!input.assignment_id) return { previous: undefined }
      await queryClient.cancelQueries({ queryKey: RECENT_LOGS_KEY })
      const previous = queryClient.getQueryData<ChoreLog[]>(RECENT_LOGS_KEY) ?? []
      const optimistic: ChoreLog = {
        id: `opt-${input.assignment_id}`, household_id: HOUSEHOLD_ID,
        chore_id: input.chore_id, assignment_id: input.assignment_id, member_id: input.member_id,
        done_on: input.done_on, label: input.label ?? null, points_awarded: 0,
        note: input.note ?? null, created_at: new Date().toISOString(),
      }
      queryClient.setQueryData<ChoreLog[]>(RECENT_LOGS_KEY, [optimistic, ...previous])
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(RECENT_LOGS_KEY, ctx.previous)
      showToast({ type: 'error', message: 'Impossible d\'enregistrer la tâche.' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY })
      queryClient.invalidateQueries({ queryKey: LOGS_KEY })
      queryClient.invalidateQueries({ queryKey: POINTS_KEY })
      queryClient.invalidateQueries({ queryKey: COUNTS_KEY })
    },
  })
}

export function useUndoChoreLog() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (logId: string) => {
      const { error } = await supabase.rpc('undo_chore_log', { p_log_id: logId })
      if (error) throw error
    },
    onMutate: async (logId: string) => {
      await queryClient.cancelQueries({ queryKey: RECENT_LOGS_KEY })
      const previous = queryClient.getQueryData<ChoreLog[]>(RECENT_LOGS_KEY) ?? []
      queryClient.setQueryData<ChoreLog[]>(RECENT_LOGS_KEY, previous.filter(l => l.id !== logId))
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(RECENT_LOGS_KEY, ctx.previous)
      showToast({ type: 'error', message: 'Impossible d\'annuler.' })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY })
      queryClient.invalidateQueries({ queryKey: LOGS_KEY })
      queryClient.invalidateQueries({ queryKey: POINTS_KEY })
      queryClient.invalidateQueries({ queryKey: COUNTS_KEY })
    },
  })
}
