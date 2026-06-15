import { useState, useEffect } from 'react'

export interface UseFavoritesResult {
  favorites: string[]
  addFavorite: (stationId: string) => void
  removeFavorite: (stationId: string) => void
  toggleFavorite: (stationId: string) => void
}

export function useFavorites(): UseFavoritesResult {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('velov-favorites')
      return stored ? (JSON.parse(stored) as string[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem('velov-favorites', JSON.stringify(favorites))
  }, [favorites])

  function addFavorite(stationId: string) {
    setFavorites((prev) => (prev.includes(stationId) ? prev : [...prev, stationId]))
  }

  function removeFavorite(stationId: string) {
    setFavorites((prev) => prev.filter((id) => id !== stationId))
  }

  function toggleFavorite(stationId: string) {
    setFavorites((prev) =>
      prev.includes(stationId) ? prev.filter((id) => id !== stationId) : [...prev, stationId],
    )
  }

  return { favorites, addFavorite, removeFavorite, toggleFavorite }
}
