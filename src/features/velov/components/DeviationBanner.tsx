import styles from './DeviationBanner.module.css'

export interface DeviationBannerProps {
  countdown: number | null
  onCancel: () => void
  onRecalc: () => void
  loading?: boolean
  floating?: boolean
}

export function DeviationBanner({ countdown, onCancel, onRecalc, loading = false, floating = false }: DeviationBannerProps) {
  return (
    <div className={floating ? styles.floating : styles.inline}>
      <div role="alert" className={[styles.box, floating ? styles.boxFloating : ''].join(' ')}>
        <div style={{ minWidth: 0 }}>
          <p className={styles.title}>Vous semblez hors de l'itinéraire</p>
          {countdown !== null && <p className={styles.sub}>Recalcul automatique dans {countdown}s</p>}
        </div>
        <div className={styles.actions}>
          {countdown !== null && (
            <button onClick={onCancel} className={styles.btnCancel}>Annuler</button>
          )}
          <button onClick={onRecalc} disabled={loading} className={styles.btnNow}>
            {loading ? '...' : 'Maintenant'}
          </button>
        </div>
      </div>
    </div>
  )
}
