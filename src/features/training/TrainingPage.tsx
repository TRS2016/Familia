import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronUp, ChevronDown, ChevronRight, Play, Trash2, Bookmark, Copy, Plus, Sparkles } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import { useNumPref } from '../../lib/usePrefs'
import {
  MODE_META, MODE_ORDER, DEFAULT_CONFIG, FOCUS_OPTIONS, configSummary, totalDuration, fmtClock,
  normalizeExercises,
} from './training'
import type { TrainingMode, TrainingConfig, TrainingPreset } from './training'
import {
  useTrainingPresets, useAddTrainingPreset, useUpdateTrainingPreset, useDeleteTrainingPreset,
  useTrainingSessions, useTrainingRealtime, useTrainingStats,
  useDeleteTrainingSession, useTrainingRecords, useAmrapRecords, useFlushPendingSessions,
  useReorderTrainingPresets,
} from './useTraining'
import Stepper from './Stepper'
import StatsCard from './StatsCard'
import ExerciseEditor from './ExerciseEditor'
import RunScreen from './RunScreen'
import { primeTrainingAudio } from './useTrainingTimer'
import { SUGGESTED_PRESETS, type SuggestedPreset } from './presetLibrary'
import styles from './TrainingPage.module.css'

type Screen =
  | { name: 'home' }
  | { name: 'run'; mode: TrainingMode; config: TrainingConfig; title: string; named: boolean }

// ── Page (écran unique : onglets de mode + config inline) ──────────────────────

