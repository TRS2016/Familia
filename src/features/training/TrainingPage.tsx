import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  ChevronLeft, Plus, Minus, Play, Pause, RotateCcw, X, SkipForward, Trash2, Bookmark,
  Video, Link as LinkIcon, Camera, Images, Volume2, VolumeX, Megaphone, Copy, ChevronUp, ChevronDown,
} from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import MediaPlayer from '../media/MediaPlayer'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'
import { useUploadMediaFile } from '../lecteur/useLecteur'
import {
  MODE_META, MODE_ORDER, DEFAULT_CONFIG, FOCUS_OPTIONS, configSummary, totalDuration, fmtClock, isCountUp,
  normalizeExercises, exerciseHasVideo,
} from './training'
import type { TrainingMode, TrainingConfig, TrainingPreset, Exercise } from './training'
import {
  useTrainingPresets, useAddTrainingPreset, useUpdateTrainingPreset, useDeleteTrainingPreset,
  useTrainingSessions, useLogTrainingSession, useTrainingRealtime, useTrainingStats,
  useDeleteTrainingSession, useTrainingRecords,
} from './useTraining'
import type { TrainingStats } from './useTraining'
import { useTrainingTimer } from './useTrainingTimer'
import styles from './TrainingPage.module.css'

type Screen =
  | { name: 'home' }
  | { name: 'run'; mode: TrainingMode; config: TrainingConfig; title: string }

// Garde l'écran allumé pendant la séance (réacquiert au retour au 1er plan)
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sentinel: any = null
    let released = false
    const request = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nav = navigator as any
        if (nav.wakeLock?.request) sentinel = await nav.wakeLock.request('screen')
      } catch { /* non supporté ou refusé */ }
    }
    const onVis = () => { if (document.visibilityState === 'visible' && !released) request() }
    request()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVis)
      try { sentinel?.release?.() } catch { /* déjà relâché */ }
    }
  }, [active])
}

// Préférence booléenne persistée (localStorage)
function useBoolPref(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [val, setVal] = useState<boolean>(() => {
    try { const s = localStorage.getItem(key); return s === null ? initial : s === '1' } catch { return initial }
  })
  const set = (v: boolean) => {
    setVal(v)
    try { localStorage.setItem(key, v ? '1' : '0') } catch { /* indisponible */ }
  }
  return [val, set]
}

// Préférence numérique persistée (localStorage)
function useNumPref(key: string, initial: number): [number, (v: number) => void] {
  const [val, setVal] = useState<number>(() => {
    try { const s = localStorage.getItem(key); return s === null ? initial : (Number(s) || initial) } catch { return initial }
  })
  const set = (v: number) => {
    setVal(v)
    try { localStorage.setItem(key, String(v)) } catch { /* indisponible */ }
  }
  return [val, set]
}

// ── Page (écran unique : onglets de mode + config inline) ──────────────────────

