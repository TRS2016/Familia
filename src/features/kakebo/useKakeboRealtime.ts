import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { HOUSEHOLD_ID } from '../../lib/config'
import { KAKEBO_CATS_KEY } from './useKakebo'
import { SAVING_GOALS_KEY, SAVING_GOAL_TOTALS_KEY } from './useSavingGoals'

export function useKakeboRealtime() {
  useRealtimeInvalidation('kakebo-changes', [
    { table: 'kakebo_entries', keys: [['kakebo-entries', HOUSEHOLD_ID], SAVING_GOAL_TOTALS_KEY] },
    { table: 'kakebo_categories', keys: [KAKEBO_CATS_KEY] },
    { table: 'kakebo_saving_goals', keys: [SAVING_GOALS_KEY] },
  ])
}
