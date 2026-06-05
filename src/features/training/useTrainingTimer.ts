import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compilePhases, isCountUp, normalizeExercises, type Exercise, type TrainingConfig, type TrainingMode } from './training'

type Status = 'idle' | 'running' | 'paused' | 'done'

export interface TimerView {
  status: Status
  kind: 'prepare' | 'work' | 'rest' | 'done'
  label: string
  value: number        // grand chiffre affiché (s)
  round: number
  totalRounds: number
  set: number
  totalSets: number
  phaseIndex: number
  phaseCount: number
  elapsedTotal: number // s écoulées (pour l'historique)
  progress: number     // 0→1 de la phase courante (anneau)
  exercise: string     // exercice à faire maintenant (phase d'effort)
  exerciseNext: string // exercice suivant (affiché en repos/préparation)
  exerciseObj: Exercise | null     // objet exo courant (pour la vidéo de démo)
  exerciseNextObj: Exercise | null // objet exo suivant (démo pendant le repos)
}

// ── Bips Web Audio ─────────────────────────────────────────────────────────────

function useBeeper() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctxRef = useRef<any>(null)

  const ensure = useCallback(() => {
    try {
      if (!ctxRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AC = window.AudioContext || (window as any).webkitAudioContext
        if (AC) ctxRef.current = new AC()
      }
      if (ctxRef.current?.state === 'suspended') ctxRef.current.resume()
    } catch { /* audio indisponible */ }
    return ctxRef.current
  }, [])

  const beep = useCallback((freq: number, dur: number, vol = 0.3, when = 0, type: OscillatorType = 'sine') => {
    try {
      const ctx = ctxRef.current
      if (!ctx) return
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.value = freq
      osc.connect(gain); gain.connect(ctx.destination)
      const t = ctx.currentTime + when
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.start(t)
      osc.stop(t + dur + 0.02)
    } catch { /* audio indisponible */ }
  }, [])

  // Joue une séquence de notes ({ f: fréquence, d: durée, v?: volume })
  const motif = useCallback((notes: { f: number; d: number; v?: number }[], type: OscillatorType = 'sine') => {
    let t = 0
    for (const n of notes) {
      beep(n.f, n.d, n.v ?? 0.35, t, type)
      t += n.d
    }
  }, [beep])

  return { ensure, beep, motif }
}

function vibrate(ms: number | number[]) {
  try { navigator.vibrate?.(ms) } catch { /* non supporté */ }
}

// ── Annonces vocales (Web Speech) ────────────────────────────────────────────────

function useSpeaker() {
  return useCallback((text: string) => {
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'fr-FR'
      u.rate = 1.05
      synth.cancel() // coupe l'annonce précédente pour rester synchro
      synth.speak(u)
    } catch { /* synthèse vocale indisponible */ }
  }, [])
}

// ── Hook minuteur ───────────────────────────────────────────────────────────────

export interface TimerOptions {
  muted?: boolean  // coupe bips + voix (la vibration reste)
  voice?: boolean  // annonces vocales des phases
}

