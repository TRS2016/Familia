import { useState, useCallback } from 'react'
import type { FavoriteRoute, RoutePoint } from '../types'

const STORAGE_KEY = 'velov-favorite-routes'

function loadRoutes(): FavoriteRoute[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as FavoriteRoute[] }
  catch { return [] }
}

export interface UseFavoriteRoutesResult {
  favoriteRoutes: FavoriteRoute[]
  saveRoute: (origin: RoutePoint, destination: RoutePoint) => void
  removeRoute: (id: string) => void
}

export function useFavoriteRoutes(): UseFavoriteRoutesResult {
  const [favoriteRoutes, setFavoriteRoutes] = useState<FavoriteRoute[]>(loadRoutes)

  const saveRoute = useCallback((origin: RoutePoint, destination: RoutePoint) => {
    setFavoriteRoutes((prev) => {
      const id = `${origin.id}-${destination.id}`
      if (prev.some((r) => r.id === id)) return prev
      const next = [{ id, origin, destination }, ...prev].slice(0, 10)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const removeRoute = useCallback((id: string) => {
    setFavoriteRoutes((prev) => {
      const next = prev.filter((r) => r.id !== id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { favoriteRoutes, saveRoute, removeRoute }
}
