import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { calculateDistance } from '../geo'
import { DIRECTIONS } from '../navigation'
import type { RouteStep, UserPosition } from '../types'

// Base partagée avec navigation.ts ; seul l'énoncé du demi-tour diffère à l'oral.
const DIRECTION_MAP: Record<string, string> = { ...DIRECTIONS, uturn: 'faites demi-tour' }

function ordinalFr(n: number): string {
  return n === 1 ? 'première' : `${n}ème`
}

function buildSpeechText(step: RouteStep): string {
  const { type, modifier = '', exit } = step.maneuver
  const street = step.name ? ` sur ${step.name}` : ''

  if (type === 'depart') return step.name ? `Départ. Prenez ${step.name}.` : 'Départ.'
  if (type === 'arrive') return 'Vous êtes arrivé à destination.'

  if (type === 'roundabout' || type === 'rotary') {
    if (exit) return `Au rond-point, prenez la ${ordinalFr(exit)} sortie${street}.`
    return `Au rond-point, continuez${street}.`
  }
  if (type === 'exit roundabout' || type === 'exit rotary') {
    return `Quittez le rond-point${street}.`
  }
  if (type === 'fork') {
    if (modifier.includes('left')) return `Gardez la gauche${street}.`
    if (modifier.includes('right')) return `Gardez la droite${street}.`
    return `Continuez tout droit${street}.`
  }
  if (type === 'merge') {
    const dir = DIRECTION_MAP[modifier]
    return dir ? `Rejoignez la voie ${dir}${street}.` : `Rejoignez la voie${street}.`
  }
  if (type === 'end of road') {
    const dir = DIRECTION_MAP[modifier] || 'tout droit'
    return `Fin de route, tournez ${dir}${street}.`
  }
  if (type === 'new name') return step.name ? `Continuez sur ${step.name}.` : 'Continuez.'

  const dir = DIRECTION_MAP[modifier] || 'tout droit'
  return `Tournez ${dir}${street}.`
}

function buildPreSpeechText(step: RouteStep, distMeters: number): string {
  const dist = Math.round(distMeters / 25) * 25
  const text = buildSpeechText(step)
  return `Dans ${dist} mètres, ${text.charAt(0).toLowerCase()}${text.slice(1)}`
}

function getFrenchVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => v.lang.startsWith('fr') && !v.localService) ??
    voices.find((v) => v.lang.startsWith('fr')) ??
    null
  )
}

export interface UseVoiceNavigationParams {
  steps: RouteStep[] | null | undefined
  userPosition: UserPosition | null
}

