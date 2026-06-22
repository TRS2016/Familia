import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'
import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { collectVideoPaths } from './training'
import type { TrainingConfig, TrainingMode, TrainingPreset, TrainingSession } from './training'

// Supprime des objets du bucket family-media (best effort : ne bloque pas la
// mutation principale si le retrait échoue).
async function removeStorage(paths: string[]) {
  if (paths.length === 0) return
  try { await supabase.storage.from('family-media').remove(paths) } catch { /* best effort */ }
}

export const TRAINING_PRESETS_KEY  = ['training-presets', HOUSEHOLD_ID] as const
export const TRAINING_SESSIONS_KEY = ['training-sessions', HOUSEHOLD_ID] as const

// ── Presets ────────────────────────────────────────────────────────────────────

export function useTrainingPresets() {
  return useQuery({
    queryKey: TRAINING_PRESETS_KEY,
    queryFn: async (): Promise<TrainingPreset[]> => {
      const { data, error } = await supabase
        .from('training_presets')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as TrainingPreset[]
    },
  })
}

export function useAddTrainingPreset() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: { name: string; mode: TrainingMode; config: TrainingConfig }): Promise<TrainingPreset> => {
      const { data, error } = await supabase
        .from('training_presets')
        .insert({
          household_id: HOUSEHOLD_ID,
          member_id:    member?.id ?? null,
          name:         input.name.trim(),
          mode:         input.mode,
          config:       input.config as unknown as Json,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as TrainingPreset
    },
    onSuccess: (p) => {
      queryClient.setQueryData<TrainingPreset[]>(TRAINING_PRESETS_KEY, old => [p, ...(old ?? [])])
    },
    onError: () => showToast({ type: 'error', message: 'Impossible d\'enregistrer le preset.' }),
  })
}

export function useUpdateTrainingPreset() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: { id: string; name: string; mode: TrainingMode; config: TrainingConfig }) => {
      const { error } = await supabase
        .from('training_presets')
        .update({ name: input.name.trim(), mode: input.mode, config: input.config as unknown as Json })
        .eq('id', input.id)
      if (error) throw error
    },
    onMutate: async (input) => {
      const previous = queryClient.getQueryData<TrainingPreset[]>(TRAINING_PRESETS_KEY) ?? []
      // Vidéos présentes avant mais absentes de la nouvelle config (capture AVANT
      // l'écriture optimiste qui remplace la config en cache).
      const oldPaths = collectVideoPaths(previous.find(p => p.id === input.id)?.config)
      const newPaths = new Set(collectVideoPaths(input.config))
      const droppedPaths = oldPaths.filter(p => !newPaths.has(p))
      queryClient.setQueryData<TrainingPreset[]>(TRAINING_PRESETS_KEY,
        previous.map(p => p.id === input.id ? { ...p, name: input.name.trim(), mode: input.mode, config: input.config } : p)
      )
      return { previous, droppedPaths }
    },
    onSuccess: (_d, _v, ctx) => { void removeStorage(ctx?.droppedPaths ?? []) },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(TRAINING_PRESETS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de mettre à jour le preset.' })
    },
  })
}

export function useDeleteTrainingPreset() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('training_presets').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      const previous = queryClient.getQueryData<TrainingPreset[]>(TRAINING_PRESETS_KEY) ?? []
      // Capture les vidéos du preset AVANT de le retirer du cache (sinon on ne
      // pourrait plus les retrouver pour nettoyer le Storage).
      const paths = collectVideoPaths(previous.find(p => p.id === id)?.config)
      queryClient.setQueryData<TrainingPreset[]>(TRAINING_PRESETS_KEY, previous.filter(p => p.id !== id))
      return { previous, paths }
    },
    onSuccess: (_d, _id, ctx) => { void removeStorage(ctx?.paths ?? []) },
    onError: (_e, _id, ctx) => {
      queryClient.setQueryData(TRAINING_PRESETS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de supprimer le preset.' })
    },
  })
}

// ── Historique des séances ──────────────────────────────────────────────────────

export function useTrainingSessions(limit = 20) {
  return useQuery({
    queryKey: [...TRAINING_SESSIONS_KEY, limit],
    queryFn: async (): Promise<TrainingSession[]> => {
      const { data, error } = await supabase
        .from('training_sessions')
        .select('*, member:members(display_name)')
        .eq('household_id', HOUSEHOLD_ID)
        .order('completed_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data as TrainingSession[]
    },
  })
}

export function useLogTrainingSession() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: { name: string; mode: TrainingMode; duration_seconds: number; focus?: string | null; rounds?: number | null }) => {
      const { error } = await supabase
        .from('training_sessions')
        .insert({
          household_id:     HOUSEHOLD_ID,
          member_id:        member?.id ?? null,
          name:             input.name,
          mode:             input.mode,
          duration_seconds: input.duration_seconds,
          focus:            input.focus ?? null,
          rounds:           input.rounds ?? null,
        })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRAINING_SESSIONS_KEY })
    },
    onError: () => showToast({ type: 'error', message: "Séance non enregistrée — vérifie ta connexion." }),
  })
}

