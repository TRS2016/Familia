import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { CHORES_KEY, ASSIGNMENTS_KEY, LOGS_KEY } from './useChores'
import { POINTS_KEY, COUNTS_KEY, ACHIEVEMENTS_KEY, GOALS_KEY } from './useGamification'
import { REWARDS_KEY, REDEMPTIONS_KEY } from './useRewards'

/** Invalide les queries chores + gamification sur tout changement Postgres du foyer. */
export function useChoresRealtime() {
  useRealtimeInvalidation('chores-changes', [
    { table: 'chores',              keys: [CHORES_KEY] },
    { table: 'chore_assignments',   keys: [ASSIGNMENTS_KEY] },
    { table: 'chore_logs',          keys: [LOGS_KEY, COUNTS_KEY] },
    { table: 'point_events',        keys: [POINTS_KEY] },
    { table: 'member_achievements', keys: [ACHIEVEMENTS_KEY] },
    { table: 'family_goals',        keys: [GOALS_KEY] },
    { table: 'rewards',             keys: [REWARDS_KEY] },
    { table: 'reward_redemptions',  keys: [REDEMPTIONS_KEY] },
  ])
}
