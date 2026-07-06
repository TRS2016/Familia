import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useToast } from '../../components/useToast'
import { POINTS_KEY, COUNTS_KEY, STREAK_BONUS_POINTS } from './useGamification'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChoreFrequency = 'daily' | 'weekly' | 'monthly' | 'none'

export interface Chore {
  id: string
  household_id: string
  name: string
  emoji: string
  color: string | null
  category: string
  points: number
  frequency: ChoreFrequency
  frequency_days: number[] | null    // weekly : 1=lun…7=dim ; monthly : [jour du mois]
  start_date: string | null
  rotation_member_ids: string[] | null
  rotation_period: string            // 'week' | 'day'
  default_member_id: string | null
  position: number | null
  created_at: string
  instructions: string | null
  steps: string[]
  recipe_id: string | null
  mental_load: boolean               // tag « charge mentale » (transversal)
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
  photo_path: string | null
  category: string | null   // snapshot de la catégorie au moment du pointage
  mental_load: boolean      // snapshot du tag charge mentale au pointage
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
  frequency: ChoreFrequency
  frequency_days: number[] | null
  start_date: string | null
  rotation_member_ids: string[] | null
  rotation_period: string
  default_member_id: string | null
  instructions: string | null
  steps: string[]
  recipe_id: string | null
  mental_load: boolean
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
      const before = (queryClient.getQueryData<Chore[]>(CHORES_KEY) ?? []).find(c => c.id === input.id)
      const n = normalize(input)
      const { data, error } = await supabase
        .from('chores')
        .update(n as never)
        .eq('id', input.id)
        .select('*')
        .single()
      if (error) throw error
      // Si le planning (récurrence/rotation/assignation) a changé, les
      // assignations futures déjà matérialisées gardent leur ancien
      // membre/calendrier (upsert ignoreDuplicates ne les met pas à jour) :
      // on supprime les jours futurs encore « pending » pour qu'ils soient
      // re-matérialisés. Un simple renommage/changement de points/étapes ne
      // purge rien (la progression steps_done du jour est préservée).
      const rescheduled = !before
        || before.frequency !== n.frequency
        || JSON.stringify(before.frequency_days ?? null) !== JSON.stringify(n.frequency_days)
        || (before.start_date ?? null) !== n.start_date
        || JSON.stringify(before.rotation_member_ids ?? null) !== JSON.stringify(n.rotation_member_ids)
        || before.rotation_period !== n.rotation_period
        || (before.default_member_id ?? null) !== n.default_member_id
      if (rescheduled) {
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        await supabase
          .from('chore_assignments')
          .delete()
          .eq('chore_id', input.id)
          .gte('date', todayStr)
          .eq('status', 'pending')
      }
      return data as unknown as Chore
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Chore[]>(CHORES_KEY, old =>
        (old ?? []).map(c => c.id === updated.id ? updated : c))
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

function normalize(input: NewChoreInput) {
  return {
    name: input.name.trim(),
    emoji: input.emoji,
    color: input.color,
    category: input.category,
    points: input.points,
    frequency: input.frequency,
    frequency_days: (input.frequency === 'weekly' || input.frequency === 'monthly') ? input.frequency_days : null,
    start_date: input.start_date,
    rotation_member_ids: (input.rotation_member_ids && input.rotation_member_ids.length > 0)
      ? input.rotation_member_ids : null,
    rotation_period: input.rotation_period,
    default_member_id: input.default_member_id,
    instructions: input.instructions?.trim() || null,
    steps: input.steps.map(s => s.trim()).filter(Boolean),
    recipe_id: input.recipe_id ?? null,
    mental_load: input.mental_load,
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

/** « Premier arrivé, premier servi » : s'attribue une tâche libre. Le filtre
 *  `member_id IS NULL` fait arbitre en cas de course : si l'autre a déjà pris
 *  la tâche, 0 ligne modifiée → on le signale et le realtime remet à jour. */
export function useClaimAssignment() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async ({ assignmentId, memberId }: { assignmentId: string; memberId: string }) => {
      const { data, error } = await supabase
        .from('chore_assignments')
        .update({ member_id: memberId } as never)
        .eq('id', assignmentId)
        .is('member_id', null)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('already-claimed')
    },
    onMutate: async ({ assignmentId, memberId }) => {
      await queryClient.cancelQueries({ queryKey: ASSIGNMENTS_KEY })
      const snapshots = queryClient.getQueriesData<ChoreAssignment[]>({ queryKey: ASSIGNMENTS_KEY })
      for (const [key, data] of snapshots) {
        if (!data) continue
        queryClient.setQueryData<ChoreAssignment[]>(key,
          data.map(a => a.id === assignmentId ? { ...a, member_id: memberId } : a))
      }
      return { snapshots }
    },
    onError: (err, _v, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      const msg = err instanceof Error && err.message === 'already-claimed'
        ? 'Trop tard, déjà prise !'
        : 'Impossible de prendre la tâche.'
      showToast({ type: 'error', message: msg })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY }),
  })
}

