import type { BalanceState } from './useEquilibre'
import styles from './EquityBalance.module.css'

interface Props {
  aName: string
  bName: string
  aColor: string
  bColor: string
  balance: BalanceState
  /** Libellé de carte (ex. « Équilibre du foyer ») affiché au-dessus. */
  label?: string
  compact?: boolean
}

/**
 * Balance d'équité de la semaine : répartition des points entre les deux
 * adultes (handoff « Tâches & Jeu »). Zone 40/60 = équilibrée ; au-delà, le
 * texte reste factuel et les segments gardent les couleurs des membres —
 * jamais de rouge, jamais de jugement.
 */
export default function EquityBalance({ aName, bName, aColor, bColor, balance, label, compact = false }: Props) {
  const { aPts, bPts, total, aPct, balanced } = balance

  if (total === 0) {
    return (
      <div className={styles.wrap}>
        {label && <span className={styles.cardLabel}>{label}</span>}
        <span className={styles.empty}>La balance de la semaine démarre à la première tâche.</span>
      </div>
    )
  }

  const leaderName = aPts >= bPts ? aName : bName
  const message = balanced
    ? 'Vous êtes dans la zone d\'équilibre cette semaine — belle coopération.'
    : `${leaderName} a pris un peu plus cette semaine — rien de grave, ça s'ajuste.`

  return (
    <div className={styles.wrap}>
      {label && <span className={styles.cardLabel}>{label}</span>}
      <div className={styles.namesRow}>
        <span className={styles.name}>
          <span className={styles.dot} style={{ background: aColor }} aria-hidden="true" />
          {aName} {aPct}%
        </span>
        <span className={styles.name}>
          {100 - aPct}% {bName}
          <span className={styles.dot} style={{ background: bColor }} aria-hidden="true" />
        </span>
      </div>
      <div className={styles.track} role="img" aria-label={`Répartition des points : ${aName} ${aPct} %, ${bName} ${100 - aPct} %`}>
        <div className={styles.fill} style={{ width: `${aPct}%`, background: aColor }} />
        <div className={styles.fillRight} style={{ background: bColor }} />
      </div>
      {!compact && <p className={styles.caption}>{message}</p>}
    </div>
  )
}