export function useTrainingTimer(mode: TrainingMode, config: TrainingConfig, opts: TimerOptions = {}) {
  const { ensure, beep, motif } = useBeeper()
  const speakRaw = useSpeaker()

  const mutedRef = useRef(!!opts.muted)
  const voiceRef = useRef(!!opts.voice)
  mutedRef.current = !!opts.muted
  voiceRef.current = !!opts.voice

  const speak = useCallback((text: string) => {
    if (!mutedRef.current && voiceRef.current) speakRaw(text)
  }, [speakRaw])

  // Motifs sémantiques (silencieux si mute). La voix double éventuellement le bip.
  const sndGo    = useCallback(() => { if (!mutedRef.current) motif([{ f: 660, d: 0.12 }, { f: 990, d: 0.28 }]) }, [motif])
  const sndBreak = useCallback(() => { if (!mutedRef.current) motif([{ f: 523, d: 0.16, v: 0.3 }, { f: 392, d: 0.28, v: 0.3 }]) }, [motif])
  const sndStop  = useCallback(() => { if (!mutedRef.current) motif([{ f: 784, d: 0.16 }, { f: 587, d: 0.16 }, { f: 392, d: 0.5 }]) }, [motif])
  const sndTick  = useCallback((rest: boolean) => { if (!mutedRef.current) beep(rest ? 620 : 880, 0.09, 0.22) }, [beep])
  const sndMark  = useCallback(() => { if (!mutedRef.current) beep(740, 0.14, 0.28) }, [beep]) // repère mi-parcours / 10s

  const countUp = isCountUp(mode)
  const cap = config.cap ?? 0
  const target = config.target ?? 0

  const cfgKey = JSON.stringify(config)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const phases = useMemo(() => (countUp ? [] : compilePhases(mode, config)), [mode, cfgKey])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exObjs = useMemo(() => normalizeExercises(config.exercises), [cfgKey])

  const initial: TimerView = {
    status: 'idle',
    kind: countUp ? 'work' : (phases[0]?.kind ?? 'work'),
    label: countUp ? 'For Time' : (phases[0]?.label ?? ''),
    value: countUp ? 0 : (phases[0]?.seconds ?? 0),
    round: phases[0]?.round ?? 0,
    totalRounds: phases[0]?.totalRounds ?? 0,
    set: phases[0]?.set ?? 0,
    totalSets: phases[0]?.totalSets ?? 0,
    phaseIndex: 0,
    phaseCount: phases.length,
    elapsedTotal: 0,
    progress: 0,
    exercise: '',
    exerciseNext: '',
    exerciseObj: null,
    exerciseNextObj: null,
  }

  const [view, setView] = useState<TimerView>(initial)
  const [taps, setTaps] = useState(0)
  const tapsRef = useRef(0)

  const intervalRef  = useRef<number | undefined>(undefined)
  const lastRef      = useRef(0)
  const statusRef    = useRef<Status>('idle')
  const phaseIdxRef  = useRef(0)
  const remainingRef = useRef(phases[0]?.seconds ?? 0)
  const elapsedRef   = useRef(0)
  const prevCeilRef  = useRef(-1)
  const halfFiredRef = useRef(false) // repère mi-parcours déjà joué pour la phase courante
  const capHalfRef   = useRef(false) // repère mi-parcours du plafond (For Time)
  const capTenRef    = useRef(false) // bip 10s avant le plafond (For Time)

  const emitCountdown = useCallback(() => {
    const ph = phases[phaseIdxRef.current]
    if (!ph) return
    const value = Math.max(0, Math.ceil(remainingRef.current))
    const progress = ph.seconds > 0 ? Math.min(1, Math.max(0, 1 - remainingRef.current / ph.seconds)) : 0

    // exercices qui défilent par round d'effort
    // Exercices : par série (tabata/intervals) ou par round/minute (emom)
    let exercise = '', exerciseNext = ''
    let exerciseObj: Exercise | null = null, exerciseNextObj: Exercise | null = null
    const n = exObjs.length
    if (n > 0) {
      const seriesBased = mode === 'tabata' || mode === 'intervals'
      const idxOf = (p: typeof ph) => {
        const base = seriesBased ? (p.set ?? 1) : (p.round ?? 1)
        return ((base - 1) % n + n) % n
      }
      if (ph.kind === 'work') { exerciseObj = exObjs[idxOf(ph)]; exercise = exerciseObj.name }
      for (let k = phaseIdxRef.current + 1; k < phases.length; k++) {
        if (phases[k].kind === 'work') {
          const nx = exObjs[idxOf(phases[k])]
          if (nx) {
            exerciseNextObj = nx
            if (nx.name && nx.name !== exercise) exerciseNext = nx.name
          }
          break
        }
      }
    }

    setView(v =>
      v.value === value && v.phaseIndex === phaseIdxRef.current && v.status === 'running'
        ? { ...v, progress }
        : {
            status: 'running',
            kind: ph.kind,
            label: ph.label,
            value,
            round: ph.round ?? 0,
            totalRounds: ph.totalRounds ?? 0,
            set: ph.set ?? 0,
            totalSets: ph.totalSets ?? 0,
            phaseIndex: phaseIdxRef.current,
            phaseCount: phases.length,
            elapsedTotal: Math.round(elapsedRef.current),
            progress,
            exercise,
            exerciseNext,
            exerciseObj,
            exerciseNextObj,
          }
    )
  }, [phases, exObjs, mode])

  const emitCountUp = useCallback(() => {
    const value = Math.floor(elapsedRef.current)
    const progress = cap > 0 ? Math.min(1, elapsedRef.current / cap) : 0
    setView(v =>
      v.value === value && v.status === 'running'
        ? { ...v, progress }
        : {
            status: 'running', kind: 'work', label: 'For Time', value,
            round: 0, totalRounds: 0, set: 0, totalSets: 0, phaseIndex: 0, phaseCount: 0, elapsedTotal: value, progress,
            exercise: '', exerciseNext: '', exerciseObj: null, exerciseNextObj: null,
          }
    )
  }, [cap])

  // Nom d'exercice associé à une phase (pour l'annonce vocale).
  const exNameForPhase = useCallback((ph: typeof phases[number]): string => {
    const n = exObjs.length
    if (n === 0 || ph.kind !== 'work') return ''
    const seriesBased = mode === 'tabata' || mode === 'intervals'
    const base = seriesBased ? (ph.set ?? 1) : (ph.round ?? 1)
    return exObjs[((base - 1) % n + n) % n]?.name ?? ''
  }, [exObjs, mode])

  const finish = useCallback(() => {
    statusRef.current = 'done'
    if (intervalRef.current) clearInterval(intervalRef.current)
    sndStop()
    speak('Terminé. Bravo !')
    vibrate([150, 90, 150, 90, 280])
    setView(v => ({ ...v, status: 'done', kind: 'done', label: 'Terminé', value: 0, elapsedTotal: Math.round(elapsedRef.current) }))
  }, [sndStop, speak])

  const tick = useCallback(() => {
    const now = performance.now()
    const dt = (now - lastRef.current) / 1000
    lastRef.current = now
    if (statusRef.current !== 'running') return

    if (countUp) {
      elapsedRef.current += dt
      // Repères sur le plafond For Time (mi-temps + 10s restantes)
      if (cap > 0) {
        if (!capHalfRef.current && elapsedRef.current >= cap / 2 && cap >= 120) {
          capHalfRef.current = true; sndMark(); speak('Mi-temps'); vibrate(80)
        }
        if (!capTenRef.current && cap - elapsedRef.current <= 10 && cap >= 30) {
          capTenRef.current = true; sndMark(); speak('Dix secondes'); vibrate(80)
        }
      }
      if ((cap > 0 && elapsedRef.current >= cap) || (target > 0 && tapsRef.current >= target)) {
        if (cap > 0 && elapsedRef.current >= cap) elapsedRef.current = cap
        emitCountUp()
        finish()
        return
      }
      emitCountUp()
    } else {
      remainingRef.current -= dt
      elapsedRef.current   += dt
      const ph = phases[phaseIdxRef.current]
      const ceil = Math.ceil(remainingRef.current)
      // Repère mi-parcours sur les efforts longs
      if (ph.kind === 'work' && ph.seconds >= 40 && !halfFiredRef.current && remainingRef.current <= ph.seconds / 2) {
        halfFiredRef.current = true; sndMark(); speak('Mi-temps'); vibrate(80)
      }
      if (ceil !== prevCeilRef.current) {
        prevCeilRef.current = ceil
        // Bip 10s avant la fin d'un effort suffisamment long
        if (ph.kind === 'work' && ph.seconds >= 25 && ceil === 10) { sndMark(); speak('Dix secondes'); vibrate(60) }
        if (ceil >= 1 && ceil <= 3) { sndTick(ph.kind === 'rest'); speak(String(ceil)); vibrate(40) }
      }
      if (remainingRef.current <= 0) {
        const carry = remainingRef.current
        const next  = phaseIdxRef.current + 1
        if (next >= phases.length) { finish(); return }
        phaseIdxRef.current = next
        remainingRef.current = phases[next].seconds + carry
        prevCeilRef.current = -1
        halfFiredRef.current = false
        const nextPh = phases[next]
        const isWork = nextPh.kind === 'work'
        if (isWork) { sndGo(); vibrate([90, 50, 120]); speak(exNameForPhase(nextPh) || 'Effort') }
        else        { sndBreak(); vibrate(200); speak(nextPh.label === 'Repos série' ? 'Repos série' : 'Repos') }
      }
      emitCountdown()
    }
  }, [countUp, cap, target, phases, emitCountUp, emitCountdown, finish, sndTick, sndGo, sndBreak, sndMark, speak, exNameForPhase])

  const start = useCallback(() => {
    ensure()
    phaseIdxRef.current  = 0
    remainingRef.current = phases[0]?.seconds ?? 0
    elapsedRef.current   = 0
    prevCeilRef.current  = -1
    halfFiredRef.current = false
    capHalfRef.current   = false
    capTenRef.current    = false
    tapsRef.current      = 0
    setTaps(0)
    statusRef.current    = 'running'
    lastRef.current      = performance.now()
    // son de départ + annonce de la 1re phase
    sndGo()
    const first = phases[0]
    if (countUp) speak('C\'est parti')
    else if (first) speak(first.kind === 'prepare' ? 'Prêts ?' : (exNameForPhase(first) || 'Effort'))
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = window.setInterval(tick, 100)
    if (countUp) emitCountUp(); else emitCountdown()
  }, [ensure, sndGo, phases, countUp, emitCountUp, emitCountdown, tick, speak, exNameForPhase])

  const pause = useCallback(() => {
    if (statusRef.current !== 'running') return
    statusRef.current = 'paused'
    if (intervalRef.current) clearInterval(intervalRef.current)
    setView(v => ({ ...v, status: 'paused' }))
  }, [])

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return
    ensure()
    statusRef.current = 'running'
    lastRef.current = performance.now()
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = window.setInterval(tick, 100)
    setView(v => ({ ...v, status: 'running' }))
  }, [ensure, tick])

  const reset = useCallback(() => {
    statusRef.current = 'idle'
    if (intervalRef.current) clearInterval(intervalRef.current)
    phaseIdxRef.current  = 0
    remainingRef.current = phases[0]?.seconds ?? 0
    elapsedRef.current   = 0
    prevCeilRef.current  = -1
    halfFiredRef.current = false
    capHalfRef.current   = false
    capTenRef.current    = false
    tapsRef.current      = 0
    setTaps(0)
    setView({ ...initial })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases])

  const skip = useCallback(() => {
    if (countUp || statusRef.current !== 'running') return
    const next = phaseIdxRef.current + 1
    if (next >= phases.length) { finish(); return }
    phaseIdxRef.current = next
    remainingRef.current = phases[next].seconds
    prevCeilRef.current = -1
    halfFiredRef.current = false
    emitCountdown()
  }, [countUp, phases, finish, emitCountdown])

  const addTap = useCallback(() => {
    if (statusRef.current !== 'running') return
    tapsRef.current += 1
    setTaps(tapsRef.current)
    if (countUp && target > 0 && tapsRef.current >= target) finish()
  }, [countUp, target, finish])

  // nettoyage
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  return { view, taps, start, pause, resume, reset, skip, addTap }
}