export function useDeleteTrainingSession() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('training_sessions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRAINING_SESSIONS_KEY })
    },
    onError: () => showToast({ type: 'error', message: 'Impossible de supprimer la séance.' }),
  })
}

// ── Stats ────────────────────────────────────────────────────────────────────────

export interface TrainingStats {
  weekCount:    number   // séances cette semaine (lun→dim)
  weekSeconds:  number   // temps total cette semaine
  totalCount:   number   // séances all-time (sur la fenêtre récupérée)
  streakDays:   number   // jours consécutifs avec ≥1 séance (jusqu'à aujourd'hui/hier)
  perDay:       { date: string; seconds: number }[] // 7 derniers jours (du + ancien au + récent)
  zones:        { focus: string; count: number }[]  // répartition par zone (desc), sur la fenêtre
}

/** Clé locale (YYYY-MM-DD) d'une date — pour grouper par jour sans souci de fuseau. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Début de semaine (lundi) à minuit local. */
function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = (d.getDay() + 6) % 7 // lundi = 0
  d.setDate(d.getDate() - dow)
  return d
}

export function useTrainingStats() {
  return useQuery({
    queryKey: [...TRAINING_SESSIONS_KEY, 'stats'],
    queryFn: async (): Promise<TrainingStats> => {
      const since = new Date()
      since.setDate(since.getDate() - 120)
      const { data, error } = await supabase
        .from('training_sessions')
        .select('duration_seconds, completed_at, focus')
        .eq('household_id', HOUSEHOLD_ID)
        .gte('completed_at', since.toISOString())
        .order('completed_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as { duration_seconds: number; completed_at: string; focus: string | null }[]

      const now = new Date()
      const weekStart = startOfWeek(now)
      const secByDay = new Map<string, number>()
      const countByZone = new Map<string, number>()
      let weekCount = 0, weekSeconds = 0
      for (const r of rows) {
        const d = new Date(r.completed_at)
        secByDay.set(dayKey(d), (secByDay.get(dayKey(d)) ?? 0) + (r.duration_seconds ?? 0))
        if (d >= weekStart) { weekCount++; weekSeconds += r.duration_seconds ?? 0 }
        if (r.focus) countByZone.set(r.focus, (countByZone.get(r.focus) ?? 0) + 1)
      }
      const zones = [...countByZone.entries()]
        .map(([focus, count]) => ({ focus, count }))
        .sort((a, b) => b.count - a.count)

      // streak : jours consécutifs avec séance, en partant d'aujourd'hui (ou hier).
      let streakDays = 0
      const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      if (!secByDay.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1) // tolère "pas encore aujourd'hui"
      while (secByDay.has(dayKey(cursor))) {
        streakDays++
        cursor.setDate(cursor.getDate() - 1)
      }

      // 7 derniers jours (du plus ancien au plus récent)
      const perDay: { date: string; seconds: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        perDay.push({ date: dayKey(d), seconds: secByDay.get(dayKey(d)) ?? 0 })
      }

      return { weekCount, weekSeconds, totalCount: rows.length, streakDays, perDay, zones }
    },
  })
}

// ── Records For Time (meilleur temps par nom de séance) ──────────────────────────

// Renvoie un Record (et non une Map) : le cache TanStack Query est persisté en
// localStorage (PWA) et une Map y est sérialisée en `{}` → `.get` planterait à
// la réhydratation. Même précaution que la gamification des corvées.
export function useTrainingRecords() {
  return useQuery({
    queryKey: [...TRAINING_SESSIONS_KEY, 'records'],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('training_sessions')
        .select('name, duration_seconds')
        .eq('household_id', HOUSEHOLD_ID)
        .eq('mode', 'fortime')
      if (error) throw error
      const rows = (data ?? []) as { name: string; duration_seconds: number }[]
      const best: Record<string, number> = {}
      for (const r of rows) {
        if (!r.duration_seconds) continue
        const cur = best[r.name]
        if (cur === undefined || r.duration_seconds < cur) best[r.name] = r.duration_seconds
      }
      return best
    },
  })
}

// ── Realtime presets + sessions ──────────────────────────────────────────────────
// Helper partagé (debounce) ; les sessions doivent être dans la publication
// supabase_realtime (migration 20260616200000) pour que le canal les diffuse.

export function useTrainingRealtime() {
  useRealtimeInvalidation('training-changes', [
    { table: 'training_presets',  keys: [TRAINING_PRESETS_KEY] },
    { table: 'training_sessions', keys: [TRAINING_SESSIONS_KEY] },
  ])
}
