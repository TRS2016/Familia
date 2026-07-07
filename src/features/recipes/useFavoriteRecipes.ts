import { useCallback, useState } from 'react'

const KEY = 'familia-recipes-favorites'

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/**
 * Favoris de recettes — préférence locale à l'appareil (pas de colonne en
 * base) : comme les vues jour/semaine ailleurs, c'est un confort d'affichage,
 * pas une donnée du foyer.
 */
export function useFavoriteRecipes() {
  const [favorites, setFavorites] = useState<Set<string>>(load)
  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem(KEY, JSON.stringify([...next]))
      return next
    })
  }, [])
  return { favorites, toggleFavorite }
}
