import { useState, useEffect } from 'react'
import { Map as MapIcon, Download, Share2, Check } from 'lucide-react'
import { formatRouteDistance, formatDuration } from '../route'
import { downloadGPX } from '../gpx'
import type { GeoLineString, ParsedRoute, RouteInfo, RoutePoint } from '../types'
import ui from './velovUi.module.css'
import styles from './RouteInfoBanner.module.css'

export interface RouteInfoBannerProps {
  route: RouteInfo | null
  origin?: RoutePoint | null
  destination?: RoutePoint | null
  routeGeometry?: GeoLineString | null
  allRoutes?: ParsedRoute[]
  activeRouteIdx?: number
  onSelectAlternative?: (idx: number) => void
  onViewOnMap?: () => void
}

export function RouteInfoBanner({
  route, origin, destination, routeGeometry,
  allRoutes = [], activeRouteIdx = 0, onSelectAlternative, onViewOnMap,
}: RouteInfoBannerProps) {
  const [arrivalTime, setArrivalTime] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!route) return
    const update = () =>
      setArrivalTime(new Date(Date.now() + route.duration * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
    const initial = setTimeout(update, 0)
    const interval = setInterval(update, 60000)
    return () => { clearTimeout(initial); clearInterval(interval) }
  }, [route])

  function handleShare() {
    if (!origin || !destination) return
    const url = new URL(window.location.href)
    url.searchParams.set('from', `${origin.lat},${origin.lng}`)
    url.searchParams.set('to', `${destination.lat},${destination.lng}`)
    void navigator.clipboard?.writeText(url.toString()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!route) return null

  const altLabels = ['Recommandé', 'Alternatif', 'Alternatif']
  const altIcons = ['🏆', '⚡', '🔀']

  return (
    <div className={[ui.section, ui.tintAccent].join(' ')}>
      <div className={[ui.inner, ui.stackTight].join(' ')}>
        <div className={styles.statsRow}>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <p className={styles.statLabel}>Distance</p>
              <p className={styles.statValue}>{route.distanceFormatted}</p>
            </div>
            <div className={styles.stat}>
              <p className={styles.statLabel}>Durée estimée</p>
              <p className={styles.statValue}>{route.durationFormatted}</p>
            </div>
            {arrivalTime && (
              <div className={styles.stat}>
                <p className={styles.statLabel}>Arrivée prévue</p>
                <p className={styles.statValue}>{arrivalTime}</p>
              </div>
            )}
          </div>

          <div className={styles.tools}>
            {onViewOnMap && (
              <button onClick={onViewOnMap} className={ui.btnPrimary}>
                <MapIcon size={16} /> Voir sur la carte
              </button>
            )}
            <button onClick={() => downloadGPX(routeGeometry)} disabled={!routeGeometry} className={ui.btnGhost} aria-label="Télécharger le tracé GPX">
              <Download size={16} /> GPX
            </button>
            {origin && destination && (
              <button onClick={handleShare} className={ui.btnGhost} aria-label="Partager l'itinéraire">
                {copied ? <><Check size={16} /> Copié !</> : <><Share2 size={16} /> Partager</>}
              </button>
            )}
          </div>
        </div>

        {allRoutes.length > 1 && (
          <div className={styles.alts}>
            <p className={styles.altsTitle}>Itinéraires disponibles</p>
            <div className={styles.altsGrid}>
              {allRoutes.map((r, i) => {
                const active = i === activeRouteIdx
                return (
                  <button
                    key={i}
                    onClick={() => onSelectAlternative?.(i)}
                    className={[styles.altBtn, active ? styles.altActive : ''].join(' ')}
                  >
                    <span className={styles.altIcon}>{altIcons[i] ?? '↪'}</span>
                    <div className={styles.altMain}>
                      <p className={styles.altLabel}>{altLabels[i] ?? `Alternative ${i}`}</p>
                      <p className={styles.altMeta}>{formatRouteDistance(r.distance)} · {formatDuration(r.duration)}</p>
                    </div>
                    {active && <span className={styles.altCheck}>✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
