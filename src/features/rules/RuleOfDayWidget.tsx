import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { ruleOfTheDay, roman, RULES_KEY } from './useRules'
import type { HouseholdRule } from './useRules'
import styles from './RuleOfDayWidget.module.css'

/** Widget Home : le commandement du jour (rotation déterministe sur les actifs). */
export default function RuleOfDayWidget() {
  const { data: rules = [] } = useQuery({
    queryKey: [...RULES_KEY, 'active'],
    queryFn: async (): Promise<HouseholdRule[]> => {
      const { data, error } = await supabase
        .from('household_rules')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .eq('status', 'active')
        .order('position', { ascending: true })
      if (error) throw error
      return data as unknown as HouseholdRule[]
    },
    staleTime: 30 * 60 * 1000,
  })

  const rule = ruleOfTheDay(rules)
  if (!rule) return null
  const index = rules.findIndex(r => r.id === rule.id)

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.title}>Commandement du jour</span>
        <Link to="/rules" className={styles.seeAll}>La loi du foyer</Link>
      </div>
      <Link to="/rules" className={styles.card}>
        <span className={styles.numeral}>{roman(index + 1)}</span>
        <p className={styles.text}>{rule.emoji} {rule.text}</p>
      </Link>
    </div>
  )
}
