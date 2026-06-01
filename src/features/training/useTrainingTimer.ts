import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compilePhases, isCountUp, type TrainingConfig, type TrainingMode } from './training'

type Status = 'idle' | 'running' | 'paused' | 'done'

export interface TimerView {
  status: Status
  kind: 'prepare' | 'work' | 'rest' | 'done'
  label: string
  value: number        // grand chiffre affiché (s)
  round: number
  totalRounds: number
  phaseIndex: number
  phaseCount: number
  elapsedTotal: number // s écoulées (pour l'historique)
}

// ── Bips Web Audio ─────────────────────────────────────────────────────────────

function useBeeper() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctxRef = useRef<any>(null)

  const ensure = useCallback(() => {
    if (!ctxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC = window.AudioContext || (window as any).webkitAudioContext
      if (AC) ctxRef.current = new AC()
    }
    if (ctxRef.current?.state === 'suspended') ctxRef.current.resume()
    return ctxRef.current
  }, [])

  const beep = useCallback((freq: number, dur: number, vol = 0.3) => {
    try {
      const ctx = ctxRef.current
      if (!ctx) return
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain); gain.connect(ctx.destination)
      const t = ctx.currentTime
      gain.gain.setValueAtTime(vol, t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.start(t)
      osc.stop(t + dur)
    } catch { /* audio indisponible */ }
  }, [])

  return { ensure, beep }
}

function vibrate(ms: number | number[]) {
  try { navigator.vibrate?.(ms) } catch { /* non supporté */ }
}

// ── Hook minuteur ───────────────────────────────────────────────────────────────

export function useTrainingTimer(mode: TrainingMode, config: TrainingConfig) {
  const { ensure, beep } = useBeeper()
  const countUp = isCountUp(mode)
  const cap = config.cap ?? 0

  const cfgKey = JSON.stringify(config)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const phases = useMemo(() => (countUp ? [] : compilePhases(mode, config)), [mode, cfgKey])

  const initial: TimerView = {
    status: 'idle',
    kind: countUp ? 'work' : (phases[0]?.kind ?? 'work'),
    label: countUp ? 'For Time' : (phases[0]?.label ?? ''),
    value: countUp ? 0 : (phases[0]?.seconds ?? 0),
    round: phases[0]?.round ?? 0,
    totalRounds: phases[0]?.totalRounds ?? 0,
    phaseIndex: 0,
    phaseCount: phases.length,
    elapsedTotal: 0,
  }

  const [view, setView] = useState<TimerView>(initial)

  const intervalRef  = useRef<number | undefined>(undefined)
  const lastRef      = useRef(0)
  const statusRef    = useRef<Status>('idle')
  const phaseIdxRef  = useRef(0)
  const remainingRef = useRef(phases[0]?.seconds ?? 0)
  const elapsedRef   = useRef(0)
  const prevCeilRef  = useRef(-1)

  const emitCountdown = useCallback(() => {
    const ph = phases[phaseIdxRef.current]
    if (!ph) return
    const value = Math.max(0, Math.ceil(remainingRef.current))
    setView(v =>
      v.value === value && v.phaseIndex === phaseIdxRef.current && v.status === 'running'
        ? v
        : {
            status: 'running',
            kind: ph.kind,
            label: ph.label,
            value,
            round: ph.round ?? 0,
            totalRounds: ph.totalRounds ?? 0,
            phaseIndex: phaseIdxRef.current,
            phaseCount: phases.length,
            elapsedTotal: Math.round(elapsedRef.current),
          }
    )
  }, [phases])

  const emitCountUp = useCallback(() => {
    const value = Math.floor(elapsedRef.current)
    setView(v =>
      v.value === value && v.status === 'running'
        ? v
        : {
            status: 'running', kind: 'work', label: 'For Time', value,
            round: 0, totalRounds: 0, phaseIndex: 0, phaseCount: 0, elapsedTotal: value,
          }
    )
  }, [])

  const finish = useCallback(() => {
    statusRef.current = 'done'
    if (intervalRef.current) clearInterval(intervalRef.current)
    beep(1200, 0.18, 0.4)
    setTimeout(() => beep(1200, 0.18, 0.4), 200)
    setTimeout(() => beep(1600, 0.3, 0.4), 400)
    vibrate([120, 80, 120, 80, 200])
    setView(v => ({ ...v, status: 'done', kind: 'done', label: 'Terminé', value: 0, elapsedTotal: Math.round(elapsedRef.current) }))
  }, [beep])

  const tick = useCallback(() => {
    const now = performance.now()
    const dt = (now - lastRef.current) / 1000
    lastRef.current = now
    if (statusRef.current !== 'running') return

    if (countUp) {
      elapsedRef.current += dt
      if (cap > 0 && elapsedRef.current >= cap) {
        elapsedRef.current = cap
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
      if (ceil !== prevCeilRef.current) {
        prevCeilRef.current = ceil
        if (ceil >= 1 && ceil <= 3) { beep(ph.kind === 'rest' ? 660 : 880, 0.1, 0.22); vibrate(40) }
      }
      if (remainingRef.current <= 0) {
        const carry = remainingRef.current
        const next  = phaseIdxRef.current + 1
        if (next >= phases.length) { finish(); return }
        phaseIdxRef.current = next
        remainingRef.current = phases[next].seconds + carry
        prevCeilRef.current = -1
        const isWork = phases[next].kind === 'work'
        beep(isWork ? 1000 : 600, 0.26, 0.38)
        vibrate(isWork ? [80, 40, 80] : 120)
      }
      emitCountdown()
    }
  }, [countUp, cap, phases, emitCountUp, emitCountdown, finish, beep])

  const start = useCallback(() => {
    ensure()
    phaseIdxRef.current  = 0
    remainingRef.current = phases[0]?.seconds ?? 0
    elapsedRef.current   = 0
    prevCeilRef.current  = -1
    statusRef.current    = 'running'
    lastRef.current      = performance.now()
    // bip de départ
    beep(900, 0.2, 0.3)
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = window.setInterval(tick, 100)
    if (countUp) emitCountUp(); else emitCountdown()
  }, [ensure, beep, phases, countUp, emitCountUp, emitCountdown, tick])

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
    emitCountdown()
  }, [countUp, phases, finish, emitCountdown])

  // nettoyage
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  return { view, start, pause, resume, reset, skip }
}
