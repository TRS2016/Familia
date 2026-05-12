import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { KAKEBO_CATS_KEY, kakeboEntriesKey } from './useKakebo'

export function useKakeboRealtime(year: number, month: number) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('kakebo-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kakebo_entries' },
        () => {
          queryClient.invalidateQueries({ queryKey: kakeboEntriesKey(year, month) })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kakebo_categories' },
        () => {
          queryClient.invalidateQueries({ queryKey: KAKEBO_CATS_KEY })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, year, month])
}