export default function TrainingPage() {
  useTrainingRealtime()
  useFlushPendingSessions()
  const { data: presets = [] }  = useTrainingPresets()
  const { data: sessions = [] } = useTrainingSessions(15)
  const { data: stats }         = useTrainingStats()
  const { data: records }       = useTrainingRecords()
  const { data: amrapRecords }  = useAmrapRecords()
  const addPreset    = useAddTrainingPreset()
  const updatePreset = useUpdateTrainingPreset()
  const deletePreset = useDeleteTrainingPreset()
  const deleteSession = useDeleteTrainingSession()
  const reorderPresets = useReorderTrainingPresets()

  // Déplace un preset dans l'ordre global (seulement hors filtre de zone).
  function movePreset(id: string, dir: -1 | 1) {
    const i = presets.findIndex(p => p.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= presets.length) return
    const ids = presets.map(p => p.id)
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    reorderPresets.mutate(ids)
  }

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
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestFocus, setSuggestFocus]       = useState<string | null>(null)

  // Fermeture clavier (Échap) de la confirmation de suppression.
  useEffect(() => {
    if (!confirmDel) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmDel(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDel])

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
  // Charge une séance suggérée dans l'éditeur (non enregistrée : pas d'id) pour la
  // tester/ajuster avant de l'enregistrer soi-même.
  function loadSuggestion(s: SuggestedPreset) {
    setMode(s.mode)
    setConfigs(c => ({ ...c, [s.mode]: { ...s.config } }))
    setPresetName(s.name)
    setEditingPresetId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (screen.name === 'run') {
    return (
      <RunScreen
        mode={screen.mode}
        config={screen.config}
        title={screen.title}
        named={screen.named}
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
          onClick={() => { primeTrainingAudio(); setScreen({ name: 'run', mode, config: cfg, title, named: presetName != null }) }}
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
              const record = p.mode === 'fortime' ? records?.[p.name] : undefined
              const amrapRec = p.mode === 'amrap' ? amrapRecords?.[p.name] : undefined
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
                        {amrapRec !== undefined && <span className={styles.presetRecord}> · 🏆 {amrapRec} tours</span>}
                      </span>
                    </span>
                    {p.config.focus && <span className={styles.presetFocus}>{p.config.focus}</span>}
                  </button>
                  {!focusFilter && presets.length > 1 && (
                    <span className={styles.presetMove}>
                      <button className={styles.exMoveBtn} onClick={() => movePreset(p.id, -1)} disabled={presets[0]?.id === p.id} aria-label="Monter">
                        <ChevronUp size={13} strokeWidth={2.5} />
                      </button>
                      <button className={styles.exMoveBtn} onClick={() => movePreset(p.id, 1)} disabled={presets[presets.length - 1]?.id === p.id} aria-label="Descendre">
                        <ChevronDown size={13} strokeWidth={2.5} />
                      </button>
                    </span>
                  )}
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

      {/* Séances suggérées */}
      {(() => {
        const existingNames = new Set(presets.map(p => p.name))
        const zones = [...new Set(SUGGESTED_PRESETS.map(s => s.config.focus).filter(Boolean))] as string[]
        const shown = suggestFocus ? SUGGESTED_PRESETS.filter(s => s.config.focus === suggestFocus) : SUGGESTED_PRESETS
        return (
        <>
          <button
            className={styles.suggestToggle}
            onClick={() => setShowSuggestions(v => !v)}
            aria-expanded={showSuggestions}
          >
            {showSuggestions ? <ChevronDown size={15} strokeWidth={2.5} /> : <ChevronRight size={15} strokeWidth={2.5} />}
            <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
            Séances suggérées
          </button>
          {showSuggestions && (
            <>
              {zones.length > 0 && (
                <div className={styles.focusFilterRow}>
                  <button
                    className={[styles.focusChip, !suggestFocus ? styles.focusChipActive : ''].join(' ')}
                    onClick={() => setSuggestFocus(null)}
                  >
                    Toutes
                  </button>
                  {zones.map(z => (
                    <button
                      key={z}
                      className={[styles.focusChip, suggestFocus === z ? styles.focusChipActive : ''].join(' ')}
                      onClick={() => setSuggestFocus(cur => cur === z ? null : z)}
                    >
                      {z}
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.presetList}>
                {shown.map(s => {
                  const exCount = s.config.exercises?.length ?? 0
                  const added = existingNames.has(s.name)
                  return (
                    <div key={s.name} className={styles.presetRow}>
                      <button className={styles.presetMain} onClick={() => loadSuggestion(s)}>
                        <span
                          className={styles.presetEmoji}
                          style={{ background: `${MODE_META[s.mode].color}33`, boxShadow: `inset 0 0 0 1.5px ${MODE_META[s.mode].color}` }}
                        >
                          {MODE_META[s.mode].emoji}
                        </span>
                        <span className={styles.presetInfo}>
                          <span className={styles.presetName}>{s.name}</span>
                          <span className={styles.presetSub}>
                            {MODE_META[s.mode].label} · {configSummary(s.mode, s.config)}
                            {exCount > 0 ? ` · ${exCount} ex.` : ''}
                          </span>
                        </span>
                        {s.config.focus && <span className={styles.presetFocus}>{s.config.focus}</span>}
                      </button>
                      <button
                        className={styles.suggestAddBtn}
                        onClick={() => addPreset.mutate({ name: s.name, mode: s.mode, config: { ...s.config } })}
                        disabled={added || addPreset.isPending}
                        aria-label={added ? 'Déjà ajoutée' : `Ajouter ${s.name}`}
                        title={added ? 'Déjà dans tes séances' : 'Ajouter à mes séances'}
                      >
                        <Plus size={15} strokeWidth={2.5} /> {added ? 'Ajoutée' : 'Ajouter'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
        )
      })()}

      {/* Stats + historique — empilés sur mobile, côte à côte sur desktop */}
      {(((stats?.totalCount ?? 0) > 0) || sessions.length > 0) && (
      <div className={styles.dataGrid}>
      {/* Stats */}
      <div className={styles.dataCol}>
      {stats && stats.totalCount > 0 && (
        <>
          <p className={styles.sectionLabel}>Cette semaine</p>
          <StatsCard stats={stats} goal={weeklyGoal} onEditGoal={() => setShowGoal(true)} />
        </>
      )}
      </div>

      {/* Historique */}
      <div className={styles.dataCol}>
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
                    {(s.mode === 'amrap' || s.mode === 'fortime') && s.rounds != null && s.rounds > 0 && (
                      <span className={styles.historyMember}> · {s.rounds} tour{s.rounds > 1 ? 's' : ''}</span>
                    )}
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
      </div>
      </div>
      )}

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
          <div className={styles.exitSheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
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
          </form>
        </SlideUpModal>
      )}
    </div>
  )
}
