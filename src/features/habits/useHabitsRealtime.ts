import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HABITS_KEY, completionsKey } from './useHabits'

export function useHabitsRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('habits-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habits' }, () => {
        queryClient.invalidateQueries({ queryKey: HABITS_KEY })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_completions' }, () => {
        queryClient.invalidateQueries({ queryKey: completionsKey('recent') })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}
