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
  MODE_META, MODE_ORDER, DEFAULT_CONFIG, FOCUS_OPTIONS, configSummary, totalDuration, fmtClock, isCountUp,
} from './training'
import type { TrainingMode, TrainingConfig, TrainingPreset } from './training'
import {
  useTrainingPresets, useAddTrainingPreset, useDeleteTrainingPreset,
  useTrainingSessions, useLogTrainingSession, useTrainingRealtime,
} from './useTraining'
import { useTrainingTimer } from './useTrainingTimer'
import styles from './TrainingPage.module.css'

type Screen =
  | { name: 'home' }
  | { name: 'run'; mode: TrainingMode; config: TrainingConfig; title: string }

// ── Page (écran unique : onglets de mode + config inline) ──────────────────────

export default function TrainingPage() {
  useTrainingRealtime()
  const { data: presets = [] }  = useTrainingPresets()
  const { data: sessions = [] } = useTrainingSessions(15)
  const addPreset    = useAddTrainingPreset()
  const deletePreset = useDeleteTrainingPreset()

  const [screen, setScreen]   = useState<Screen>({ name: 'home' })
  const [mode, setMode]       = useState<TrainingMode>('tabata')
  const [configs, setConfigs] = useState<Record<TrainingMode, TrainingConfig>>(() => {
    const o = {} as Record<TrainingMode, TrainingConfig>
    for (const mm of MODE_ORDER) o[mm] = { ...DEFAULT_CONFIG[mm] }
    return o
  })
  const [presetName, setPresetName] = useState<string | undefined>(undefined)
  const [exInput, setExInput]       = useState('')
  const [focusFilter, setFocusFilter] = useState<string | null>(null)
  const [showSave, setShowSave]     = useState(false)
  const [saveName, setSaveName]     = useState('')

  const cfg = configs[mode]
  const set = (patch: Partial<TrainingConfig>) =>
    setConfigs(c => ({ ...c, [mode]: { ...c[mode], ...patch } }))
  const exercises = cfg.exercises ?? []

  function addExercise() {
    const t = exInput.trim()
    if (!t) return
    set({ exercises: [...exercises, t] })
    setExInput('')
  }
  function selectMode(m: TrainingMode) {
    setMode(m)
    setPresetName(undefined)
  }
  function loadPreset(p: TrainingPreset) {
    setMode(p.mode)
    setConfigs(c => ({ ...c, [p.mode]: { ...p.config } }))
    setPresetName(p.name)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (screen.name === 'run') {
    return (
      <RunScreen
        mode={screen.mode}
        config={screen.config}
        title={screen.title}
        onExit={() => setScreen({ name: 'home' })}
      />
    )
  }

  const m       = MODE_META[mode]
  const total   = totalDuration(mode, cfg)
  const title   = presetName ?? m.label
  const focuses = [...new Set(presets.map(p => p.config.focus).filter(Boolean))] as string[]
  const shownPresets = focusFilter ? presets.filter(p => p.config.focus === focusFilter) : presets

  // Aperçu de l'horloge (état arrêté)
  const PV = { size: 190, r: 88 }
  const PV_C = 2 * Math.PI * PV.r
  const previewBig = mode === 'fortime'
    ? (cfg.cap ? fmtClock(cfg.cap) : '∞')
    : mode === 'amrap'
    ? fmtClock(cfg.duration ?? 0)
    : fmtClock(total)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={20} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Training</h1>
      </header>

      {/* Onglets de mode — une ligne */}
      <div className={styles.modeTabs}>
        {MODE_ORDER.map(mm => (
          <button
            key={mm}
            className={[styles.modeTab, mm === mode ? styles.modeTabActive : ''].join(' ')}
            onClick={() => selectMode(mm)}
          >
            <span className={styles.modeTabEmoji}>{MODE_META[mm].emoji}</span>
            {MODE_META[mm].label}
          </button>
        ))}
      </div>

      <p className={styles.configHint}>{m.desc}</p>

      {/* Aperçu de l'horloge */}
      <div className={styles.previewWrap}>
        <div className={styles.previewRing}>
          <svg viewBox={`0 0 ${PV.size} ${PV.size}`} className={styles.ringSvg}>
            <circle cx={PV.size / 2} cy={PV.size / 2} r={PV.r} fill="none" stroke="var(--tr-line)" strokeWidth={4} />
            <circle cx={PV.size / 2} cy={PV.size / 2} r={PV.r} fill="none"
              stroke={m.color} strokeWidth={4} strokeLinecap="round"
              strokeDasharray={PV_C} strokeDashoffset={0}
              transform={`rotate(-90 ${PV.size / 2} ${PV.size / 2})`}
            />
          </svg>
          <div className={styles.previewInner}>
            <span className={styles.previewLabel} style={{ color: m.color }}>{m.label.toUpperCase()}</span>
            <span className={styles.previewBig}>{previewBig}</span>
            <span className={styles.previewSub}>{configSummary(mode, cfg)}</span>
          </div>
        </div>
      </div>

      {/* Réglages du mode sélectionné */}
      <div className={styles.configCard}>
        <Stepper label="Décompte avant départ" value={cfg.prepare ?? 0} setValue={v => set({ prepare: v })} step={5} min={0} max={60} fmt={v => `${v}s`} />

        {(mode === 'tabata' || mode === 'intervals') && (
          <>
            <Stepper label="Effort" value={cfg.work ?? 20} setValue={v => set({ work: v })} step={5} min={5} max={600} fmt={v => `${v}s`} accent />
            <Stepper label="Repos" value={cfg.rest ?? 10} setValue={v => set({ rest: v })} step={5} min={0} max={600} fmt={v => `${v}s`} />
            <Stepper label="Rounds" value={cfg.rounds ?? 8} setValue={v => set({ rounds: v })} step={1} min={1} max={50} />
          </>
        )}

        {mode === 'emom' && (
          <>
            <Stepper label="Intervalle" value={cfg.interval ?? 60} setValue={v => set({ interval: v })} step={15} min={15} max={600} fmt={fmtClock} accent />
            <Stepper label="Rounds" value={cfg.rounds ?? 10} setValue={v => set({ rounds: v })} step={1} min={1} max={60} />
          </>
        )}

        {mode === 'amrap' && (
          <Stepper label="Durée" value={cfg.duration ?? 600} setValue={v => set({ duration: v })} step={60} min={60} max={3600} fmt={fmtClock} accent wide />
        )}

        {mode === 'fortime' && (
          <>
            <Stepper label="Objectif (tours)" value={cfg.target ?? 0} setValue={v => set({ target: v })} step={1} min={0} max={50} fmt={v => v === 0 ? 'Aucun' : String(v)} accent />
            <Stepper label="Plafond (0 = aucun)" value={cfg.cap ?? 0} setValue={v => set({ cap: v })} step={60} min={0} max={3600} fmt={v => v === 0 ? 'Aucun' : fmtClock(v)} />
          </>
        )}
      </div>

      {/* Zone travaillée */}
      <div className={styles.subCard}>
        <span className={styles.cfgSectionLabel}>Zone travaillée</span>
        <div className={styles.focusChips}>
          {FOCUS_OPTIONS.map(f => (
            <button
              key={f}
              type="button"
              className={[styles.focusChip, cfg.focus === f ? styles.focusChipActive : ''].join(' ')}
              onClick={() => set({ focus: cfg.focus === f ? undefined : f })}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Exercices */}
      <div className={styles.subCard}>
        <span className={styles.cfgSectionLabel}>Exercices <span className={styles.cfgSectionHint}>· défilent à chaque effort</span></span>
        {exercises.length > 0 && (
          <ul className={styles.exList}>
            {exercises.map((ex, i) => (
              <li key={i} className={styles.exItem}>
                <span className={styles.exIdx}>{i + 1}</span>
                <span className={styles.exName}>{ex}</span>
                <button
                  type="button"
                  className={styles.exRemove}
                  onClick={() => set({ exercises: exercises.filter((_, j) => j !== i) })}
                  aria-label="Retirer"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.exAddRow}>
          <input
            className={styles.exInput}
            value={exInput}
            onChange={e => setExInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExercise() } }}
            placeholder="Ex : Pompes, Squats, Gainage…"
          />
          <button type="button" className={styles.exAddBtn} onClick={addExercise} aria-label="Ajouter">
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className={styles.configActions}>
        <button
          className={styles.startBtn}
          onClick={() => setScreen({ name: 'run', mode, config: cfg, title })}
        >
          <Play size={18} strokeWidth={2.5} fill="currentColor" /> Démarrer
        </button>
        <button className={styles.saveBtn} onClick={() => { setSaveName(presetName ?? ''); setShowSave(true) }}>
          <Bookmark size={15} strokeWidth={2} /> Enregistrer
        </button>
      </div>

      {/* Presets enregistrés */}
      {presets.length > 0 && (
        <>
          <p className={styles.sectionLabel}>Mes séances</p>
          {focuses.length > 0 && (
            <div className={styles.focusFilterRow}>
              <button
                className={[styles.focusChip, !focusFilter ? styles.focusChipActive : ''].join(' ')}
                onClick={() => setFocusFilter(null)}
              >
                Toutes
              </button>
              {focuses.map(f => (
                <button
                  key={f}
                  className={[styles.focusChip, focusFilter === f ? styles.focusChipActive : ''].join(' ')}
                  onClick={() => setFocusFilter(cur => cur === f ? null : f)}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
          <div className={styles.presetList}>
            {shownPresets.map(p => {
              const exCount = p.config.exercises?.length ?? 0
              return (
                <div key={p.id} className={styles.presetRow}>
                  <button className={styles.presetMain} onClick={() => loadPreset(p)}>
                    <span
                      className={styles.presetEmoji}
                      style={{ background: `${MODE_META[p.mode].color}33`, boxShadow: `inset 0 0 0 1.5px ${MODE_META[p.mode].color}` }}
                    >
                      {MODE_META[p.mode].emoji}
                    </span>
                    <span className={styles.presetInfo}>
                      <span className={styles.presetName}>{p.name}</span>
                      <span className={styles.presetSub}>
                        {MODE_META[p.mode].label} · {configSummary(p.mode, p.config)}
                        {exCount > 0 ? ` · ${exCount} ex.` : ''}
                      </span>
                    </span>
                    {p.config.focus && <span className={styles.presetFocus}>{p.config.focus}</span>}
                  </button>
                  <button className={styles.presetDelete} onClick={() => deletePreset.mutate(p.id)} aria-label="Supprimer">
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                </div>
              )
            })}
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

      {showSave && (
        <SlideUpModal title="Enregistrer la séance" onClose={() => setShowSave(false)}>
          <form
            className={styles.saveForm}
            onSubmit={e => { e.preventDefault(); if (saveName.trim()) { addPreset.mutate({ name: saveName.trim(), mode, config: cfg }); setPresetName(saveName.trim()); setShowSave(false) } }}
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

// ── Stepper ─────────────────────────────────────────────────────────────────────

function Stepper({ label, value, setValue, step, min, max, fmt, accent, wide }: {
  label: string
  value: number
  setValue: (v: number) => void
  step: number
  min: number
  max: number
  fmt?: (v: number) => string
  accent?: boolean
  wide?: boolean
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className={[styles.stepper, accent ? styles.stepperAccent : '', wide ? styles.stepperWide : ''].join(' ')}>
      <span className={[styles.stepperLabel, accent ? styles.stepperLabelAccent : ''].join(' ')}>{label}</span>
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

// ── Run screen ──────────────────────────────────────────────────────────────────

const PHASE_COLOR: Record<string, string> = {
  prepare: '#C7BFA8', // tan neutre — prépare-toi
  work:    '#E8643A', // orange brûlé — effort
  rest:    '#3D80B8', // bleu — repos
  done:    '#4F7D3A', // vert — terminé
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
        <div className={styles.ringWrap}>
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

        {!done && (view.exercise || view.exerciseNext) && (
          <div className={styles.exerciseBox}>
            {view.exercise ? (
              <span className={styles.exerciseCurrent} style={{ color }}>{view.exercise}</span>
            ) : (
              <span className={styles.exerciseUpcoming}>Prochain : {view.exerciseNext}</span>
            )}
            {view.exercise && view.exerciseNext && (
              <span className={styles.exerciseUpcoming}>puis {view.exerciseNext}</span>
            )}
          </div>
        )}

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
