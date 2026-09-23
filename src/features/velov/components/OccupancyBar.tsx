import styles from './OccupancyBar.module.css'

/**
 * Jauge d'occupation d'une station. Partagée par la carte de liste et la fiche
 * station, qui en portaient deux copies identiques (composant + CSS).
 */
export function OccupancyBar({ bikes, stands, capacity }: {
  bikes: number
  stands: number
  capacity: number
}) {
  if (!capacity) return null
  const bikePct = Math.round((bikes / capacity) * 100)
  const standPct = Math.round((stands / capacity) * 100)
  const outPct = Math.max(0, 100 - bikePct - standPct)
  return (
    <div className={styles.occBar}>
      <div className={styles.occBikes} style={{ width: `${bikePct}%` }} />
      <div className={styles.occStands} style={{ width: `${standPct}%` }} />
      <div className={styles.occRest} style={{ width: `${outPct}%` }} />
    </div>
  )
}
