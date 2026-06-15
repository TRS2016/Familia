import { useState } from 'react'
import { PersonStanding, Bike, Volume2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatRouteDistance } from '../route'
import { maneuverIcon, maneuverLabel } from '../navigation'
import type { RouteStep, VoiceNavApi } from '../types'
import styles from './NavigationPanel.module.css'

function StepList({ steps, activeIdx = -1, walk = false }: { steps: RouteStep[]; activeIdx?: number; walk?: boolean }) {
  return (
    <div className={[styles.list, walk ? styles.listWalk : ''].join(' ')}>
      {steps.map((step, i) => {
        const active = i === activeIdx
        return (
          <div key={i} className={[styles.step, active ? styles.stepActive : ''].join(' ')}>
            <span className={styles.stepIcon} aria-hidden="true">{maneuverIcon(step)}</span>
            <div className={styles.stepMain}>
              <p className={[styles.stepText, active ? styles.stepTextActive : ''].join(' ')}>
                {maneuverLabel(step)}
                {step.name ? <span className={styles.stepStreet}> sur {step.name}</span> : null}
              </p>
            </div>
            {step.distance != null && step.distance > 0 && (
              <span className={[styles.stepDist, active ? styles.stepDistActive : ''].join(' ')}>
                {formatRouteDistance(step.distance)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function WalkSection({ label, steps }: { label: string; steps?: RouteStep[] }) {
  const [open, setOpen] = useState(false)
  if (!steps || steps.length === 0) return null
  return (
    <div className={styles.section}>
      <button onClick={() => setOpen(!open)} className={[styles.toggle, styles.toggleWalk].join(' ')}>
        <span className={styles.toggleLabel}><PersonStanding size={16} /> {label} ({steps.length} étapes)</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <StepList steps={steps} walk />}
    </div>
  )
}

export interface NavigationPanelProps {
  steps: RouteStep[] | null | undefined
  walkToStartSteps?: RouteStep[]
  walkFromEndSteps?: RouteStep[]
  routeProgress?: number | null
  voiceNav: VoiceNavApi
}

export function NavigationPanel({ steps, walkToStartSteps, walkFromEndSteps, routeProgress, voiceNav }: NavigationPanelProps) {
  const [open, setOpen] = useState(false)
  const {
    supported, active, currentStep, startNavigation, next, prev, repeatCurrent,
    totalSteps, frenchVoiceMissing, installFrenchVoice,
  } = voiceNav

  const hasWalk = (walkToStartSteps?.length ?? 0) > 0 || (walkFromEndSteps?.length ?? 0) > 0

  if (!steps || steps.length === 0) return null

  return (
    <>
      <WalkSection label="Marche jusqu'à la station de départ" steps={walkToStartSteps} />

      <div className={styles.section}>
        <div className={styles.toggleRow}>
          <button onClick={() => setOpen(!open)} className={styles.toggle}>
            <span className={styles.toggleLabel}>
              {hasWalk ? <><Bike size={16} /> Trajet vélo</> : 'Instructions'} ({totalSteps} étapes)
            </span>
            {routeProgress != null && !active && <span className={styles.progress}>{routeProgress}%</span>}
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {supported && !active && (
            <button onClick={startNavigation} aria-label="Démarrer la navigation audio" className={styles.navBtn}>
              <Volume2 size={16} /> Navigation
            </button>
          )}
          {!supported && <span className={styles.unsupported}>Audio non supporté</span>}
        </div>

        {frenchVoiceMissing && (
          <div className={styles.voiceWarn}>
            <span>Voix française non installée (audio en anglais)</span>
            {installFrenchVoice && (
              <button onClick={installFrenchVoice} className={styles.installLink}>Installer</button>
            )}
          </div>
        )}

        {active && (
          <div className={styles.controls}>
            <button onClick={prev} disabled={currentStep === 0} aria-label="Étape précédente" className={styles.ctrlBtn}><ChevronLeft size={16} /> Préc.</button>
            <button onClick={repeatCurrent} aria-label="Répéter l'instruction" className={styles.ctrlBtn}><Volume2 size={16} /> Répéter</button>
            <button onClick={next} disabled={currentStep >= totalSteps - 1} aria-label="Étape suivante" className={styles.ctrlBtn}>Suiv. <ChevronRight size={16} /></button>
          </div>
        )}

        {open && <StepList steps={steps} activeIdx={active ? currentStep : -1} />}
      </div>

      <WalkSection label="Marche jusqu'à la destination" steps={walkFromEndSteps} />
    </>
  )
}
