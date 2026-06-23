import { useState, useRef, useEffect } from 'react'
import { X, Play, Pause, RotateCcw, SkipForward, Video, Volume2, VolumeX, Megaphone, Flag } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import MediaPlayer from '../media/MediaPlayer'
import { useMember } from '../../auth/useMember'
import { useBoolPref } from '../../lib/usePrefs'
import { useWakeLock } from '../../lib/useWakeLock'
import { MODE_META, fmtClock, isCountUp, normalizeExercises, exerciseHasVideo } from './training'
import type { TrainingMode, TrainingConfig, Exercise } from './training'
import { useTrainingTimer } from './useTrainingTimer'
import { useLogTrainingSession, useTrainingRecords } from './useTraining'
import styles from './TrainingPage.module.css'

const PHASE_COLOR: Record<string, string> = {
  prepare: '#C7BFA8', // tan neutre — prépare-toi
  work:    '#E8643A', // orange brûlé — effort
  rest:    '#3D80B8', // bleu — repos
  done:    '#4F7D3A', // vert — terminé
}

const RING = { size: 290, r: 135 }
const RING_C = 2 * Math.PI * RING.r

export default function RunScreen({ mode, config, title, onExit }: {
  mode: TrainingMode
  config: TrainingConfig
  title: string
  onExit: () => void
}) {
  const [muted, setMuted] = useBoolPref('training.muted', false)
  const [voice, setVoice] = useBoolPref('training.voice', false)
  const { view, taps, start, pause, resume, reset, skip, addTap, finish } = useTrainingTimer(mode, config, { muted, voice })
  useWakeLock(view.status === 'running' || view.status === 'paused')
  const logSession = useLogTrainingSession()
  const { data: member } = useMember()
  const { data: records } = useTrainingRecords()
  const loggedRef = useRef(false)
  const startedRef = useRef(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [videoEx, setVideoEx] = useState<Exercise | null>(null)

  // Record For Time : capture le meilleur temps connu AVANT cette séance.
  // Seulement pour une séance nommée (preset) : les runs anonymes partagent tous
  // le libellé du mode (« For Time »), ce qui mélangerait des records sans rapport.
  const isNamed = title !== MODE_META[mode].label
  const [prevBest, setPrevBest] = useState<number | undefined>(undefined)
  const prevBestCaptured = useRef(false)
  useEffect(() => {
    if (!prevBestCaptured.current && isNamed && mode === 'fortime' && records) {
      prevBestCaptured.current = true
      setPrevBest(records[title])
    }
  }, [records, title, mode, isNamed])

  const exObjs = normalizeExercises(config.exercises)
  const isCircuit = mode === 'amrap' || mode === 'fortime' // exercices = circuit (pas de défilement)
  // Démo : exo courant pendant l'effort, exo suivant pendant le repos/décompte.
  const demoEx = view.kind === 'work' ? view.exerciseObj : view.exerciseNextObj
  // Phases d'attente : on lance la démo du prochain exo automatiquement.
  const isRestLike = view.kind === 'prepare' || view.kind === 'rest'
  // Démo affichée inline pendant l'effort (toggle « Voir la démo »).
  const [workDemo, setWorkDemo]     = useState(false)
  const [demoClosed, setDemoClosed] = useState(false) // fermée pour la phase en cours
  // Tout se réinitialise à chaque nouvelle phase (ajustement pendant le rendu).
  const [prevPhaseIndex, setPrevPhaseIndex] = useState(view.phaseIndex)
  if (prevPhaseIndex !== view.phaseIndex) {
    setPrevPhaseIndex(view.phaseIndex)
    setWorkDemo(false)
    setDemoClosed(false)
  }
  const inlineDemo = exerciseHasVideo(demoEx ?? undefined) && (isRestLike || workDemo)
  const showDemo   = inlineDemo && !demoClosed
  // Démo affichée : anneau réduit, vidéo agrandie.
  const demoPlaying = !isCircuit && showDemo

  function closeDemo() { setDemoClosed(true); setWorkDemo(false) }

  useEffect(() => {
    if (!startedRef.current) { startedRef.current = true; start() }
  }, [start])

  useEffect(() => {
    if (view.status === 'done' && !loggedRef.current) {
      loggedRef.current = true
      // Les tours ne comptent que pour les modes au score (AMRAP / For Time).
      const rounds = (mode === 'amrap' || mode === 'fortime') ? taps : null
      logSession.mutate({ name: title, mode, duration_seconds: view.elapsedTotal, focus: config.focus ?? null, rounds })
    }
  }, [view.status, view.elapsedTotal, title, mode, config.focus, taps, logSession])

  const color = view.status === 'done' ? PHASE_COLOR.done : (PHASE_COLOR[view.kind] ?? PHASE_COLOR.prepare)
  const done  = view.status === 'done'
  const showTap = !done && (mode === 'amrap' || mode === 'fortime')

  const big = done
    ? '✓'
    : (mode === 'fortime' || view.value >= 60 ? fmtClock(view.value) : String(view.value))

  const phaseLabel = done ? 'Terminé'
    : view.kind === 'prepare' ? 'Prêt ?'
    : mode === 'fortime' ? 'For Time'
    : mode === 'amrap' ? 'AMRAP'
    : view.kind === 'rest' ? 'Repos' : 'Effort'

  let subtitle = ''
  if (done) subtitle = `Séance de ${fmtClock(view.elapsedTotal)}`
  else if (mode === 'amrap') subtitle = `${taps} tour${taps > 1 ? 's' : ''}`
  else if (mode === 'fortime') subtitle = `${taps} / ${config.target ?? 0} tours`
  else if (view.totalRounds > 0) {
    subtitle = view.totalSets > 1
      ? `Série ${view.set}/${view.totalSets} · Ronde ${view.round}/${view.totalRounds}`
      : `Ronde ${view.round} / ${view.totalRounds}`
  }

  // Record For Time : la séance compte si l'objectif est atteint (ou sans objectif)
  const ftCompleted = mode === 'fortime' && (!config.target || taps >= config.target)
  const isNewRecord = done && ftCompleted && isNamed && (prevBest === undefined || view.elapsedTotal < prevBest)

  function handleClose() {
    if (view.status === 'running' || view.status === 'paused') setConfirmExit(true)
    else { reset(); onExit() }
  }

  // Fermeture clavier (Échap) de la confirmation de sortie.
  useEffect(() => {
    if (!confirmExit) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmExit(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmExit])

  return (
    <div className={styles.runRoot}>
      {/* Flash de couleur à chaque changement de phase (re-monté via key) */}
      {view.status === 'running' && !done && (
        <div key={view.phaseIndex} className={styles.phaseFlash} style={{ background: color }} />
      )}
      <button className={styles.runClose} onClick={handleClose} aria-label="Quitter">
        <X size={22} strokeWidth={2.5} />
      </button>

      <div className={styles.runInner}>
      <div className={styles.runTop}>
        <span className={styles.runEyebrow}>{title}</span>
        <div className={styles.runToggles}>
          <button
            className={[styles.runToggle, voice ? styles.runToggleOn : ''].join(' ')}
            onClick={() => setVoice(!voice)}
            aria-label={voice ? 'Couper les annonces vocales' : 'Activer les annonces vocales'}
            aria-pressed={voice}
            title="Annonces vocales"
          >
            <Megaphone size={17} strokeWidth={2} />
          </button>
          <button
            className={[styles.runToggle, muted ? styles.runToggleMuted : ''].join(' ')}
            onClick={() => setMuted(!muted)}
            aria-label={muted ? 'Réactiver le son' : 'Couper le son'}
            aria-pressed={muted}
            title="Son"
          >
            {muted ? <VolumeX size={17} strokeWidth={2} /> : <Volume2 size={17} strokeWidth={2} />}
          </button>
        </div>
      </div>

      <div className={styles.runCenter}>
        <div className={[styles.ringWrap, demoPlaying ? styles.ringWrapCompact : ''].join(' ')}>
          <svg viewBox={`0 0 ${RING.size} ${RING.size}`} className={styles.ringSvg}>
            <circle cx={RING.size / 2} cy={RING.size / 2} r={RING.r} fill="none"
              stroke="rgba(244,240,230,0.12)" strokeWidth={5} />
            <circle cx={RING.size / 2} cy={RING.size / 2} r={RING.r} fill="none"
              stroke={color} strokeWidth={5} strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - (done ? 1 : view.progress))}
              transform={`rotate(-90 ${RING.size / 2} ${RING.size / 2})`}
              style={{ transition: 'stroke-dashoffset 0.3s linear, stroke 0.4s ease' }}
            />
          </svg>
          <div className={styles.ringInner}>
            <span className={styles.runPhase} style={{ color }}>{phaseLabel.toUpperCase()}</span>
            <span className={styles.runBig}>{big}</span>
            {subtitle && <span className={styles.runSub}>{subtitle}</span>}
          </div>
        </div>

        {/* Progression globale — points de rounds (modes multi-phases) */}
        {!done && !isCircuit && view.totalRounds > 1 && (
          <div className={styles.roundDots} aria-label={`Round ${view.round} sur ${view.totalRounds}`}>
            {Array.from({ length: view.totalRounds }).map((_, i) => {
              const isCurrent = i === view.round - 1
              const isDone    = i < view.round - 1
              return (
                <span
                  key={i}
                  className={[
                    styles.roundDot,
                    isDone ? styles.roundDotDone : '',
                    isCurrent ? styles.roundDotCurrent : '',
                  ].join(' ')}
                  style={isCurrent || isDone ? { background: color, borderColor: color } : undefined}
                />
              )
            })}
          </div>
        )}

        {!done && !isCircuit && (view.exercise || view.exerciseNext || exerciseHasVideo(demoEx ?? undefined)) && (
          <div className={styles.exerciseBox}>
            {view.exercise ? (
              <span className={styles.exerciseCurrent} style={{ color }}>{view.exercise}</span>
            ) : view.exerciseNext ? (
              <span className={styles.exerciseUpcoming}>Prochain : {view.exerciseNext}</span>
            ) : null}
            {view.exercise && view.exerciseNext && (
              <span className={styles.exerciseUpcoming}>puis {view.exerciseNext}</span>
            )}
            {exerciseHasVideo(demoEx ?? undefined) && (
              showDemo ? (
                <div className={[styles.demoInline, styles.demoInlineLarge].join(' ')}>
                  <MediaPlayer
                    key={demoEx!.videoPath ?? demoEx!.videoUrl}
                    filePath={demoEx!.videoPath ?? null}
                    externalUrl={demoEx!.videoUrl ?? null}
                    mimeType={demoEx!.videoMime ?? null}
                    title={demoEx!.name}
                    autoPlay
                    muted
                    loop
                  />
                  <button className={styles.demoClose} onClick={closeDemo} aria-label="Fermer la vidéo">
                    <X size={18} strokeWidth={2.5} />
                  </button>
                </div>
              ) : view.kind === 'work' ? (
                <button className={styles.demoBtn} onClick={() => { setDemoClosed(false); setWorkDemo(true) }}>
                  <Video size={14} strokeWidth={2} /> Voir la démo
                </button>
              ) : null
            )}
          </div>
        )}

        {/* Circuit (AMRAP / For Time) — liste des exercices */}
        {!done && isCircuit && exObjs.length > 0 && (
          <div className={styles.circuit}>
            <span className={styles.circuitLabel}>Circuit</span>
            <ul className={styles.circuitList}>
              {exObjs.map((ex, i) => (
                <li key={i} className={styles.circuitItem}>
                  <span className={styles.circuitName}>{ex.name}</span>
                  {exerciseHasVideo(ex) && (
                    <button className={styles.circuitDemo} onClick={() => setVideoEx(ex)} aria-label="Démo">
                      <Video size={13} strokeWidth={2} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {done && member?.display_name && (
          <span className={styles.runBravo}>Bravo {member.display_name} 💪</span>
        )}

        {done && mode === 'fortime' && ftCompleted && (
          isNewRecord ? (
            <span className={styles.runRecord}>🏆 Nouveau record · {fmtClock(view.elapsedTotal)}</span>
          ) : prevBest !== undefined ? (
            <span className={styles.runRecordPrev}>Record : {fmtClock(prevBest)}</span>
          ) : null
        )}

        {showTap && (
          <button className={styles.tapBtn} onClick={addTap}>
            +1 tour{mode === 'fortime' && config.target ? ` · ${taps}/${config.target}` : taps > 0 ? ` · ${taps}` : ''}
          </button>
        )}
      </div>

      <div className={styles.runControls}>
        {done ? (
          <>
            <button className={styles.runCtrlBtn} onClick={() => { loggedRef.current = false; reset(); start() }}>
              <RotateCcw size={20} strokeWidth={2.5} /> Refaire
            </button>
            <button className={styles.runCtrlBtnPrimary} onClick={onExit}>Terminer</button>
          </>
        ) : (
          <>
            {!isCountUp(mode) && (
              <button className={styles.runCtrlBtn} onClick={skip} aria-label="Phase suivante">
                <SkipForward size={20} strokeWidth={2.5} />
              </button>
            )}
            <button
              className={styles.runCtrlBtnPrimary}
              onClick={() => view.status === 'running' ? pause() : resume()}
            >
              {view.status === 'running'
                ? <><Pause size={20} strokeWidth={2.5} fill="currentColor" /> Pause</>
                : <><Play size={20} strokeWidth={2.5} fill="currentColor" /> Reprendre</>}
            </button>
            {isCountUp(mode) ? (
              // For Time : termine et enregistre la séance (sinon, sans plafond ni
              // objectif, le chrono ne pourrait jamais être validé — il faut le
              // bouton d'abandon en haut, qui lui n'enregistre rien).
              <button className={styles.runCtrlBtn} onClick={finish} aria-label="Terminer la séance">
                <Flag size={20} strokeWidth={2.5} />
              </button>
            ) : (
              <button className={styles.runCtrlBtn} onClick={handleClose} aria-label="Quitter">
                <X size={20} strokeWidth={2.5} />
              </button>
            )}
          </>
        )}
      </div>
      </div>{/* /runInner */}

      {confirmExit && (
        <div className={styles.exitOverlay} onClick={() => setConfirmExit(false)}>
          <div className={styles.exitSheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <span className={styles.exitEyebrow}>Chrono en cours</span>
            <p className={styles.exitTitle}>Arrêter le chrono ?</p>
            <p className={styles.exitText}>Le minuteur en cours sera remis à zéro.</p>
            <button className={styles.exitContinue} onClick={() => setConfirmExit(false)}>
              Continuer le chrono
            </button>
            <button className={styles.exitStop} onClick={() => { reset(); onExit() }}>
              Arrêter et quitter
            </button>
          </div>
        </div>
      )}

      {videoEx && (
        <SlideUpModal title={videoEx.name || 'Démo'} onClose={() => setVideoEx(null)}>
          <div className={styles.demoPlayer}>
            <MediaPlayer
              filePath={videoEx.videoPath ?? null}
              externalUrl={videoEx.videoUrl ?? null}
              mimeType={videoEx.videoMime ?? null}
              title={videoEx.name}
            />
          </div>
        </SlideUpModal>
      )}
    </div>
  )
}
