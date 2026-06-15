import { useState, useEffect } from 'react'
import { Star, Navigation, BarChart3, Bell } from 'lucide-react'
import { HistoryChart } from './HistoryChart'
import { saveSnapshot } from '../historyDB'
import type { Station } from '../types'
import styles from './StationCard.module.css'

function OccupancyBar({ bikes, stands, capacity }: { bikes: number; stands: number; capacity: number }) {
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

export interface StationCardProps {
  station: Station
  distance?: number
  isAlerted: boolean
  onToggleAlert: (id: string) => void
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
  alertThreshold?: number
  onSetThreshold?: (id: string, value: number | string | null) => void
}

export function StationCard({
  station, distance,
  isAlerted, onToggleAlert,
  isFavorite, onToggleFavorite,
  alertThreshold, onSetThreshold,
}: StationCardProps) {
  const [showHistory, setShowHistory] = useState(false)

  const hasBikes = station.availableBikes > 0
  const hasStands = station.availableStands > 0

  useEffect(() => {
    void saveSnapshot(station.id, station.availableBikes, station.availableStands)
  }, [station.id, station.availableBikes, station.availableStands])

  function openNavigation() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const url = isIOS
      ? `http://maps.apple.com/?daddr=${station.lat},${station.lng}&dirflg=w`
      : `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}&travelmode=bicycling`
    window.open(url, '_blank')
  }

  const statusText =
    station.isRenting && station.isReturning ? 'Ouverte'
    : station.isRenting && !station.isReturning ? 'Départ seulement'
    : !station.isRenting && station.isReturning ? 'Retour seulement'
    : 'Fermée'

  return (
    <div className={styles.card}>
      <div className={styles.topRow}>
        <div className={styles.nameWrap}>
          <h3 className={styles.name}>{station.name}</h3>
          <button
            onClick={() => onToggleFavorite(station.id)}
            className={[styles.iconBtn, isFavorite ? styles.favActive : ''].join(' ')}
            aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className={styles.metaRow}>
          {distance !== undefined && <span className={styles.distance}>{distance.toFixed(0)}m</span>}
          <button onClick={openNavigation} className={styles.navBtn} aria-label="Naviguer vers cette station">
            <Navigation size={16} />
          </button>
        </div>
      </div>

      <p className={styles.address}>{station.address}</p>

      <div className={styles.stats}>
        <div className={[styles.statBox, hasBikes ? styles.statBikesOk : styles.statEmpty].join(' ')}>
          <p className={styles.statLabel}>Vélos</p>
          <p className={[styles.statValue, hasBikes ? styles.valBikes : styles.valEmpty].join(' ')}>{station.availableBikes}</p>
          <p className={styles.statCap}>/ {station.capacity}</p>
        </div>
        <div className={[styles.statBox, hasStands ? styles.statStandsOk : styles.statEmpty].join(' ')}>
          <p className={styles.statLabel}>Places</p>
          <p className={[styles.statValue, hasStands ? styles.valStands : styles.valEmpty].join(' ')}>{station.availableStands}</p>
          <p className={styles.statCap}>/ {station.capacity}</p>
        </div>
      </div>
      <OccupancyBar bikes={station.availableBikes} stands={station.availableStands} capacity={station.capacity} />

      {showHistory && <HistoryChart stationId={station.id} />}

      <div className={styles.footer}>
        <div className={styles.statusWrap}>
          <span className={[styles.dot, station.isRenting ? styles.dotOpen : styles.dotClosed].join(' ')} />
          <span className={styles.statusText}>{statusText}</span>
        </div>

        <div className={styles.actions}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            title={showHistory ? "Masquer l'historique" : "Voir l'historique"}
            className={[styles.toolBtn, showHistory ? styles.toolActive : ''].join(' ')}
            aria-label={showHistory ? "Masquer l'historique" : "Voir l'historique"}
          >
            <BarChart3 size={16} />
          </button>

          <button
            onClick={() => onToggleAlert(station.id)}
            disabled={!station.isRenting}
            title={!station.isRenting ? 'Station fermée' : isAlerted ? "Désactiver l'alerte" : 'Recevoir une alerte dès disponibilité'}
            aria-label={isAlerted ? 'Alerte active' : 'Recevoir une alerte'}
            className={[styles.toolBtn, isAlerted ? styles.alertActive : ''].join(' ')}
          >
            <Bell size={14} fill={isAlerted ? 'currentColor' : 'none'} />{isAlerted && 'Active'}
          </button>
        </div>
      </div>

      {isAlerted && onSetThreshold && (
        <div className={styles.thresholdRow}>
          <span className={styles.thresholdLabel}>Alerter si ≤</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="30"
            value={alertThreshold ?? ''}
            onChange={(e) => onSetThreshold(station.id, e.target.value !== '' ? e.target.value : null)}
            placeholder="∞"
            aria-label="Seuil d'alerte en nombre de vélos"
            className={styles.thresholdInput}
          />
          <span className={styles.thresholdLabel}>vélos (vide = dès dispo)</span>
        </div>
      )}
    </div>
  )
}
