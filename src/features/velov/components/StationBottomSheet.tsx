import { useState, useRef } from 'react'
import { Star, BarChart3, Bell, Map as MapIcon, PersonStanding, Navigation, X } from 'lucide-react'
import { HistoryChart } from './HistoryChart'
import type { Station } from '../types'
import styles from './StationBottomSheet.module.css'

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

export interface StationBottomSheetProps {
  station: Station | null
  onClose?: () => void
  distance?: number
  isFavorite?: boolean
  onToggleFavorite?: (id: string) => void
  isAlerted?: boolean
  onToggleAlert?: (id: string) => void
  onPlanRoute?: (s: Station) => void
  onWalkToStation?: (s: Station) => void
  hasLocation?: boolean
}

export function StationBottomSheet({
  station, onClose, distance, isFavorite, onToggleFavorite, isAlerted, onToggleAlert,
  onPlanRoute, onWalkToStation, hasLocation = false,
}: StationBottomSheetProps) {
  const [showHistory, setShowHistory] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragStartRef = useRef<number | null>(null)

  if (!station) return null

  function handleTouchStart(e: React.TouchEvent) { dragStartRef.current = e.touches[0].clientY }
  function handleTouchMove(e: React.TouchEvent) {
    if (dragStartRef.current === null) return
    const dy = e.touches[0].clientY - dragStartRef.current
    if (dy > 0) setDragY(dy)
  }
  function handleTouchEnd() {
    if (dragY > 80) onClose?.()
    setDragY(0)
    dragStartRef.current = null
  }

  const hasBikes = station.availableBikes > 0
  const hasStands = station.availableStands > 0

  function openNavigation() {
    if (!station) return
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
    <div className={styles.anchor}>
      <div
        className={styles.sheet}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateY(${dragY}px)`, transition: dragY > 0 ? 'none' : 'transform 0.2s ease-out' }}
      >
        <div className={styles.handle} />

        <div className={styles.head}>
          <div style={{ minWidth: 0 }}>
            <h3 className={styles.name}>{station.name}</h3>
            {station.address && <p className={styles.address}>{station.address}</p>}
          </div>
          <div className={styles.headActions}>
            <button
              onClick={() => onToggleFavorite?.(station.id)}
              className={[styles.iconBtn, isFavorite ? styles.favActive : ''].join(' ')}
              aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button onClick={onClose} className={styles.closeBtn} aria-label="Fermer"><X size={18} /></button>
          </div>
        </div>

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
          <div className={styles.status}>
            <span className={[styles.dot, station.isRenting ? styles.dotOpen : styles.dotClosed].join(' ')} />
            <span className={styles.statusText}>{statusText}</span>
            {distance !== undefined && <span className={styles.distChip}>{distance.toFixed(0)}m</span>}
          </div>
          <div className={styles.actions}>
            <button
              onClick={() => setShowHistory((v) => !v)}
              aria-label={showHistory ? "Masquer l'historique" : "Voir l'historique"}
              className={[styles.toolBtn, showHistory ? styles.toolActive : ''].join(' ')}
            >
              <BarChart3 size={16} />
            </button>
            <button
              onClick={() => onToggleAlert?.(station.id)}
              disabled={!station.isRenting}
              aria-label={isAlerted ? 'Alerte active' : 'Recevoir une alerte'}
              className={[styles.toolBtn, isAlerted ? styles.alertActive : ''].join(' ')}
            >
              <Bell size={14} fill={isAlerted ? 'currentColor' : 'none'} />{isAlerted && 'Active'}
            </button>
            {onPlanRoute && (
              <button onClick={() => onPlanRoute(station)} className={[styles.cta, styles.ctaPlan].join(' ')}>
                <MapIcon size={14} /> Planifier
              </button>
            )}
            {hasLocation && onWalkToStation && (
              <button onClick={() => onWalkToStation(station)} className={[styles.cta, styles.ctaWalk].join(' ')}>
                <PersonStanding size={14} /> Marcher
              </button>
            )}
            <button onClick={openNavigation} className={[styles.cta, styles.ctaGo].join(' ')}>
              <Navigation size={14} /> Y aller
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
