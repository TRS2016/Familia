import { Navigation } from 'lucide-react'
import type { RoutePoint, Station } from '../types'
import styles from './ProximityAlertBanner.module.css'

export interface ProximityAlertBannerProps {
  destination: RoutePoint | null
  proximityEnabled: boolean
  distanceToDest: number | null
  arrived: boolean
  nearbyStations: Station[]
  onDisable: () => void
}

export function ProximityAlertBanner({
  destination, proximityEnabled, distanceToDest, arrived, nearbyStations, onDisable,
}: ProximityAlertBannerProps) {
  if (!proximityEnabled || !destination) return null

  if (!arrived) {
    return (
      <div className={styles.enroute}>
        <div className={[styles.inner, styles.enrouteRow].join(' ')}>
          <p className={styles.enrouteText}>
            <Navigation size={14} /> En route vers <strong>{destination.name}</strong>
            {distanceToDest != null && ` — ${distanceToDest.toFixed(0)} m`}
          </p>
          <button onClick={onDisable} className={styles.disable}>Désactiver</button>
        </div>
      </div>
    )
  }

  const withStands = nearbyStations.filter((s) => s.availableStands > 0)
  const withBikes = nearbyStations.filter((s) => s.availableBikes > 0)

  return (
    <div className={styles.arrived}>
      <div className={styles.inner}>
        <div className={styles.arrivedHead}>
          <h3 className={styles.arrivedTitle}>
            Arrivé à {destination.name}
            {distanceToDest != null && ` (${distanceToDest.toFixed(0)} m)`}
          </h3>
          <button onClick={onDisable} className={styles.disableArrived}>Désactiver</button>
        </div>
        <div className={styles.cards}>
          {withBikes.length > 0 && (
            <div className={[styles.card, styles.cardBikes].join(' ')}>
              <span className={styles.cardKeyBikes}>Vélos :</span>
              <span className={styles.cardVal}>{withBikes[0].name} ({withBikes[0].availableBikes})</span>
            </div>
          )}
          {withStands.length > 0 && (
            <div className={[styles.card, styles.cardStands].join(' ')}>
              <span className={styles.cardKeyStands}>Places :</span>
              <span className={styles.cardVal}>{withStands[0].name} ({withStands[0].availableStands})</span>
            </div>
          )}
          {nearbyStations.length > 0 && !withBikes.length && !withStands.length && (
            <p className={styles.empty}>Toutes les stations à proximité sont pleines</p>
          )}
        </div>
      </div>
    </div>
  )
}
