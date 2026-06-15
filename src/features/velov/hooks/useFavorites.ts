import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabase'
import { QK } from '../../../lib/query-keys'
import { useMember } from '../../../auth/useMember'
import { useRealtimeInvalidation } from '../../../lib/useRealtimeInvalidation'

const LEGACY_KEY = 'velov-favorites'
const MIGRATED_KEY = 'velov-favorites-synced'

export interface UseFavoritesResult {
  favorites: string[]
  addFavorite: (stationId: string) => void
  removeFavorite: (stationId: string) => void
  toggleFavorite: (stationId: string) => void
}

/**
 * Favoris de stations synchronisés par membre via Supabase (table velov_favorites).
 * Mises à jour optimistes + realtime multi-appareils. Migre une seule fois les
 * favoris localStorage hérités vers le compte.
 */
export function useFavorites(): UseFavoritesResult {
  const { data: member } = useMember()
  const memberId = member?.id
  const householdId = member?.household_id
  const qc = useQueryClient()
  const key = QK.velovFavorites(memberId ?? '')

  const { data: favorites = [] } = useQuery({
    queryKey: key,
    enabled: !!memberId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('velov_favorites')
        .select('station_id')
        .eq('member_id', memberId!)
      if (error) throw error
      return data.map((r) => r.station_id)
    },
  })

  useRealtimeInvalidation('velov-favorites-changes', memberId ? [
    { table: 'velov_favorites', keys: [key] },
  ] : [])

  const addMutation = useMutation({
    mutationFn: async (stationId: string) => {
      if (!memberId || !householdId) return
      const { error } = await supabase
        .from('velov_favorites')
        .insert({ member_id: memberId, household_id: householdId, station_id: stationId })
      if (error && error.code !== '23505') throw error // ignore doublon
    },
    onMutate: async (stationId: string) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<string[]>(key) ?? []
      if (!prev.includes(stationId)) qc.setQueryData<string[]>(key, [...prev, stationId])
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(key, ctx.prev) },
    onSettled: () => { void qc.invalidateQueries({ queryKey: key }) },
  })

  const removeMutation = useMutation({
    mutationFn: async (stationId: string) => {
      if (!memberId) return
      const { error } = await supabase
        .from('velov_favorites')
        .delete()
        .eq('member_id', memberId)
        .eq('station_id', stationId)
      if (error) throw error
    },
    onMutate: async (stationId: string) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<string[]>(key) ?? []
      qc.setQueryData<string[]>(key, prev.filter((id) => id !== stationId))
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData(key, ctx.prev) },
    onSettled: () => { void qc.invalidateQueries({ queryKey: key }) },
  })

  // Migration unique des favoris localStorage hérités.
  useEffect(() => {
    if (!memberId || !householdId) return
    if (localStorage.getItem(MIGRATED_KEY)) return
    let legacy: string[] = []
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]') as string[] } catch { /* ignore */ }
    const apply = async () => {
      if (legacy.length > 0) {
        await supabase
          .from('velov_favorites')
          .upsert(
            legacy.map((station_id) => ({ member_id: memberId, household_id: householdId, station_id })),
            { onConflict: 'member_id,station_id', ignoreDuplicates: true },
          )
        void qc.invalidateQueries({ queryKey: key })
      }
      localStorage.setItem(MIGRATED_KEY, '1')
    }
    void apply()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, householdId])

  function addFavorite(stationId: string) { addMutation.mutate(stationId) }
  function removeFavorite(stationId: string) { removeMutation.mutate(stationId) }
  function toggleFavorite(stationId: string) {
    if (favorites.includes(stationId)) removeMutation.mutate(stationId)
    else addMutation.mutate(stationId)
  }

  return { favorites, addFavorite, removeFavorite, toggleFavorite }
}
