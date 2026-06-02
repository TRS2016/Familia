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
