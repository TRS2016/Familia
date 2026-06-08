import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { EVENTS_KEY_PREFIX } from './useEvents'

export function useEventsRealtime() {
  useRealtimeInvalidation('events-changes', [
    { table: 'events', keys: [EVENTS_KEY_PREFIX] },
  ])
}
