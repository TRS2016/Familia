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
              onClick={() => setScreen({ name: 'config', mode, config: { ...DEFAULT_CONFIG[mode] } })}
            >
              <span className={styles.modeEmoji} style={{ background: `${m.color}1F` }}>{m.emoji}</span>
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
                  <span className={styles.presetEmoji} style={{ background: `${MODE_META[p.mode].color}1F` }}>
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
          <Stepper label="Plafond (0 = aucun)" value={cfg.cap ?? 0} setValue={v => set({ cap: v })} step={60} min={0} max={3600} fmt={v => v === 0 ? 'Aucun' : fmtClock(v)} />
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

const KIND_BG: Record<string, string> = {
  prepare: '#4F5D75', // bleu ardoise — "prépare-toi"
  work:    '#E0633C', // orange vif — effort
  rest:    '#2E9E8F', // turquoise — récupération
  done:    '#5DA271', // vert — séance réussie
}
const KIND_LABEL: Record<string, string> = {
  prepare: 'Prêt ?', work: 'EFFORT', rest: 'REPOS', done: 'Terminé',
}

function RunScreen({ mode, config, title, onExit }: {
  mode: TrainingMode
  config: TrainingConfig
  title: string
  onExit: () => void
}) {
  const { view, start, pause, resume, reset, skip } = useTrainingTimer(mode, config)
  const logSession = useLogTrainingSession()
  const { data: member } = useMember()
  const loggedRef = useRef(false)
  const startedRef = useRef(false)

  // démarrage auto à l'arrivée
  useEffect(() => {
    if (!startedRef.current) { startedRef.current = true; start() }
  }, [start])

  // log de la séance une seule fois à la fin
  useEffect(() => {
    if (view.status === 'done' && !loggedRef.current) {
      loggedRef.current = true
      logSession.mutate({ name: title, mode, duration_seconds: view.elapsedTotal })
    }
  }, [view.status, view.elapsedTotal, title, mode, logSession])

  const bg = KIND_BG[view.kind] ?? '#A89F97'
  const big = view.kind === 'done'
    ? '✓'
    : (mode === 'fortime' || view.value >= 60 ? fmtClock(view.value) : String(view.value))

  return (
    <div className={styles.runRoot} style={{ background: bg }}>
      <button className={styles.runClose} onClick={onExit} aria-label="Quitter">
        <X size={22} strokeWidth={2.5} />
      </button>

      <div className={styles.runTop}>
        <span className={styles.runTitle}>{title}</span>
        {view.totalRounds > 0 && view.status !== 'done' && (
          <span className={styles.runRounds}>Round {view.round} / {view.totalRounds}</span>
        )}
      </div>

      <div className={styles.runCenter}>
        <span className={styles.runPhase}>
          {view.status === 'done' ? KIND_LABEL.done
            : view.kind === 'prepare' ? KIND_LABEL.prepare
            : mode === 'fortime' ? 'FOR TIME'
            : mode === 'amrap' ? 'AMRAP'
            : KIND_LABEL[view.kind]}
        </span>
        <span className={styles.runBig}>{big}</span>
        {view.status === 'done' && (
          <span className={styles.runDoneSub}>
            {member?.display_name ? `Bravo ${member.display_name} ! ` : 'Bravo ! '}
            Séance de {fmtClock(view.elapsedTotal)}
          </span>
        )}
        {view.status !== 'done' && (
          <span className={styles.runElapsed}>Total {fmtClock(view.elapsedTotal)}</span>
        )}
      </div>

      <div className={styles.runControls}>
        {view.status === 'done' ? (
          <>
            <button className={styles.runCtrlBtn} onClick={() => { loggedRef.current = false; reset(); start() }}>
              <RotateCcw size={20} strokeWidth={2.5} /> Refaire
            </button>
            <button className={styles.runCtrlBtnPrimary} onClick={onExit}>
              Terminer
            </button>
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
            <button className={styles.runCtrlBtn} onClick={() => { reset(); onExit() }} aria-label="Arrêter">
              <X size={20} strokeWidth={2.5} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