export default function TrainingPage() {
  useTrainingRealtime()
  const { data: presets = [] }  = useTrainingPresets()
  const { data: sessions = [] } = useTrainingSessions(15)
  const { data: stats }         = useTrainingStats()
  const { data: records }       = useTrainingRecords()
  const addPreset    = useAddTrainingPreset()
  const updatePreset = useUpdateTrainingPreset()
  const deletePreset = useDeleteTrainingPreset()
  const deleteSession = useDeleteTrainingSession()

  const [screen, setScreen]   = useState<Screen>({ name: 'home' })
  const [mode, setMode]       = useState<TrainingMode>('tabata')
  const [configs, setConfigs] = useState<Record<TrainingMode, TrainingConfig>>(() => {
    const o = {} as Record<TrainingMode, TrainingConfig>
    for (const mm of MODE_ORDER) o[mm] = { ...DEFAULT_CONFIG[mm] }
    return o
  })
  const [presetName, setPresetName] = useState<string | undefined>(undefined)
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [focusFilter, setFocusFilter] = useState<string | null>(null)
  const [historyMember, setHistoryMember] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<{ kind: 'preset' | 'session'; id: string; label: string } | null>(null)
  const [showSave, setShowSave]     = useState(false)
  const [saveName, setSaveName]     = useState('')
  const [saveFocus, setSaveFocus]   = useState('')
  const [weeklyGoal, setWeeklyGoal] = useNumPref('training.weeklyGoal', 3)
  const [showGoal, setShowGoal]     = useState(false)

  const cfg = configs[mode]
  const set = (patch: Partial<TrainingConfig>) =>
    setConfigs(c => ({ ...c, [mode]: { ...c[mode], ...patch } }))

  function selectMode(m: TrainingMode) {
    setMode(m)
    setPresetName(undefined)
    setEditingPresetId(null)
  }
  function loadPreset(p: TrainingPreset) {
    setMode(p.mode)
    setConfigs(c => ({ ...c, [p.mode]: { ...p.config } }))
    setPresetName(p.name)
    setEditingPresetId(p.id)
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

  // Durée affichée sur le bouton Démarrer (vide si For Time sans plafond)
  const startDur = mode === 'fortime'
    ? (cfg.cap ? fmtClock(cfg.cap) : '')
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

      <p className={styles.configHint}>
        <span className={styles.configHintMode} style={{ color: m.color }}>{m.label}</span> — {m.desc}
      </p>

      <div className={styles.configZone}>
      {/* Réglages du mode sélectionné */}
      <div className={styles.configMain}>
      <div className={styles.configCard}>
        <Stepper label="Décompte avant départ" value={cfg.prepare ?? 0} setValue={v => set({ prepare: v })} step={5} min={0} max={60} fmt={v => `${v}s`} />

        {(mode === 'tabata' || mode === 'intervals') && (
          <>
            <Stepper label="Effort" value={cfg.work ?? 20} setValue={v => set({ work: v })} step={5} min={5} max={600} fmt={v => `${v}s`} accent />
            <Stepper label="Repos" value={cfg.rest ?? 10} setValue={v => set({ rest: v })} step={5} min={0} max={600} fmt={v => `${v}s`} />
            <Stepper label="Rounds / série" value={cfg.rounds ?? 8} setValue={v => set({ rounds: v })} step={1} min={1} max={50} />
            <Stepper label="Séries" value={cfg.sets ?? 1} setValue={v => set({ sets: v })} step={1} min={1} max={20} />
            <Stepper label="Repos séries" value={cfg.setRest ?? 60} setValue={v => set({ setRest: v })} step={15} min={0} max={600} fmt={v => `${v}s`} />
          </>
        )}

        {mode === 'emom' && (
          <>
            <Stepper label="Intervalle" value={cfg.interval ?? 60} setValue={v => set({ interval: v })} step={15} min={15} max={600} fmt={fmtClock} accent />
            <Stepper label="Rounds" value={cfg.rounds ?? 10} setValue={v => set({ rounds: v })} step={1} min={1} max={60} />
          </>
        )}

        {mode === 'amrap' && (
          <Stepper label="Durée" value={cfg.duration ?? 600} setValue={v => set({ duration: v })} step={60} min={60} max={3600} fmt={fmtClock} accent />
        )}

        {mode === 'fortime' && (
          <>
            <Stepper label="Objectif (tours)" value={cfg.target ?? 0} setValue={v => set({ target: v })} step={1} min={0} max={50} fmt={v => v === 0 ? 'Aucun' : String(v)} accent />
            <Stepper label="Plafond (0 = aucun)" value={cfg.cap ?? 0} setValue={v => set({ cap: v })} step={60} min={0} max={3600} fmt={v => v === 0 ? 'Aucun' : fmtClock(v)} />
          </>
        )}
      </div>

      {/* Exercices */}
      <ExerciseEditor
        mode={mode}
        rounds={cfg.rounds ?? 0}
        sets={cfg.sets ?? 1}
        exercises={normalizeExercises(cfg.exercises)}
        onChange={list => set({ exercises: list })}
      />
      </div>{/* /configMain */}
      </div>{/* /configZone */}

      {/* Actions */}
      <div className={styles.configActions}>
        <button
          className={styles.startBtn}
          onClick={() => setScreen({ name: 'run', mode, config: cfg, title })}
        >
          <Play size={18} strokeWidth={2.5} fill="currentColor" /> Démarrer{startDur ? ` · ${startDur}` : ''}
        </button>
        <button className={styles.saveBtn} onClick={() => { setSaveName(presetName ?? ''); setSaveFocus(cfg.focus ?? ''); setShowSave(true) }}>
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
              const record = p.mode === 'fortime' ? records?.get(p.name) : undefined
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
                        {record !== undefined && <span className={styles.presetRecord}> · 🏆 {fmtClock(record)}</span>}
                      </span>
                    </span>
                    {p.config.focus && <span className={styles.presetFocus}>{p.config.focus}</span>}
                  </button>
                  <button
                    className={styles.presetDuplicate}
                    onClick={() => addPreset.mutate({ name: `${p.name} (copie)`, mode: p.mode, config: { ...p.config } })}
                    aria-label="Dupliquer"
                    title="Dupliquer"
                  >
                    <Copy size={14} strokeWidth={2} />
                  </button>
                  <button className={styles.presetDelete} onClick={() => setConfirmDel({ kind: 'preset', id: p.id, label: p.name })} aria-label="Supprimer">
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Stats */}
      {stats && stats.totalCount > 0 && (
        <>
          <p className={styles.sectionLabel}>Cette semaine</p>
          <StatsCard stats={stats} goal={weeklyGoal} onEditGoal={() => setShowGoal(true)} />
        </>
      )}

      {/* Historique */}
      {sessions.length > 0 && (() => {
        const members = [...new Set(sessions.map(s => s.member?.display_name).filter(Boolean))] as string[]
        const shownSessions = historyMember
          ? sessions.filter(s => s.member?.display_name === historyMember)
          : sessions
        return (
        <>
          <p className={styles.sectionLabel}>Dernières séances</p>
          {members.length > 1 && (
            <div className={styles.focusFilterRow}>
              <button
                className={[styles.focusChip, !historyMember ? styles.focusChipActive : ''].join(' ')}
                onClick={() => setHistoryMember(null)}
              >
                Tous
              </button>
              {members.map(mName => (
                <button
                  key={mName}
                  className={[styles.focusChip, historyMember === mName ? styles.focusChipActive : ''].join(' ')}
                  onClick={() => setHistoryMember(cur => cur === mName ? null : mName)}
                >
                  {mName}
                </button>
              ))}
            </div>
          )}
          <div className={styles.historyCard}>
            <ul className={styles.historyList}>
              {shownSessions.map(s => (
                <li key={s.id} className={styles.historyRow}>
                  <span className={styles.historyEmoji}>{MODE_META[s.mode]?.emoji ?? '🏋️'}</span>
                  <span className={styles.historyName}>
                    {s.name}
                    {s.member?.display_name && <span className={styles.historyMember}> · {s.member.display_name}</span>}
                  </span>
                  <span className={styles.historyDur}>{fmtClock(s.duration_seconds)}</span>
                  <span className={styles.historyDate}>
                    {format(new Date(s.completed_at), 'd MMM', { locale: fr })}
                  </span>
                  <button
                    className={styles.historyDelete}
                    onClick={() => setConfirmDel({ kind: 'session', id: s.id, label: s.name })}
                    aria-label="Supprimer la séance"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
        )
      })()}

      {showGoal && (
        <SlideUpModal title="Objectif de la semaine" onClose={() => setShowGoal(false)}>
          <div className={styles.goalForm}>
            <p className={styles.goalHint}>Nombre de séances à viser chaque semaine.</p>
            <Stepper
              label="Séances / semaine"
              value={weeklyGoal}
              setValue={setWeeklyGoal}
              step={1}
              min={1}
              max={14}
              wide
            />
            <button type="button" className={styles.startBtn} onClick={() => setShowGoal(false)}>
              Valider
            </button>
          </div>
        </SlideUpModal>
      )}

      {confirmDel && (
        <div className={styles.pageOverlay} onClick={() => setConfirmDel(null)}>
          <div className={styles.exitSheet} onClick={e => e.stopPropagation()}>
            <span className={styles.exitEyebrow}>{confirmDel.kind === 'preset' ? 'Séance enregistrée' : 'Historique'}</span>
            <p className={styles.exitTitle}>
              Supprimer {confirmDel.kind === 'preset' ? 'la séance' : 'cette entrée'} ?
            </p>
            <p className={styles.exitText}>« {confirmDel.label} » — cette action est définitive.</p>
            <button className={styles.exitContinue} onClick={() => setConfirmDel(null)}>
              Annuler
            </button>
            <button
              className={styles.exitStop}
              onClick={() => {
                if (confirmDel.kind === 'preset') deletePreset.mutate(confirmDel.id)
                else deleteSession.mutate(confirmDel.id)
                setConfirmDel(null)
              }}
            >
              Supprimer
            </button>
          </div>
        </div>
      )}

      {showSave && (
        <SlideUpModal title={editingPresetId ? 'Modifier la séance' : 'Enregistrer la séance'} onClose={() => setShowSave(false)}>
          <form
            className={styles.saveForm}
            onSubmit={e => {
              e.preventDefault()
              const n = saveName.trim()
              if (!n) return
              const cfgToSave = { ...cfg, focus: saveFocus || undefined }
              if (editingPresetId) updatePreset.mutate({ id: editingPresetId, name: n, mode, config: cfgToSave })
              else addPreset.mutate({ name: n, mode, config: cfgToSave })
              setPresetName(n)
              setShowSave(false)
            }}
          >
            <input
              type="text"
              className={styles.saveInput}
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Ex : Tabata abdos, EMOM jambes…"
              autoFocus
            />
            <select
              className={styles.saveSelect}
              value={saveFocus}
              onChange={e => setSaveFocus(e.target.value)}
            >
              <option value="">Zone travaillée (optionnel)</option>
              {FOCUS_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <button type="submit" className={styles.startBtn} disabled={!saveName.trim()}>
              {editingPresetId ? 'Mettre à jour' : 'Enregistrer le preset'}
            </button>
            {editingPresetId && (
              <button
                type="button"
                className={styles.saveBtn}
                style={{ justifyContent: 'center' }}
                disabled={!saveName.trim()}
                onClick={() => {
                  const n = saveName.trim()
                  if (!n) return
                  addPreset.mutate({ name: n, mode, config: { ...cfg, focus: saveFocus || undefined } })
                  setPresetName(n)
                  setEditingPresetId(null)
                  setShowSave(false)
                }}
              >
                Enregistrer comme nouvelle
              </button>
            )}
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
          <Minus size={13} strokeWidth={2.5} />
        </button>
        <span className={styles.stepperValue}>{fmt ? fmt(value) : value}</span>
        <button type="button" className={styles.stepperBtn} onClick={() => setValue(clamp(value + step))} aria-label="Plus">
          <Plus size={13} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}

// ── Carte de stats ──────────────────────────────────────────────────────────────

const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

function StatsCard({ stats, goal, onEditGoal }: { stats: TrainingStats; goal: number; onEditGoal: () => void }) {
  const maxSec = Math.max(1, ...stats.perDay.map(d => d.seconds))
  const todayKey = stats.perDay[stats.perDay.length - 1]?.date

  // Anneau d'objectif hebdo
  const G = { size: 46, r: 19 }
  const GC = 2 * Math.PI * G.r
  const goalPct = goal > 0 ? Math.min(1, stats.weekCount / goal) : 0
  const goalMet = goal > 0 && stats.weekCount >= goal
  const goalColor = goalMet ? 'var(--tr-ok)' : 'var(--tr-accent)'

  return (
    <div className={styles.statsCard}>
      <div className={styles.statsGrid}>
        <button className={[styles.statCell, styles.statCellGoal].join(' ')} onClick={onEditGoal} aria-label="Objectif hebdomadaire">
          <span className={styles.goalRing}>
            <svg viewBox={`0 0 ${G.size} ${G.size}`} className={styles.goalRingSvg}>
              <circle cx={G.size / 2} cy={G.size / 2} r={G.r} fill="none" stroke="var(--tr-line)" strokeWidth={4} />
              <circle cx={G.size / 2} cy={G.size / 2} r={G.r} fill="none"
                stroke={goalColor} strokeWidth={4} strokeLinecap="round"
                strokeDasharray={GC} strokeDashoffset={GC * (1 - goalPct)}
                transform={`rotate(-90 ${G.size / 2} ${G.size / 2})`}
                style={{ transition: 'stroke-dashoffset 0.4s ease' }}
              />
            </svg>
            <span className={styles.goalRingText} style={{ color: goalColor }}>
              {stats.weekCount}<span className={styles.goalRingDen}>/{goal}</span>
            </span>
          </span>
          <span className={styles.statLabel}>Objectif</span>
        </button>
        <div className={styles.statCell}>
          <span className={styles.statValue}>{fmtClock(stats.weekSeconds)}</span>
          <span className={styles.statLabel}>Temps</span>
        </div>
        <div className={styles.statCell}>
          <span className={[styles.statValue, stats.streakDays > 0 ? styles.statValueAccent : ''].join(' ')}>
            {stats.streakDays > 0 ? `${stats.streakDays}🔥` : '0'}
          </span>
          <span className={styles.statLabel}>Série</span>
        </div>
        <div className={styles.statCell}>
          <span className={styles.statValue}>{stats.totalCount}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
      </div>

      <div className={styles.statChart}>
        {stats.perDay.map(d => {
          const dow = new Date(d.date + 'T00:00:00').getDay()
          const isToday = d.date === todayKey
          return (
            <div key={d.date} className={styles.statBarCol}>
              <div className={styles.statBarTrack}>
                <div
                  className={[styles.statBar, d.seconds === 0 ? styles.statBarEmpty : ''].join(' ')}
                  style={{ height: `${Math.round((d.seconds / maxSec) * 100)}%` }}
                />
              </div>
              <span className={[styles.statBarDay, isToday ? styles.statBarDayToday : ''].join(' ')}>
                {DAY_LETTERS[dow]}
              </span>
            </div>
          )
        })}
      </div>

      {stats.zones.length > 0 && (
        <div className={styles.statZones}>
          {stats.zones.map(z => (
            <span key={z.focus} className={styles.statZone}>
              {z.focus}<span className={styles.statZoneCount}>{z.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Éditeur d'exercices (un par round) + vidéos ─────────────────────────────────

function ExerciseEditor({ mode, rounds, sets, exercises, onChange }: {
  mode: TrainingMode
  rounds: number
  sets: number
  exercises: Exercise[]
  onChange: (list: Exercise[]) => void
}) {
  const seriesBased = mode === 'tabata' || mode === 'intervals'
  const perMinute   = mode === 'emom'
  const fixedSlots  = seriesBased || perMinute
  const [videoIdx, setVideoIdx] = useState<number | null>(null)
  const [freeInput, setFreeInput] = useState('')

  function setEx(i: number, patch: Partial<Exercise>) {
    const next = exercises.slice()
    while (next.length <= i) next.push({ name: '' })
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }
  function removeEx(i: number) {
    onChange(exercises.filter((_, j) => j !== i))
  }
  function moveEx(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= exercises.length) return
    const next = exercises.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function addFree() {
    const t = freeInput.trim()
    if (!t) return
    onChange([...exercises, { name: t }])
    setFreeInput('')
  }

  const count = seriesBased ? Math.max(1, sets) : perMinute ? Math.max(1, rounds) : exercises.length
  const hint = seriesBased ? 'un par série' : perMinute ? 'un par minute' : 'défilent à l\'effort'
  const slotTag = (i: number) => seriesBased ? `S${i + 1}` : perMinute ? `M${i + 1}` : `${i + 1}`

  return (
    <div className={styles.subCard}>
      <span className={styles.cfgSectionLabel}>
        Exercices <span className={styles.cfgSectionHint}>· {hint}</span>
      </span>

      <ul className={styles.exList}>
        {Array.from({ length: count }).map((_, i) => {
          const ex = exercises[i] ?? { name: '' }
          return (
            <li key={i} className={styles.exItem}>
              <span className={styles.exIdx}>{slotTag(i)}</span>
              <input
                className={styles.exNameInput}
                value={ex.name}
                onChange={e => setEx(i, { name: e.target.value })}
                placeholder={seriesBased ? `Exercice série ${i + 1}` : perMinute ? `Exercice min ${i + 1}` : 'Exercice…'}
              />
              <button
                type="button"
                className={[styles.exVideoBtn, exerciseHasVideo(ex) ? styles.exVideoBtnSet : ''].join(' ')}
                onClick={() => setVideoIdx(i)}
                aria-label="Vidéo de démo"
                title="Vidéo de démo"
              >
                <Video size={15} strokeWidth={2} />
              </button>
              {!fixedSlots && count > 1 && (
                <span className={styles.exMove}>
                  <button type="button" className={styles.exMoveBtn} onClick={() => moveEx(i, -1)} disabled={i === 0} aria-label="Monter">
                    <ChevronUp size={13} strokeWidth={2.5} />
                  </button>
                  <button type="button" className={styles.exMoveBtn} onClick={() => moveEx(i, 1)} disabled={i === count - 1} aria-label="Descendre">
                    <ChevronDown size={13} strokeWidth={2.5} />
                  </button>
                </span>
              )}
              {!fixedSlots && (
                <button type="button" className={styles.exRemove} onClick={() => removeEx(i)} aria-label="Retirer">
                  <X size={14} strokeWidth={2.5} />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {!fixedSlots && (
        <div className={styles.exAddRow}>
          <input
            className={styles.exInput}
            value={freeInput}
            onChange={e => setFreeInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFree() } }}
            placeholder="Ajouter un exercice…"
          />
          <button type="button" className={styles.exAddBtn} onClick={addFree} aria-label="Ajouter">
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {videoIdx !== null && (
        <VideoSheet
          exercise={exercises[videoIdx] ?? { name: '' }}
          onClose={() => setVideoIdx(null)}
          onSave={patch => { setEx(videoIdx, patch); setVideoIdx(null) }}
        />
      )}
    </div>
  )
}

function VideoSheet({ exercise, onClose, onSave }: {
  exercise: Exercise
  onClose: () => void
  onSave: (patch: Partial<Exercise>) => void
}) {
  const upload = useUploadMediaFile()
  const [url, setUrl] = useState(exercise.videoUrl ?? '')
  const [path, setPath] = useState(exercise.videoPath)
  const [mime, setMime] = useState(exercise.videoMime)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef  = useRef<HTMLInputElement>(null)

  const { showToast } = useToast()
  async function handleFile(file: File) {
    // Plafond Supabase free-tier : 50 Mo/fichier. On garde une marge.
    if (file.size > 50 * 1024 * 1024) {
      showToast({
        type: 'error',
        message: `Vidéo trop lourde (${Math.round(file.size / 1024 / 1024)} Mo). Max 50 Mo — utilise un clip plus court ou un lien YouTube.`,
      })
      return
    }
    try {
      const res = await upload.mutateAsync(file)
      setPath(res.path)
      setMime(res.mimeType || file.type || 'video/mp4')
      setUrl('')
    } catch { /* toast géré par le hook */ }
  }

  return (
    <SlideUpModal title={`Vidéo — ${exercise.name || 'exercice'}`} onClose={onClose}>
      <div className={styles.videoSheet}>
        <label className={styles.cfgSectionLabel}>Lien (YouTube, Vimeo…)</label>
        <div className={styles.exAddRow}>
          <input
            className={styles.exInput}
            type="url"
            value={url}
            onChange={e => { setUrl(e.target.value); if (e.target.value) setPath(undefined) }}
            placeholder="https://youtube.com/watch?v=…"
          />
        </div>

        <div className={styles.videoOr}>ou {upload.isPending ? '· upload…' : path ? '· fichier ✓' : ''}</div>

        <div className={styles.videoUploadRow}>
          <button
            type="button"
            className={styles.videoUploadBtn}
            onClick={() => galleryRef.current?.click()}
            disabled={upload.isPending}
          >
            <Images size={15} strokeWidth={2} /> Galerie
          </button>
          <button
            type="button"
            className={styles.videoUploadBtn}
            onClick={() => cameraRef.current?.click()}
            disabled={upload.isPending}
          >
            <Camera size={15} strokeWidth={2} /> Caméra
          </button>
        </div>
        <input
          ref={galleryRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="video/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />

        {(url || path) && (
          <button
            type="button"
            className={styles.videoRemove}
            onClick={() => { setUrl(''); setPath(undefined); setMime(undefined) }}
          >
            <LinkIcon size={13} strokeWidth={2} /> Retirer la vidéo
          </button>
        )}

        <button
          type="button"
          className={styles.startBtn}
          onClick={() => onSave(url.trim()
            ? { videoUrl: url.trim(), videoPath: undefined, videoMime: undefined }
            : { videoUrl: undefined, videoPath: path, videoMime: mime })}
        >
          Enregistrer
        </button>
      </div>
    </SlideUpModal>
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
  const [muted, setMuted] = useBoolPref('training.muted', false)
  const [voice, setVoice] = useBoolPref('training.voice', false)
  const { view, taps, start, pause, resume, reset, skip, addTap } = useTrainingTimer(mode, config, { muted, voice })
  useWakeLock(view.status === 'running' || view.status === 'paused')
  const logSession = useLogTrainingSession()
  const { data: member } = useMember()
  const { data: records } = useTrainingRecords()
  const loggedRef = useRef(false)
  const startedRef = useRef(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [videoEx, setVideoEx] = useState<Exercise | null>(null)

  // Record For Time : capture le meilleur temps connu AVANT cette séance
  const prevBestRef = useRef<number | undefined>(undefined)
  const prevBestCaptured = useRef(false)
  useEffect(() => {
    if (!prevBestCaptured.current && mode === 'fortime' && records) {
      prevBestCaptured.current = true
      prevBestRef.current = records.get(title)
    }
  }, [records, title, mode])

  const exObjs = normalizeExercises(config.exercises)
  const isCircuit = mode === 'amrap' || mode === 'fortime' // exercices = circuit (pas de défilement)
  // Démo : exo courant pendant l'effort, exo suivant pendant le repos/décompte.
  const demoEx = view.kind === 'work' ? view.exerciseObj : view.exerciseNextObj
  // Phases d'attente : on lance la démo du prochain exo automatiquement.
  const isRestLike = view.kind === 'prepare' || view.kind === 'rest'
  // Démo affichée inline pendant l'effort (toggle « Voir la démo »).
  const [workDemo, setWorkDemo]     = useState(false)
  const [demoClosed, setDemoClosed] = useState(false) // fermée pour la phase en cours
  // Tout se réinitialise à chaque nouvelle phase.
  useEffect(() => { setWorkDemo(false); setDemoClosed(false) }, [view.phaseIndex])
  const inlineDemo = exerciseHasVideo(demoEx ?? undefined) && (isRestLike || workDemo)
  const showDemo   = inlineDemo && !demoClosed
  // Démo affichée : anneau réduit, vidéo agrandie.
  const demoPlaying = !isCircuit && showDemo

  function closeDemo() { exitFs(); setDemoClosed(true); setWorkDemo(false) }

  // Plein écran natif (Fullscreen API + repli iOS sur l'élément <video>)
  const demoRef = useRef<HTMLDivElement>(null)
  function enterFs() {
    const el = demoRef.current
    if (!el) return
    // On met en plein écran le CONTENEUR (vidéo + capteur de gestes + bouton X)
    // pour garder nos contrôles (swipe ↓, fermer) actifs en plein écran.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyEl = el as any
    if (anyEl.requestFullscreen) { anyEl.requestFullscreen().catch(() => {}); return }
    if (anyEl.webkitRequestFullscreen) { anyEl.webkitRequestFullscreen(); return }
    // iOS Safari : pas de plein écran sur un conteneur → repli sur la vidéo native
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vid = el.querySelector('video') as any
    if (vid?.webkitEnterFullscreen) vid.webkitEnterFullscreen()
  }
  function exitFs() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = document as any
    if (d.fullscreenElement && d.exitFullscreen) d.exitFullscreen().catch(() => { /* ignore */ })
    else if (d.webkitFullscreenElement && d.webkitExitFullscreen) d.webkitExitFullscreen()
  }
  const swipeRef = useRef<{ x: number; y: number } | null>(null)
  function onDemoPointerDown(e: React.PointerEvent) { swipeRef.current = { x: e.clientX, y: e.clientY } }
  function onDemoPointerUp(e: React.PointerEvent) {
    const s = swipeRef.current
    swipeRef.current = null
    if (!s) return
    const dy = e.clientY - s.y
    const dx = e.clientX - s.x
    if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx)) {
      if (dy < 0) enterFs()  // haut → plein écran natif
      else exitFs()          // bas → sortie plein écran
    }
  }

  useEffect(() => {
    if (!startedRef.current) { startedRef.current = true; start() }
  }, [start])

  useEffect(() => {
    if (view.status === 'done' && !loggedRef.current) {
      loggedRef.current = true
      logSession.mutate({ name: title, mode, duration_seconds: view.elapsedTotal, focus: config.focus ?? null })
    }
  }, [view.status, view.elapsedTotal, title, mode, config.focus, logSession])

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
  const prevBest = prevBestRef.current
  const isNewRecord = done && ftCompleted && (prevBest === undefined || view.elapsedTotal < prevBest)

  function handleClose() {
    if (view.status === 'running' || view.status === 'paused') setConfirmExit(true)
    else { reset(); onExit() }
  }

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
                <div ref={demoRef} className={[styles.demoInline, styles.demoInlineLarge].join(' ')}>
                  <MediaPlayer
                    key={demoEx!.videoPath ?? demoEx!.videoUrl}
                    filePath={demoEx!.videoPath ?? null}
                    externalUrl={demoEx!.videoUrl ?? null}
                    mimeType={demoEx!.videoMime ?? null}
                    title={demoEx!.name}
                    autoPlay
                    muted
                  />
                  {/* Capteur de gestes : swipe haut = plein écran natif, swipe bas = sortie */}
                  <div
                    className={styles.demoGesture}
                    onPointerDown={onDemoPointerDown}
                    onPointerUp={onDemoPointerUp}
                  />
                  <button className={styles.demoClose} onClick={closeDemo} aria-label="Fermer la vidéo">
                    <X size={18} strokeWidth={2.5} />
                  </button>
                  <span className={styles.demoHint}>Swipe ↑ plein écran</span>
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
            <button className={styles.runCtrlBtn} onClick={handleClose} aria-label="Terminer">
              <X size={20} strokeWidth={2.5} />
            </button>
          </>
        )}
      </div>
      </div>{/* /runInner */}

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
