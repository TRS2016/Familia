import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { MOMENTS_KEY } from './useMoments'

export function useMomentsRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('moments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moments' }, () => {
        queryClient.invalidateQueries({ queryKey: MOMENTS_KEY })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}
