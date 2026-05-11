import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { GROCERIES_KEY } from './useGroceries'

export function useGroceriesRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('groceries-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'groceries' },
        () => {
          queryClient.invalidateQueries({ queryKey: GROCERIES_KEY })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}
