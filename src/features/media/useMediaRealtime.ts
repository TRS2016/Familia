import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { MEDIA_KEY } from './useMedia'

export function useMediaRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('media-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'media_items' }, () => {
        queryClient.invalidateQueries({ queryKey: MEDIA_KEY })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}
