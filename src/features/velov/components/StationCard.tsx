import { Star, Bell, ChevronRight } from 'lucide-react'
import type { Station } from '../types'
import styles from './StationCard.module.css'
import { OccupancyBar } from './OccupancyBar'

export interface StationCardProps {
  station: Station
  distance?: number
  isAlerted: boolean
  onToggleAlert: (id: string) => void
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
  alertThreshold?: number
  onSetThreshold?: (id: string, value: number | string | null) => void
  /** Ouvre la fiche station (mêmes actions que depuis la carte). */
  onOpen?: (s: Station) => void
}

export function StationCard({
  station, distance,
  isAlerted, onToggleAlert,
  isFavorite, onToggleFavorite,
  alertThreshold, onSetThreshold,
  onOpen,
}: StationCardProps) {
  const hasBikes = station.availableBikes > 0
  const hasStands = station.availableStands > 0

  const statusText =
    station.isRenting && station.isReturning ? 'Ouverte'
    : station.isRenting && !station.isReturning ? 'Départ seulement'
    : !station.isRenting && station.isReturning ? 'Retour seulement'
    : 'Fermée'

  return (
    <div className={styles.card}>
      <div className={styles.topRow}>
        <div className={styles.nameWrap}>
          {/* Le nom ouvre la fiche : les actions (Planifier / Marcher / Y aller)
              vivent au même endroit qu'au tap depuis la carte. */}
          {onOpen ? (
            <button className={styles.nameBtn} onClick={() => onOpen(station)}>
              <h3 className={styles.name}>{station.name}</h3>
              <ChevronRight size={15} className={styles.nameChevron} />
            </button>
          ) : (
            <h3 className={styles.name}>{station.name}</h3>
          )}
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

      <div className={styles.footer}>
        <div className={styles.statusWrap}>
          <span className={[styles.dot, station.isRenting ? styles.dotOpen : styles.dotClosed].join(' ')} />
          <span className={styles.statusText}>{statusText}</span>
        </div>

        <div className={styles.actions}>
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

      {/* Deux alertes distinctes, nommées explicitement : « dès qu'un vélo
          revient » (station vide → dispo) ou « avant qu'il n'y en ait plus »
          (passage sous un seuil). L'ancien champ seuil vide = dès dispo
          n'exprimait pas ce basculement. */}
      {isAlerted && onSetThreshold && (
        <div className={styles.thresholdRow}>
          <div className={styles.modeRow}>
            <button
              className={[styles.modeBtn, alertThreshold == null ? styles.modeActive : ''].join(' ')}
              aria-pressed={alertThreshold == null}
              onClick={() => onSetThreshold(station.id, null)}
            >
              Dès qu'un vélo revient
            </button>
            <button
              className={[styles.modeBtn, alertThreshold != null ? styles.modeActive : ''].join(' ')}
              aria-pressed={alertThreshold != null}
              onClick={() => onSetThreshold(station.id, alertThreshold ?? 2)}
            >
              Avant qu'il n'y en ait plus
            </button>
          </div>
          {alertThreshold != null && (
            <label className={styles.thresholdField}>
              <span className={styles.thresholdLabel}>Me prévenir quand il reste</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="30"
                value={alertThreshold}
                onChange={(e) => onSetThreshold(station.id, e.target.value !== '' ? e.target.value : 0)}
                aria-label="Seuil d'alerte en nombre de vélos"
                className={styles.thresholdInput}
              />
              <span className={styles.thresholdLabel}>vélo{alertThreshold > 1 ? 's' : ''} ou moins</span>
            </label>
          )}
        </div>
      )}
    </div>
  )
}