/** Passe une assignation en « skipped » (excusée) ou la remet « pending ». */
export function useSetAssignmentStatus() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async ({ assignmentId, status }: { assignmentId: string; status: 'pending' | 'skipped' }) => {
      const { error } = await supabase
        .from('chore_assignments')
        .update({ status } as never)
        .eq('id', assignmentId)
      if (error) throw error
    },
    onMutate: async ({ assignmentId, status }) => {
      await queryClient.cancelQueries({ queryKey: ASSIGNMENTS_KEY })
      const snapshots = queryClient.getQueriesData<ChoreAssignment[]>({ queryKey: ASSIGNMENTS_KEY })
      for (const [key, data] of snapshots) {
        if (!data) continue
        queryClient.setQueryData<ChoreAssignment[]>(key,
          data.map(a => a.id === assignmentId ? { ...a, status } : a))
      }
      return { snapshots }
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots?.forEach(([key, data]) => queryClient.setQueryData(key, data))
      showToast({ type: 'error', message: 'Action impossible.' })
    },
  })
}

/** Réordonne le catalogue de tâches (position = index, RPC en une requête). */
export function useReorderChores() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const { error } = await supabase.rpc('reorder_chores', { p_ids: orderedIds })
      if (error) throw error
    },
    onMutate: async (orderedIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: CHORES_KEY })
      const previous = queryClient.getQueryData<Chore[]>(CHORES_KEY) ?? []
      const byId = new Map(previous.map(c => [c.id, c]))
      const reordered = orderedIds.map(id => byId.get(id)).filter((c): c is Chore => !!c)
      queryClient.setQueryData<Chore[]>(CHORES_KEY, reordered)
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(CHORES_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de réordonner.' })
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

// ── Preuve photo d'une tâche réalisée ─────────────────────────────────────────

/** Compresse + uploade une photo de preuve dans family-moments et la lie au log. */
export function useAddChoreProof() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async ({ logId, file }: { logId: string; file: File }) => {
      let toUpload: File = file
      if (file.size > 1_048_576) {
        const { default: imageCompression } = await import('browser-image-compression')
        toUpload = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true })
      }
      const ext = (toUpload.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${HOUSEHOLD_ID}/chores/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from('family-moments')
        .upload(path, toUpload, { contentType: toUpload.type || 'image/jpeg' })
      if (upErr) throw upErr
      const { error } = await supabase.from('chore_logs').update({ photo_path: path } as never).eq('id', logId)
      if (error) { await supabase.storage.from('family-moments').remove([path]); throw error }
      return path
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LOGS_KEY })
      showToast({ type: 'success', message: 'Photo ajoutée 📷' })
    },
    onError: () => showToast({ type: 'error', message: 'Impossible d\'ajouter la photo.' }),
  })
}

/** URL signée d'une preuve photo (cache 25 min). */
export function useChoreProofUrl(path: string | null) {
  return useQuery({
    queryKey: ['chore-proof-url', path],
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage.from('family-moments').createSignedUrl(path!, 1800)
      if (error) throw error
      return data.signedUrl
    },
    enabled: !!path,
    staleTime: 25 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
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
        note: input.note ?? null, photo_path: null, category: null, mental_load: false,
        created_at: new Date().toISOString(),
      }
      queryClient.setQueryData<ChoreLog[]>(RECENT_LOGS_KEY, [optimistic, ...previous])
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(RECENT_LOGS_KEY, ctx.previous)
      showToast({ type: 'error', message: 'Impossible d\'enregistrer la tâche.' })
    },
    // Bonus (série, tâche détestée) : octroyés côté serveur par log_chore
    // (atomique). Ici on détecte seulement ce qui a été primé pour féliciter.
    onSuccess: async (logId) => {
      const { data } = await supabase
        .from('point_events')
        .select('ref_type, points')
        .eq('ref_id', logId)
        .in('ref_type', ['streak_bonus', 'dislike_bonus'])
      for (const b of (data ?? []) as { ref_type: string; points: number }[]) {
        if (b.ref_type === 'streak_bonus') {
          showToast({ type: 'success', message: `🔥 Palier de série atteint : +${STREAK_BONUS_POINTS} pts bonus !` })
        } else if (b.ref_type === 'dislike_bonus') {
          showToast({ type: 'success', message: `😖→😌 Tâche détestée par l'autre : +${b.points} pts bonus !` })
        }
      }
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
