import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ChevronLeft, Plus, Minus, Play, Pause, RotateCcw, X, SkipForward, Trash2, Bookmark,
} from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import { useMember } from '../../auth/useMember'
import {
  MODE_META, MODE_ORDER, DEFAULT_CONFIG, configSummary, totalDuration, fmtClock, isCountUp,
} from './training'
import type { TrainingMode, TrainingConfig } from './training'
import {
  useTrainingPresets, useAddTrainingPreset, useDeleteTrainingPreset,
  useTrainingSessions, useLogTrainingSession, useTrainingRealtime,
} from './useTraining'
import { useTrainingTimer } from './useTrainingTimer'
import styles from './TrainingPage.module.css'

type Screen =
  | { name: 'list' }
  | { name: 'config'; mode: TrainingMode; config: TrainingConfig; presetName?: string }
  | { name: 'run';    mode: TrainingMode; config: TrainingConfig; title: string }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TrainingPage() {
  useTrainingRealtime()
  const { data: presets = [] }   = useTrainingPresets()
  const { data: sessions = [] }  = useTrainingSessions(15)
  const addPreset    = useAddTrainingPreset()
  const deletePreset = useDeleteTrainingPreset()

  const [screen, setScreen] = useState<Screen>({ name: 'list' })

  if (screen.name === 'run') {
    return (
      <RunScreen
        mode={screen.mode}
        config={screen.config}
        title={screen.title}
        onExit={() => setScreen({ name: 'list' })}
      />
    )
  }

  if (screen.name === 'config') {
    return (
      <ConfigScreen
        mode={screen.mode}
        initialConfig={screen.config}
        presetName={screen.presetName}
        onBack={() => setScreen({ name: 'list' })}
        onStart={(config, title) => setScreen({ name: 'run', mode: screen.mode, config, title })}
        onSavePreset={(name, config) => addPreset.mutate({ name, mode: screen.mode, config })}
      />
    )
  }

  // ── Liste ──
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Training</h1>
      </header>

      {/* Modes */}
      <p className={styles.sectionLabel}>Choisir un format</p>
      <div className={styles.modeGrid}>
        {MODE_ORDER.map(mode => {
          const m = MODE_META[mode]
          return (
            <button
              key={mode}
              className={styles.modeCard}
              style={{ borderColor: `${m.color}59` }}
              onClick={() => setScreen({ name: 'config', mode, config: { ...DEFAULT_CONFIG[mode] } })}
            >
              <span
                className={styles.modeEmoji}
                style={{ background: `${m.color}33`, boxShadow: `inset 0 0 0 1.5px ${m.color}` }}
              >
                {m.emoji}
              </span>
              <span className={styles.modeName}>{m.label}</span>
              <span className={styles.modeDesc}>{m.desc}</span>
            </button>
          )
        })}
      </div>

      {/* Presets partagés */}
      {presets.length > 0 && (
        <>
          <p className={styles.sectionLabel}>Mes séances</p>
          <div className={styles.presetList}>
            {presets.map(p => (
              <div key={p.id} className={styles.presetRow}>
                <button
                  className={styles.presetMain}
                  onClick={() => setScreen({ name: 'config', mode: p.mode, config: p.config, presetName: p.name })}
                >
                  <span
                    className={styles.presetEmoji}
                    style={{ background: `${MODE_META[p.mode].color}33`, boxShadow: `inset 0 0 0 1.5px ${MODE_META[p.mode].color}` }}
                  >
                    {MODE_META[p.mode].emoji}
                  </span>
                  <span className={styles.presetInfo}>
                    <span className={styles.presetName}>{p.name}</span>
                    <span className={styles.presetSub}>{MODE_META[p.mode].label} · {configSummary(p.mode, p.config)}</span>
                  </span>
                </button>
                <button
                  className={styles.presetDelete}
                  onClick={() => deletePreset.mutate(p.id)}
                  aria-label="Supprimer"
                >
                  <Trash2 size={15} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Historique */}
      {sessions.length > 0 && (
        <>
          <p className={styles.sectionLabel}>Dernières séances</p>
          <div className={styles.historyCard}>
            <ul className={styles.historyList}>
              {sessions.map(s => (
                <li key={s.id} className={styles.historyRow}>
                  <span className={styles.historyEmoji}>{MODE_META[s.mode]?.emoji ?? '🏋️'}</span>
                  <span className={styles.historyName}>{s.name}</span>
                  <span className={styles.historyDur}>{fmtClock(s.duration_seconds)}</span>
                  <span className={styles.historyDate}>
                    {format(new Date(s.completed_at), 'd MMM', { locale: fr })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

// ── Stepper ─────────────────────────────────────────────────────────────────────

function Stepper({ label, value, setValue, step, min, max, fmt }: {
  label: string
  value: number
  setValue: (v: number) => void
  step: number
  min: number
  max: number
  fmt?: (v: number) => string
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className={styles.stepper}>
      <span className={styles.stepperLabel}>{label}</span>
      <div className={styles.stepperControls}>
        <button type="button" className={styles.stepperBtn} onClick={() => setValue(clamp(value - step))} aria-label="Moins">
          <Minus size={16} strokeWidth={2.5} />
        </button>
        <span className={styles.stepperValue}>{fmt ? fmt(value) : value}</span>
        <button type="button" className={styles.stepperBtn} onClick={() => setValue(clamp(value + step))} aria-label="Plus">
          <Plus size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}

// ── Config screen ─────────────────────────────────────────────────────────────

function ConfigScreen({ mode, initialConfig, presetName, onBack, onStart, onSavePreset }: {
  mode: TrainingMode
  initialConfig: TrainingConfig
  presetName?: string
  onBack: () => void
  onStart: (config: TrainingConfig, title: string) => void
  onSavePreset: (name: string, config: TrainingConfig) => void
}) {
  const m = MODE_META[mode]
  const [cfg, setCfg] = useState<TrainingConfig>({ ...initialConfig })
  const [showSave, setShowSave] = useState(false)
  const [saveName, setSaveName] = useState(presetName ?? '')
  const set = (patch: Partial<TrainingConfig>) => setCfg(c => ({ ...c, ...patch }))

  const total = totalDuration(mode, cfg)
  const title = presetName ?? m.label

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backLink} onClick={onBack} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </button>
        <h1 className={styles.pageTitle}>{m.emoji} {title}</h1>
      </header>

      <p className={styles.configHint}>{m.desc}</p>

      <div className={styles.configCard}>
        <Stepper label="Décompte avant départ" value={cfg.prepare ?? 0} setValue={v => set({ prepare: v })} step={5} min={0} max={60} fmt={v => `${v}s`} />

        {(mode === 'tabata' || mode === 'intervals') && (
          <>
            <Stepper label="Effort" value={cfg.work ?? 20} setValue={v => set({ work: v })} step={5} min={5} max={600} fmt={v => `${v}s`} />
            <Stepper label="Repos" value={cfg.rest ?? 10} setValue={v => set({ rest: v })} step={5} min={0} max={600} fmt={v => `${v}s`} />
            <Stepper label="Rounds" value={cfg.rounds ?? 8} setValue={v => set({ rounds: v })} step={1} min={1} max={50} />
          </>
        )}

        {mode === 'emom' && (
          <>
            <Stepper label="Intervalle" value={cfg.interval ?? 60} setValue={v => set({ interval: v })} step={15} min={15} max={600} fmt={fmtClock} />
            <Stepper label="Rounds" value={cfg.rounds ?? 10} setValue={v => set({ rounds: v })} step={1} min={1} max={60} />
          </>
        )}

        {mode === 'amrap' && (
          <Stepper label="Durée" value={cfg.duration ?? 600} setValue={v => set({ duration: v })} step={60} min={60} max={3600} fmt={fmtClock} />
        )}

        {mode === 'fortime' && (
          <>
            <Stepper label="Objectif (tours)" value={cfg.target ?? 0} setValue={v => set({ target: v })} step={1} min={0} max={50} fmt={v => v === 0 ? 'Aucun' : String(v)} />
            <Stepper label="Plafond (0 = aucun)" value={cfg.cap ?? 0} setValue={v => set({ cap: v })} step={60} min={0} max={3600} fmt={v => v === 0 ? 'Aucun' : fmtClock(v)} />
          </>
        )}
      </div>

      {!isCountUp(mode) && (
        <p className={styles.totalLine}>Durée totale ≈ <strong>{fmtClock(total)}</strong></p>
      )}

      <div className={styles.configActions}>
        <button className={styles.startBtn} onClick={() => onStart(cfg, title)}>
          <Play size={18} strokeWidth={2.5} fill="currentColor" /> Démarrer
        </button>
        <button className={styles.saveBtn} onClick={() => { setSaveName(presetName ?? ''); setShowSave(true) }}>
          <Bookmark size={15} strokeWidth={2} /> Enregistrer
        </button>
      </div>

      {showSave && (
        <SlideUpModal title="Enregistrer la séance" onClose={() => setShowSave(false)}>
          <form
            className={styles.saveForm}
            onSubmit={e => { e.preventDefault(); if (saveName.trim()) { onSavePreset(saveName.trim(), cfg); setShowSave(false) } }}
          >
            <input
              type="text"
              className={styles.saveInput}
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Ex : Tabata abdos, EMOM jambes…"
              autoFocus
            />
            <button type="submit" className={styles.startBtn} disabled={!saveName.trim()}>
              Enregistrer le preset
            </button>
          </form>
        </SlideUpModal>
      )}
    </div>
  )
}

// ── Run screen ──────────────────────────────────────────────────────────────────

const PHASE_COLOR: Record<string, string> = {
  prepare: '#F0C95B', // jaune doré — prépare-toi
  work:    '#FF7A45', // orange vif — effort
  rest:    '#5AAEE6', // bleu ciel — repos
  done:    '#6FD08A', // vert vif — réussite
}

const RING = { size: 290, r: 135 }
const RING_C = 2 * Math.PI * RING.r

function RunScreen({ mode, config, title, onExit }: {
  mode: TrainingMode
  config: TrainingConfig
  title: string
  onExit: () => void
}) {
  const { view, taps, start, pause, resume, reset, skip, addTap } = useTrainingTimer(mode, config)
  const logSession = useLogTrainingSession()
  const { data: member } = useMember()
  const loggedRef = useRef(false)
  const startedRef = useRef(false)
  const [confirmExit, setConfirmExit] = useState(false)

  useEffect(() => {
    if (!startedRef.current) { startedRef.current = true; start() }
  }, [start])

  useEffect(() => {
    if (view.status === 'done' && !loggedRef.current) {
      loggedRef.current = true
      logSession.mutate({ name: title, mode, duration_seconds: view.elapsedTotal })
    }
  }, [view.status, view.elapsedTotal, title, mode, logSession])

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
  else if (view.totalRounds > 0) subtitle = `Ronde ${view.round} / ${view.totalRounds}`

  function handleClose() {
    if (view.status === 'running' || view.status === 'paused') setConfirmExit(true)
    else { reset(); onExit() }
  }

  return (
    <div className={styles.runRoot}>
      <button className={styles.runClose} onClick={handleClose} aria-label="Quitter">
        <X size={22} strokeWidth={2.5} />
      </button>

      <div className={styles.runTop}>
        <span className={styles.runEyebrow}>{title}</span>
      </div>

      <div className={styles.runCenter}>
        <div className={styles.ringWrap} style={{ width: RING.size, height: RING.size }}>
          <svg width={RING.size} height={RING.size} className={styles.ringSvg}>
            <circle cx={RING.size / 2} cy={RING.size / 2} r={RING.r} fill="none"
              stroke="rgba(244,240,230,0.1)" strokeWidth={10} />
            <circle cx={RING.size / 2} cy={RING.size / 2} r={RING.r} fill="none"
              stroke={color} strokeWidth={10} strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - (done ? 1 : view.progress))}
              transform={`rotate(-90 ${RING.size / 2} ${RING.size / 2})`}
              style={{
                transition: 'stroke-dashoffset 0.2s linear, stroke 0.4s ease',
                filter: `drop-shadow(0 0 7px ${color}99)`,
              }}
            />
          </svg>
          <div className={styles.ringInner}>
            <span className={styles.runPhase} style={{ color }}>{phaseLabel.toUpperCase()}</span>
            <span className={styles.runBig}>{big}</span>
            {subtitle && <span className={styles.runSub}>{subtitle}</span>}
          </div>
        </div>

        {done && member?.display_name && (
          <span className={styles.runBravo}>Bravo {member.display_name} 💪</span>
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
            <button className={styles.runCtrlBtn} onClick={handleClose} aria-label="Terminer">
              <X size={20} strokeWidth={2.5} />
            </button>
          </>
        )}
      </div>

      {confirmExit && (
        <div className={styles.exitOverlay} onClick={() => setConfirmExit(false)}>
          <div className={styles.exitSheet} onClick={e => e.stopPropagation()}>
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
    </div>
  )
}
