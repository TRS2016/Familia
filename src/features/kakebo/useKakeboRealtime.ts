import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { HOUSEHOLD_ID } from '../../lib/config'
import { KAKEBO_CATS_KEY } from './useKakebo'

export function useKakeboRealtime() {
  useRealtimeInvalidation('kakebo-changes', [
    { table: 'kakebo_entries', keys: [['kakebo-entries', HOUSEHOLD_ID]] },
    { table: 'kakebo_categories', keys: [KAKEBO_CATS_KEY] },
  ])
}
