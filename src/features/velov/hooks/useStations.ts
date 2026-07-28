import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchStations } from '../api'
import type { Station } from '../types'

const CACHE_KEY = 'velov-stations-cache'

function loadFromCache(): Station[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return (JSON.parse(raw) as Station[]).map((s) => ({ ...s, lastUpdated: new Date(s.lastUpdated) }))
  } catch {
    return null
  }
}

function saveToCache(stations: Station[]): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify(stations.map((s) => ({ ...s, lastUpdated: s.lastUpdated.getTime() }))),
    )
  } catch {
    // non critique
  }
}

export interface UseStationsResult {
  stations: Station[]
  loading: boolean
  error: string | null
  refresh: () => void
  isFromCache: boolean
  fetchedAt: Date | null
}

export function useStations(refreshInterval = 30000): UseStationsResult {
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFromCache, setIsFromCache] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  // Backoff exponentiel : sur échecs répétés du flux GBFS, on espace les tentatives
  // (30s → 1min → 2min → … plafonné à 5min) pour ne pas marteler une API en panne.
  const failuresRef = useRef(0)
  const nextAllowedRef = useRef(0)

  const doFetch = useCallback(async () => {
    try {
      const data = await fetchStations()
      setStations(data)
      setError(null)
      setIsFromCache(false)
      setFetchedAt(new Date())
      failuresRef.current = 0
      nextAllowedRef.current = 0
      saveToCache(data)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      const cached = loadFromCache()
      if (cached) {
        setStations(cached)
        setIsFromCache(true)
      }
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      failuresRef.current += 1
      const backoff = Math.min(refreshInterval * 2 ** failuresRef.current, 5 * 60 * 1000)
      nextAllowedRef.current = Date.now() + backoff
    } finally {
      setLoading(false)
    }
  }, [refreshInterval])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (interval !== null) return
      interval = setInterval(() => {
        if (document.hidden || navigator.onLine === false) return
        if (Date.now() < nextAllowedRef.current) return // fenêtre de backoff
        void doFetch()
      }, refreshInterval)
    }
    const stop = () => {
      if (interval === null) return
      clearInterval(interval)
      interval = null
    }
    const onVisibility = () => {
      if (document.hidden) {
        stop()
      } else {
        void doFetch() // refresh immédiat au retour au premier plan
        start()
      }
    }
    const timer = setTimeout(() => void doFetch(), 0)
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [doFetch, refreshInterval])

  const refresh = useCallback(() => {
    setLoading(true)
    void doFetch()
  }, [doFetch])

  return { stations, loading, error, refresh, isFromCache, fetchedAt }
}
