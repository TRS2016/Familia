import type { BalanceState } from './useEquilibre'
import styles from './EquityBalance.module.css'

interface Props {
  aName: string
  bName: string
  aColor: string
  bColor: string
  balance: BalanceState
  coupleStreak?: number
  compact?: boolean
}

/**
 * Balance d'équité de la semaine : répartition des points entre les deux
 * adultes. Zone 40/60 = « équilibrée », affichée de façon apaisante ; au-delà
 * on le signale sobrement, sans blâme ni couleur alarmante (les segments
 * gardent les couleurs des membres).
 */
export default function EquityBalance({ aName, bName, aColor, bColor, balance, coupleStreak = 0, compact = false }: Props) {
  const { aPts, bPts, total, aPct, balanced } = balance

  if (total === 0) {
    return (
      <div className={styles.wrap}>
        <span className={styles.empty}>⚖️ La balance de la semaine démarre à la première tâche.</span>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.namesRow}>
        <span className={styles.name} style={{ color: aColor }}>{aName} · {aPts} pts</span>
        <span className={styles.split}>{aPct} / {100 - aPct}</span>
        <span className={styles.name} style={{ color: bColor }}>{bPts} pts · {bName}</span>
      </div>
      <div className={styles.track} role="img" aria-label={`Répartition des points : ${aName} ${aPct} %, ${bName} ${100 - aPct} %`}>
        <div className={styles.fill} style={{ width: `${aPct}%`, background: aColor }} />
        <div className={styles.fillRight} style={{ background: bColor }} />
        <span className={styles.zone} aria-hidden="true" />
      </div>
      <span className={styles.caption}>
        {balanced ? '⚖️ Semaine équilibrée, bravo à vous deux' : 'La balance penche un peu cette semaine — elle s\'équilibre sur la durée'}
        {coupleStreak > 0 && !compact && (
          <span className={styles.streak}> · 🤝 {coupleStreak} semaine{coupleStreak > 1 ? 's' : ''} d'équilibre d'affilée</span>
        )}
      </span>
      {coupleStreak > 0 && compact && (
        <span className={styles.caption}>🤝 {coupleStreak} semaine{coupleStreak > 1 ? 's' : ''} d'équilibre d'affilée</span>
      )}
    </div>
  )
}
