import { useState } from 'react'
import { PersonStanding, Bike, ParkingSquare, MapPin, Volume2, VolumeX, X, ChevronUp, ChevronDown } from 'lucide-react'
import { maneuverIcon, maneuverLabel } from '../navigation'
import { formatRouteDistance } from '../route'
import type { ParsedRoute, RouteStep, VoiceNavApi } from '../types'
import styles from './WalkNavOverlay.module.css'

/** Cible de marche : une station Vélo'v ou une destination générique. */
export interface WalkTarget {
  name?: string
  label?: string
  address?: string
  availableBikes?: number
  availableStands?: number
  lat: number
  lng: number
}

function findCurrentStep(route: ParsedRoute | null, progress: number | null): { currentStep: RouteStep | null; currentIdx: number } {
  if (!route?.steps?.length) return { currentStep: null, currentIdx: -1 }
  if (progress === null) return { currentStep: route.steps[0], currentIdx: 0 }
  const target = (route.distance ?? 0) * (progress / 100)
  let cum = 0
  for (let i = 0; i < route.steps.length; i++) {
    cum += route.steps[i].distance ?? 0
    if (cum >= target) return { currentStep: route.steps[i], currentIdx: i }
  }
  const last = route.steps.length - 1
  return { currentStep: route.steps[last], currentIdx: last }
}

function walkIcon(step: RouteStep): string {
  const { type } = step.maneuver
  if (type === 'depart') return '🚶'
  if (type === 'arrive') return '📍'
  return maneuverIcon(step)
}

export interface WalkNavOverlayProps {
  station: WalkTarget
  route: ParsedRoute | null
  loading?: boolean
  progress: number | null
  distToStation: number | null
  voiceNav?: VoiceNavApi
  onStop: () => void
}

export function WalkNavOverlay({ station, route, loading = false, progress, distToStation, voiceNav, onStop }: WalkNavOverlayProps) {
  const [expanded, setExpanded] = useState(false)
  const { currentStep, currentIdx } = findCurrentStep(route, progress)

  const distStr = distToStation != null
    ? distToStation < 1000 ? `${Math.round(distToStation)}m` : `${(distToStation / 1000).toFixed(1)}km`
    : null

  const etaMins = route?.duration != null
    ? Math.max(1, Math.ceil(route.duration * (1 - (progress ?? 0) / 100) / 60))
    : null

  return (
    <div className={styles.anchor}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.target}>
            <PersonStanding size={24} className={styles.targetIcon} />
            <div style={{ minWidth: 0 }}>
              <p className={styles.kicker}>En route vers</p>
              <p className={styles.targetName}>{station.name}</p>
            </div>
          </div>
          <div className={styles.headRight}>
            {distStr && (
              <div className={styles.distWrap}>
                <p className={styles.dist}>{distStr}</p>
                {etaMins && <p className={styles.eta}>~{etaMins} min</p>}
              </div>
            )}
            {voiceNav?.supported && !loading && route && (
              <button
                onClick={voiceNav.active ? voiceNav.stopNavigation : voiceNav.startNavigation}
                aria-label={voiceNav.active ? 'Couper la navigation audio' : 'Démarrer la navigation audio'}
                className={[styles.voiceBtn, voiceNav.active ? styles.voiceActive : ''].join(' ')}
              >
                {voiceNav.active ? <Volume2 size={20} /> : <VolumeX size={20} />}
              </button>
            )}
            <button onClick={onStop} aria-label="Arrêter la navigation" className={styles.stopBtn}><X size={18} /></button>
          </div>
        </div>

        {progress !== null && (
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        )}

        {loading ? (
          <div className={styles.note}><span>⟳</span> Calcul de l'itinéraire…</div>
        ) : !route ? (
          <div className={[styles.note, styles.noteWarn].join(' ')}><span>⚠️</span> Itinéraire indisponible — suivez votre GPS.</div>
        ) : currentStep ? (
          <button onClick={() => setExpanded(!expanded)} className={styles.current}>
            <span className={styles.currentIcon}>{walkIcon(currentStep)}</span>
            <p className={styles.currentText}>
              {maneuverLabel(currentStep)}
              {currentStep.name && <span className={styles.currentStreet}> sur {currentStep.name}</span>}
            </p>
            {currentStep.distance != null && currentStep.distance > 0 && (
              <span className={styles.currentDist}>{formatRouteDistance(currentStep.distance)}</span>
            )}
            <span className={styles.chev}>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
          </button>
        ) : null}

        {expanded && route?.steps?.length ? (
          <div className={styles.list}>
            {route.steps.map((step, i) => (
              <div key={i} className={[styles.step, i === currentIdx ? styles.stepActive : ''].join(' ')}>
                <span className={styles.stepIcon}>{walkIcon(step)}</span>
                <p className={[styles.stepText, i === currentIdx ? styles.stepTextActive : ''].join(' ')}>
                  {maneuverLabel(step)}{step.name && ` sur ${step.name}`}
                </p>
                {step.distance != null && step.distance > 0 && (
                  <span className={styles.stepDist}>{formatRouteDistance(step.distance)}</span>
                )}
              </div>
            ))}
          </div>
        ) : null}

        <div className={styles.foot}>
          {station.availableBikes != null ? (
            <>
              <span className={[styles.footStat, station.availableBikes > 0 ? styles.footBikes : styles.footEmpty].join(' ')}>
                {station.availableBikes} <Bike size={14} /> vélo{station.availableBikes > 1 ? 's' : ''}
              </span>
              <span className={[styles.footStat, (station.availableStands ?? 0) > 0 ? styles.footStands : styles.footEmpty].join(' ')}>
                {station.availableStands} <ParkingSquare size={14} /> place{(station.availableStands ?? 0) > 1 ? 's' : ''}
              </span>
              <p className={styles.footAddr}>{station.address}</p>
            </>
          ) : (
            <p className={styles.footDest}><MapPin size={14} /> {station.name ?? station.label ?? 'Destination'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
