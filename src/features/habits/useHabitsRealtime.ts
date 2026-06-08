import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { HABITS_KEY, completionsKey } from './useHabits'

export function useHabitsRealtime() {
  useRealtimeInvalidation('habits-changes', [
    { table: 'habits', keys: [HABITS_KEY] },
    { table: 'habit_completions', keys: [completionsKey('recent'), ['habit-completions']] },
  ])
}
