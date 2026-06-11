import styles from './LecteurPage.module.css'

// Barres d'égaliseur animées (indicateur « en cours de lecture »).
export default function EqBars({ small = false }: { small?: boolean }) {
  return (
    <div className={[styles.eqBars, small ? styles.eqBarsSmall : ''].join(' ')}>
      <span className={styles.eqBar} />
      <span className={styles.eqBar} />
      <span className={styles.eqBar} />
    </div>
  )
}
