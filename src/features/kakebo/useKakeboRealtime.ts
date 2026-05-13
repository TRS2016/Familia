import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { KAKEBO_CATS_KEY } from './useKakebo'

export function useKakeboRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('kakebo-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kakebo_entries' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['kakebo-entries', HOUSEHOLD_ID] })
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
  }, [queryClient])
}
