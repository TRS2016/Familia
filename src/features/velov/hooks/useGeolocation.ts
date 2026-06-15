import { useState, useCallback, useEffect, useRef } from 'react'
import type { UserPosition } from '../types'

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

export interface UseGeolocationResult {
  position: UserPosition | null
  accuracy: number | null
  error: string | null
  startWatching: () => void
  stopWatching: () => void
}

export function useGeolocation(): UseGeolocationResult {
  const [position, setPosition] = useState<UserPosition | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const watchIdRef = useRef<number | null>(null)

  const stopWatching = useCallback(() => {
    const id = watchIdRef.current
    if (id === null) return
    watchIdRef.current = null
    navigator.geolocation.clearWatch(id)
  }, [])

  const startWatching = useCallback(() => {
    stopWatching()
    setError(null)
    if (!navigator.geolocation) {
      setError('Géolocalisation non supportée par votre navigateur')
      return
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setAccuracy(Math.round(pos.coords.accuracy))
      },
      (err) => setError(frGeoError(err)),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    )
  }, [stopWatching])

  useEffect(() => {
    return () => stopWatching()
  }, [stopWatching])

  return { position, accuracy, error, startWatching, stopWatching }
}
