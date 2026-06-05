import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'
import type { TrainingConfig, TrainingMode, TrainingPreset, TrainingSession } from './training'

export const TRAINING_PRESETS_KEY  = ['training-presets', HOUSEHOLD_ID] as const
export const TRAINING_SESSIONS_KEY = ['training-sessions', HOUSEHOLD_ID] as const

// ── Presets ────────────────────────────────────────────────────────────────────

export function useTrainingPresets() {
  return useQuery({
    queryKey: TRAINING_PRESETS_KEY,
    queryFn: async (): Promise<TrainingPreset[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('training_presets')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as TrainingPreset[]
    },
  })
}

export function useAddTrainingPreset() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: { name: string; mode: TrainingMode; config: TrainingConfig }): Promise<TrainingPreset> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('training_presets')
        .insert({
          household_id: HOUSEHOLD_ID,
          member_id:    member?.id ?? null,
          name:         input.name.trim(),
          mode:         input.mode,
          config:       input.config,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as TrainingPreset
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('training_presets')
        .update({ name: input.name.trim(), mode: input.mode, config: input.config })
        .eq('id', input.id)
      if (error) throw error
    },
    onMutate: async (input) => {
      const previous = queryClient.getQueryData<TrainingPreset[]>(TRAINING_PRESETS_KEY) ?? []
      queryClient.setQueryData<TrainingPreset[]>(TRAINING_PRESETS_KEY,
        previous.map(p => p.id === input.id ? { ...p, name: input.name.trim(), mode: input.mode, config: input.config } : p)
      )
      return { previous }
    },
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('training_presets').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      const previous = queryClient.getQueryData<TrainingPreset[]>(TRAINING_PRESETS_KEY) ?? []
      queryClient.setQueryData<TrainingPreset[]>(TRAINING_PRESETS_KEY, previous.filter(p => p.id !== id))
      return { previous }
    },
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
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

  return useMutation({
    mutationFn: async (input: { name: string; mode: TrainingMode; duration_seconds: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('training_sessions')
        .insert({
          household_id:     HOUSEHOLD_ID,
          member_id:        member?.id ?? null,
          name:             input.name,
          mode:             input.mode,
          duration_seconds: input.duration_seconds,
        })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRAINING_SESSIONS_KEY })
    },
  })
}

// ── Stats ────────────────────────────────────────────────────────────────────────

export interface TrainingStats {
  weekCount:    number   // séances cette semaine (lun→dim)
  weekSeconds:  number   // temps total cette semaine
  totalCount:   number   // séances all-time (sur la fenêtre récupérée)
  streakDays:   number   // jours consécutifs avec ≥1 séance (jusqu'à aujourd'hui/hier)
  perDay:       { date: string; seconds: number }[] // 7 derniers jours (du + ancien au + récent)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('training_sessions')
        .select('duration_seconds, completed_at')
        .eq('household_id', HOUSEHOLD_ID)
        .gte('completed_at', since.toISOString())
        .order('completed_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as { duration_seconds: number; completed_at: string }[]

      const now = new Date()
      const weekStart = startOfWeek(now)
      const secByDay = new Map<string, number>()
      let weekCount = 0, weekSeconds = 0
      for (const r of rows) {
        const d = new Date(r.completed_at)
        secByDay.set(dayKey(d), (secByDay.get(dayKey(d)) ?? 0) + (r.duration_seconds ?? 0))
        if (d >= weekStart) { weekCount++; weekSeconds += r.duration_seconds ?? 0 }
      }

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

      return { weekCount, weekSeconds, totalCount: rows.length, streakDays, perDay }
    },
  })
}

// ── Realtime presets ─────────────────────────────────────────────────────────────

export function useTrainingRealtime() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel('training-presets-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'training_presets' }, () => {
        queryClient.invalidateQueries({ queryKey: TRAINING_PRESETS_KEY })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}
