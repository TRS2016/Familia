import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { HOUSEHOLD_ID } from '../../lib/config'
import { KAKEBO_CATS_KEY, KAKEBO_OBJECTIF_KEY } from './useKakebo'
import { SAVING_GOALS_KEY, ARCHIVED_SAVING_GOALS_KEY, SAVING_GOAL_TOTALS_KEY } from './useSavingGoals'

export function useKakeboRealtime() {
  useRealtimeInvalidation('kakebo-changes', [
    { table: 'kakebo_entries', keys: [['kakebo-entries', HOUSEHOLD_ID], ['kakebo-trend', HOUSEHOLD_ID], SAVING_GOAL_TOTALS_KEY] },
    { table: 'kakebo_categories', keys: [KAKEBO_CATS_KEY] },
    { table: 'kakebo_saving_goals', keys: [SAVING_GOALS_KEY, ARCHIVED_SAVING_GOALS_KEY] },
    // Budgets par membre et objectif du foyer : sans ça, une modification faite
    // sur un appareil restait périmée sur les autres jusqu'au remontage.
    { table: 'kakebo_member_budgets', keys: [['kakebo-member-budgets', HOUSEHOLD_ID]] },
    { table: 'households', keys: [KAKEBO_OBJECTIF_KEY] },
    // Pas d'abonnement à `members` : la table n'est pas dans la publication
    // realtime, et un abonnement à une table absente rend muet le canal ENTIER
    // (piège supabase-js, cf. migration 20260715000000).
  ])
}
