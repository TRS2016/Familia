import { Volume2, Square } from 'lucide-react'
import { maneuverIcon, maneuverLabel } from '../navigation'
import type { VoiceNavApi } from '../types'
import styles from './FloatingNavBanner.module.css'

export function FloatingNavBanner({ voiceNav }: { voiceNav: VoiceNavApi }) {
  const { active, currentStepData, nextStepData, distToNextManeuver, repeatCurrent, stopNavigation } = voiceNav

  if (!active || !currentStepData) return null

  const icon = maneuverIcon(currentStepData)
  const label = maneuverLabel(currentStepData)
  const dist = distToNextManeuver

  return (
    <div className={styles.bar} role="status" aria-live="polite">
      <div className={styles.inner}>
        <span className={styles.icon} aria-hidden="true">{icon}</span>

        <div className={styles.main}>
          <p className={styles.label}>
            {label}
            {currentStepData.name ? <span className={styles.labelStreet}> sur {currentStepData.name}</span> : null}
          </p>
          {dist != null && (
            <p className={styles.dist}>
              Dans {dist < 100 ? `${Math.round(dist)} m` : `${Math.round(dist / 10) * 10} m`}
            </p>
          )}
          {nextStepData && (
            <p className={styles.nextStep}>
              <span className={styles.nextLabel}>Ensuite :</span>{' '}
              {maneuverIcon(nextStepData)} {maneuverLabel(nextStepData)}
              {nextStepData.name ? ` sur ${nextStepData.name}` : ''}
            </p>
          )}
        </div>

        <button onClick={repeatCurrent} aria-label="Répéter l'instruction" className={[styles.actionBtn, styles.repeat].join(' ')}>
          <Volume2 size={20} />
        </button>
        <button onClick={stopNavigation} aria-label="Arrêter la navigation vocale" className={[styles.actionBtn, styles.stop].join(' ')}>
          <Square size={20} fill="currentColor" />
        </button>
      </div>
    </div>
  )
}
