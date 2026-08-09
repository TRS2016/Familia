import { useCallback, useEffect, useRef, useState } from 'react'

const FADE_MS = 8000

export interface SleepTimer {
  /** Échéance en epoch ms, ou null. */
  until: number | null
  /** Arrêt à la fin de la piste en cours (pas de minuterie). */
  endOfTrack: boolean
  active: boolean
  minutesLeft: number | null
  /** Facteur de volume du fondu de sortie (1 → 0 sur les dernières secondes). */
  fadeFactor: number
  set: (minutes: number | null, endOfTrack?: boolean) => void
  /** Prolonge de 5 minutes une minuterie en cours. */
  extend: () => void
  clear: () => void
}

/**
 * Minuteur de sommeil : fondu de sortie sur les dernières secondes puis appel
 * de `onExpire` (qui coupe la lecture). Extrait de LecteurPage, qui portait
 * cinq préoccupations indépendantes dans un même fichier.
 */
export function useSleepTimer(onExpire: () => void): SleepTimer {
  const [until, setUntil] = useState<number | null>(null)
  const [endOfTrack, setEndOfTrack] = useState(false)
  const [fadeFactor, setFadeFactor] = useState(1)
  const [now, setNow] = useState(() => Date.now())

  // Réf pour ne pas relancer la minuterie quand l'appelant recrée sa callback.
  const onExpireRef = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire })

  useEffect(() => {
    if (until == null) return
    const tick = setInterval(() => setNow(Date.now()), 20_000)
    const total = until - Date.now()
    let fadeInt: ReturnType<typeof setInterval> | null = null
    const fadeStart = setTimeout(() => {
      const start = Date.now()
      fadeInt = setInterval(() => {
        setFadeFactor(1 - Math.min(1, (Date.now() - start) / FADE_MS))
      }, 200)
    }, Math.max(0, total - FADE_MS))
    const timer = setTimeout(() => {
      onExpireRef.current()
      setUntil(null)
      setFadeFactor(1)
    }, Math.max(0, total))
    return () => {
      clearInterval(tick); clearTimeout(fadeStart); clearTimeout(timer)
      if (fadeInt) clearInterval(fadeInt)
    }
  }, [until])

  const set = useCallback((minutes: number | null, eot = false) => {
    setEndOfTrack(eot)
    setUntil(minutes != null ? Date.now() + minutes * 60_000 : null)
    setNow(Date.now())
    setFadeFactor(1)
  }, [])

  const extend = useCallback(() => {
    setEndOfTrack(false)
    setUntil(u => (u ?? Date.now()) + 5 * 60_000)
    setNow(Date.now())
    setFadeFactor(1)
  }, [])

  const clear = useCallback(() => {
    setEndOfTrack(false)
    setUntil(null)
    setFadeFactor(1)
  }, [])

  return {
    until,
    endOfTrack,
    active: until != null || endOfTrack,
    minutesLeft: until != null ? Math.max(0, Math.ceil((until - now) / 60_000)) : null,
    fadeFactor,
    set,
    extend,
    clear,
  }
}
