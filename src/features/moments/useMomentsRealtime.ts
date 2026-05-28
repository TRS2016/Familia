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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moment_reactions' }, () => {
        queryClient.invalidateQueries({ queryKey: MOMENTS_KEY })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moment_comments' }, (payload) => {
        const momentId = (payload.new as { moment_id?: string })?.moment_id
          ?? (payload.old as { moment_id?: string })?.moment_id
        if (momentId) {
          queryClient.invalidateQueries({ queryKey: ['moment-comments', momentId] })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}
