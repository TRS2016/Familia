import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { CHORES_KEY, ASSIGNMENTS_KEY, LOGS_KEY } from './useChores'
import { HOUSEHOLD_ID } from '../../lib/config'

/** Invalide les queries chores sur tout changement Postgres du foyer. */
export function useChoresRealtime() {
  useRealtimeInvalidation('chores-changes', [
    { table: 'chores',            keys: [CHORES_KEY] },
    { table: 'chore_assignments', keys: [ASSIGNMENTS_KEY] },
    { table: 'chore_logs',        keys: [LOGS_KEY] },
    { table: 'point_events',      keys: [['point-events', HOUSEHOLD_ID]] },
  ])
}
