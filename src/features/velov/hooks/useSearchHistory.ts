import { useState, useCallback } from 'react'
import type { SearchPlace } from '../types'

const STORAGE_KEY = 'velov-search-history'
const MAX_HISTORY = 5

function loadHistory(): SearchPlace[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as SearchPlace[] }
  catch { return [] }
}

export interface UseSearchHistoryResult {
  history: SearchPlace[]
  addToHistory: (place: SearchPlace) => void
  clearHistory: () => void
}

export function useSearchHistory(): UseSearchHistoryResult {
  const [history, setHistory] = useState<SearchPlace[]>(loadHistory)

  const addToHistory = useCallback((place: SearchPlace) => {
    setHistory((prev) => {
      const filtered = prev.filter((p) => p.id !== place.id)
      const next = [place, ...filtered].slice(0, MAX_HISTORY)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setHistory([])
  }, [])

  return { history, addToHistory, clearHistory }
}