export function useVoiceNavigation({ steps, userPosition }: UseVoiceNavigationParams) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [active, setActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [, setVoicesReady] = useState(0)
  const [frenchVoiceMissing, setFrenchVoiceMissing] = useState(false)
  const announcedRef = useRef(new Set<string>())
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const pendingAutoStartRef = useRef(false)
  const activeRef = useRef(false)
  useEffect(() => { activeRef.current = active })

  // Les voix se chargent de façon asynchrone — on réévalue à chaque changement.
  useEffect(() => {
    if (!supported) return
    const handler = () => {
      setVoicesReady((n) => n + 1)
      const voices = window.speechSynthesis.getVoices()
      if (voices.length > 0) setFrenchVoiceMissing(!voices.some((v) => v.lang.startsWith('fr')))
    }
    handler()
    window.speechSynthesis.addEventListener('voiceschanged', handler)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', handler)
  }, [supported])

  // speechSynthesis se met en pause silencieusement en arrière-plan (WebView/mobile).
  useEffect(() => {
    if (!supported || !active) return
    const resume = () => {
      if (window.speechSynthesis.paused || window.speechSynthesis.speaking === false) {
        window.speechSynthesis.resume()
      }
    }
    document.addEventListener('visibilitychange', resume)
    const id = setInterval(resume, 3000)
    return () => { document.removeEventListener('visibilitychange', resume); clearInterval(id) }
  }, [supported, active])

  // WakeLock : garde l'écran allumé pendant la navigation.
  useEffect(() => {
    if (!active) {
      void wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
      return
    }
    if (!('wakeLock' in navigator)) return
    navigator.wakeLock.request('screen')
      .then((lock) => { wakeLockRef.current = lock })
      .catch(() => {})
    return () => {
      void wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [active])

  const speak = useCallback((text: string) => {
    if (!supported) return
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel()
    }
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 0.95
    const voice = getFrenchVoice()
    if (voice) { utter.voice = voice; utter.lang = voice.lang }
    window.speechSynthesis.speak(utter)
  }, [supported])

  const speakStep = useCallback((index: number) => {
    if (!steps || index >= steps.length) return
    speak(buildSpeechText(steps[index]))
  }, [steps, speak])

  const startNavigation = useCallback(() => {
    announcedRef.current = new Set()
    setCurrentStep(0)
    setActive(true)
    if (steps?.length) {
      speak(buildSpeechText(steps[0]))
    } else {
      pendingAutoStartRef.current = true
      speak('Navigation démarrée.')
    }
  }, [steps, speak])

  const stopNavigation = useCallback(() => {
    pendingAutoStartRef.current = false
    setActive(false)
    if (!supported) return
    window.speechSynthesis.cancel()
  }, [supported])

  const next = useCallback(() => {
    if (!steps || currentStep >= steps.length - 1) return
    const idx = currentStep + 1
    setCurrentStep(idx)
    speakStep(idx)
  }, [steps, currentStep, speakStep])

  const prev = useCallback(() => {
    if (currentStep <= 0) return
    const idx = currentStep - 1
    setCurrentStep(idx)
    speakStep(idx)
  }, [currentStep, speakStep])

  const repeatCurrent = useCallback(() => {
    speakStep(currentStep)
  }, [currentStep, speakStep])

  useEffect(() => {
    if (!active || !userPosition || !steps || currentStep >= steps.length - 1) return
    const nextStep = steps[currentStep + 1]
    if (!nextStep?.maneuver?.location) return
    const [lng, lat] = nextStep.maneuver.location
    const dist = calculateDistance(userPosition.lat, userPosition.lng, lat, lng)

    if (dist <= 30) {
      const key = `final-${currentStep + 1}-${lat}-${lng}`
      if (announcedRef.current.has(key)) return
      announcedRef.current.add(key)
      navigator.vibrate?.([100, 50, 100])
      speak(buildSpeechText(nextStep))
      const timer = setTimeout(() => setCurrentStep(currentStep + 1), 0)
      return () => clearTimeout(timer)
    }

    if (dist <= 150) {
      const key = `pre-${currentStep + 1}-${lat}-${lng}`
      if (announcedRef.current.has(key)) return
      announcedRef.current.add(key)
      speak(buildPreSpeechText(nextStep, dist))
    }
  }, [userPosition, active, steps, currentStep, speak, speakStep])

  useEffect(() => {
    if (pendingAutoStartRef.current && steps && steps.length > 0) {
      pendingAutoStartRef.current = false
      const timer = setTimeout(() => steps && speak(buildSpeechText(steps[0])), 0)
      return () => clearTimeout(timer)
    }
    if (activeRef.current && steps && steps.length > 0) {
      announcedRef.current = new Set()
      void Promise.resolve().then(() => setCurrentStep(0))
      const timer = setTimeout(() => steps && speak(buildSpeechText(steps[0])), 0)
      return () => clearTimeout(timer)
    }
    if (supported) {
      window.speechSynthesis.cancel()
    }
    const timer = setTimeout(() => {
      setActive(false)
      setCurrentStep(0)
    }, 0)
    return () => clearTimeout(timer)
  }, [steps, supported, speak])

  const distToNextManeuver = useMemo(() => {
    if (!userPosition || !steps || currentStep >= steps.length - 1) return null
    const nextStep = steps[currentStep + 1]
    if (!nextStep?.maneuver?.location) return null
    const [lng, lat] = nextStep.maneuver.location
    return calculateDistance(userPosition.lat, userPosition.lng, lat, lng)
  }, [userPosition, steps, currentStep])

  // Note : sur le web, impossible de déclencher l'installation d'une voix système —
  // elle dépend du navigateur/OS. On se contente de signaler son absence (frenchVoiceMissing).

  return {
    supported,
    speak,
    active,
    currentStep,
    startNavigation,
    stopNavigation,
    next,
    prev,
    repeatCurrent,
    currentStepData: steps?.[currentStep] ?? null,
    nextStepData: steps?.[currentStep + 1] ?? null,
    totalSteps: steps?.length ?? 0,
    distToNextManeuver,
    frenchVoiceMissing,
  }
}
