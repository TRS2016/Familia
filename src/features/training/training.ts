// ── Types & logique des minuteurs d'entraînement ──────────────────────────────

export type TrainingMode = 'tabata' | 'emom' | 'amrap' | 'fortime' | 'intervals'

export interface TrainingConfig {
  prepare:  number  // décompte avant le départ (s)
  work?:    number  // durée effort (s) — tabata, intervals
  rest?:    number  // durée repos (s) — tabata, intervals
  rounds?:  number  // nb de rounds (par série) — tabata, emom, intervals
  sets?:    number  // nb de séries — tabata, intervals
  setRest?: number  // repos entre séries (s) — tabata, intervals
  interval?: number // durée d'une minute EMOM (s)
  duration?: number // durée totale AMRAP (s)
  cap?:     number  // plafond For Time (s, 0 = aucun)
  target?:  number  // objectif de tours For Time (0 = aucun)
  exercises?: Exercise[] // exercices (un par round) qui défilent pendant l'effort
  focus?:   string  // zone travaillée (Abdos, Jambes…) — pour ranger/filtrer
}

export interface Exercise {
  name: string
  videoUrl?: string   // lien externe (YouTube, Vimeo…)
  videoPath?: string  // fichier uploadé (bucket family-media)
  videoMime?: string  // type MIME du fichier uploadé (pour le lecteur)
}

/** Normalise les exercices (compat anciens presets stockés en string[]). */
export function normalizeExercises(raw: unknown): Exercise[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(e => (typeof e === 'string' ? { name: e } : e))
    .filter((e): e is Exercise => !!e && typeof (e as Exercise).name === 'string')
}

export function exerciseHasVideo(e: Exercise | undefined): boolean {
  return !!e && (!!e.videoUrl || !!e.videoPath)
}

// Zones d'entraînement pour catégoriser les séances
export const FOCUS_OPTIONS = ['Full body', 'Abdos', 'Jambes', 'Haut du corps', 'Cardio', 'Mobilité'] as const

export interface TrainingPreset {
  id: string
  household_id: string
  member_id: string | null
  name: string
  mode: TrainingMode
  config: TrainingConfig
  created_at: string
}

export interface TrainingSession {
  id: string
  household_id: string
  member_id: string | null
  name: string
  mode: TrainingMode
  duration_seconds: number
  focus?: string | null
  completed_at: string
  member?: { display_name: string } | null
}

// ── Métadonnées d'affichage ────────────────────────────────────────────────────

export const MODE_META: Record<TrainingMode, { emoji: string; label: string; desc: string; color: string }> = {
  tabata:    { emoji: '🔥', label: 'Tabata',      desc: 'Effort / repos × rounds',        color: '#E07B54' },
  emom:      { emoji: '⏱️', label: 'EMOM',         desc: 'Chaque minute, un effort',       color: '#5B9E8F' },
  amrap:     { emoji: '♾️', label: 'AMRAP',        desc: 'Max de tours en temps donné',    color: '#9B7AC4' },
  fortime:   { emoji: '🏁', label: 'For Time',     desc: 'Chrono qui monte (+ plafond)',   color: '#E8B84B' },
  intervals: { emoji: '🔁', label: 'Intervalles',  desc: 'Effort / repos personnalisés',   color: '#4F9DD4' },
}

export const MODE_ORDER: TrainingMode[] = ['tabata', 'emom', 'amrap', 'fortime', 'intervals']

export const DEFAULT_CONFIG: Record<TrainingMode, TrainingConfig> = {
  tabata:    { prepare: 10, work: 20, rest: 10, rounds: 8, sets: 1, setRest: 60 },
  emom:      { prepare: 10, interval: 60, rounds: 10 },
  amrap:     { prepare: 10, duration: 12 * 60 },
  fortime:   { prepare: 10, cap: 15 * 60, target: 5 },
  intervals: { prepare: 10, work: 45, rest: 15, rounds: 6, sets: 1, setRest: 60 },
}

// ── Phases (modes en décompte) ─────────────────────────────────────────────────

export type PhaseKind = 'prepare' | 'work' | 'rest'

export interface Phase {
  kind: PhaseKind
  label: string
  seconds: number
  round?: number
  totalRounds?: number
  set?: number
  totalSets?: number
}

/** True si le mode est un chrono qui monte (For Time) plutôt qu'un décompte. */
export function isCountUp(mode: TrainingMode): boolean {
  return mode === 'fortime'
}

/** Compile une config en liste de phases (modes en décompte). */
export function compilePhases(mode: TrainingMode, cfg: TrainingConfig): Phase[] {
  const phases: Phase[] = []
  const prepare = cfg.prepare ?? 0
  if (prepare > 0) phases.push({ kind: 'prepare', label: 'Prêt ?', seconds: prepare })

  if (mode === 'tabata' || mode === 'intervals') {
    const sets    = Math.max(1, cfg.sets ?? 1)
    const rounds  = Math.max(1, cfg.rounds ?? 1)
    const work    = Math.max(1, cfg.work ?? 20)
    const rest    = Math.max(0, cfg.rest ?? 0)
    const setRest = Math.max(0, cfg.setRest ?? 0)
    for (let s = 1; s <= sets; s++) {
      for (let r = 1; r <= rounds; r++) {
        phases.push({ kind: 'work', label: 'Effort', seconds: work, round: r, totalRounds: rounds, set: s, totalSets: sets })
        if (rest > 0 && r < rounds) {
          phases.push({ kind: 'rest', label: 'Repos', seconds: rest, round: r, totalRounds: rounds, set: s, totalSets: sets })
        }
      }
      if (setRest > 0 && s < sets) {
        phases.push({ kind: 'rest', label: 'Repos série', seconds: setRest, round: rounds, totalRounds: rounds, set: s, totalSets: sets })
      }
    }
  } else if (mode === 'emom') {
    const rounds   = Math.max(1, cfg.rounds ?? 1)
    const interval = Math.max(1, cfg.interval ?? 60)
    for (let r = 1; r <= rounds; r++) {
      phases.push({ kind: 'work', label: 'Minute', seconds: interval, round: r, totalRounds: rounds })
    }
  } else if (mode === 'amrap') {
    phases.push({ kind: 'work', label: 'AMRAP', seconds: Math.max(1, cfg.duration ?? 60) })
  }

  return phases
}

/** Durée totale prévue (s) — pour l'historique et l'aperçu. */
export function totalDuration(mode: TrainingMode, cfg: TrainingConfig): number {
  if (mode === 'fortime') return cfg.cap ?? 0
  return compilePhases(mode, cfg).reduce((s, p) => s + p.seconds, 0)
}

// ── Formatage ──────────────────────────────────────────────────────────────────

export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

/** Résumé court d'une config (ex: "20s / 10s × 8"). */
export function configSummary(mode: TrainingMode, cfg: TrainingConfig): string {
  switch (mode) {
    case 'tabata':
    case 'intervals': {
      const base = `${cfg.work}s / ${cfg.rest}s × ${cfg.rounds}`
      return (cfg.sets ?? 1) > 1 ? `${cfg.sets} séries · ${base}` : base
    }
    case 'emom':
      return `${fmtClock(cfg.interval ?? 60)} × ${cfg.rounds}`
    case 'amrap':
      return `AMRAP ${fmtClock(cfg.duration ?? 0)}`
    case 'fortime':
      return cfg.cap && cfg.cap > 0 ? `For Time (cap ${fmtClock(cfg.cap)})` : 'For Time'
  }
}
