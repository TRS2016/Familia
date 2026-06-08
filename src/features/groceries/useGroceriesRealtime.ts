import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { GROCERIES_KEY } from './useGroceries'

export function useGroceriesRealtime() {
  useRealtimeInvalidation('groceries-changes', [
    { table: 'groceries', keys: [GROCERIES_KEY] },
  ])
}
