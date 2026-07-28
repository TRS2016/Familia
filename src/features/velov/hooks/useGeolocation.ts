import { useState, useCallback, useEffect, useRef } from 'react'
import type { UserPosition } from '../types'

// NOTE arrière-plan : `watchPosition` s'arrête dès que l'écran se verrouille ou que
// l'app passe en arrière-plan (iOS suspend, Android throttle). La géoloc en tâche
// de fond est une capacité NATIVE uniquement — indisponible en PWA. La navigation
// vélo verrouillée nécessiterait un repackaging Capacitor (cf. velov-integration).
// Le Wake Lock (useVoiceNavigation) garde l'écran allumé pendant le guidage actif,
// ce qui suffit tant que l'app reste au premier plan.

// Traduit les erreurs de géolocalisation (codes + messages) en français.
function frGeoError(err: GeolocationPositionError | { code?: number; message?: string }): string {
  const code = err?.code
  const msg = (err?.message || '').toLowerCase()
  if (code === 1 || msg.includes('denied') || msg.includes('permission')) {
    return "Localisation refusée — autorisez l'accès à votre position dans les réglages."
  }
  if (code === 3 || msg.includes('timeout')) {
    return 'Localisation trop longue — réessayez en extérieur ou vérifiez le GPS.'
  }
  if (code === 2 || msg.includes('unavailable') || msg.includes('position')) {
    return 'Position indisponible — signal GPS introuvable.'
  }
  return 'Impossible de récupérer votre position.'
}

// Un fix très imprécis (triangulation wifi/IP, fréquent sur PC) est écarté tant
// qu'un fix correct est récent — sinon on le garde : mieux vaut une position
// grossière que rien.
const POOR_ACCURACY_M = 150
const GOOD_FIX_MAX_AGE_MS = 20000

export interface UseGeolocationResult {
  position: UserPosition | null
  accuracy: number | null
  /** Cap en degrés (0 = nord), disponible uniquement en mouvement. */
  heading: number | null
  /** Position posée à la main sur la carte (pas de GPS — ex. poste de travail). */
  isManual: boolean
  error: string | null
  startWatching: () => void
  stopWatching: () => void
  setManualPosition: (pos: UserPosition | null) => void
}

export function useGeolocation(): UseGeolocationResult {
  const [position, setPosition] = useState<UserPosition | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [isManual, setIsManual] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastGoodFixAtRef = useRef(0)

  const stopWatching = useCallback(() => {
    const id = watchIdRef.current
    if (id === null) return
    watchIdRef.current = null
    navigator.geolocation.clearWatch(id)
  }, [])

  const startWatching = useCallback(() => {
    stopWatching()
    setError(null)
    setIsManual(false)
    if (!navigator.geolocation) {
      setError('Géolocalisation non supportée par votre navigateur')
      return
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy
        const now = Date.now()
        if (acc > POOR_ACCURACY_M && now - lastGoodFixAtRef.current < GOOD_FIX_MAX_AGE_MS) return
        if (acc <= POOR_ACCURACY_M) lastGoodFixAtRef.current = now
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setAccuracy(Math.round(acc))
        // Le cap n'est fiable qu'en mouvement ; à l'arrêt on l'efface pour ne
        // pas afficher une flèche figée dans une direction arbitraire.
        const h = pos.coords.heading
        const speed = pos.coords.speed
        if (h != null && !Number.isNaN(h) && speed != null && speed > 0.5) setHeading(h)
        else if (speed != null && speed <= 0.2) setHeading(null)
      },
      (err) => setError(frGeoError(err)),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
  }, [stopWatching])

  const setManualPosition = useCallback((pos: UserPosition | null) => {
    stopWatching()
    setError(null)
    setHeading(null)
    setAccuracy(null)
    setPosition(pos)
    setIsManual(pos != null)
  }, [stopWatching])

  // Si la permission est déjà accordée, démarre sans attendre un tap sur
  // « Localiser » (aucun prompt déclenché : on ne démarre que si 'granted').
  useEffect(() => {
    let cancelled = false
    navigator.permissions?.query({ name: 'geolocation' })
      .then((status) => { if (!cancelled && status.state === 'granted') startWatching() })
      .catch(() => {})
    return () => { cancelled = true }
  }, [startWatching])

  useEffect(() => {
    return () => stopWatching()
  }, [stopWatching])

  return { position, accuracy, heading, isManual, error, startWatching, stopWatching, setManualPosition }
}
