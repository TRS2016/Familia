import type { StoredRoute } from './types'

const KEY = 'velov-saved-route'
const MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6 heures

export function saveRouteToStorage(
  route: Omit<StoredRoute, 'savedAt'>,
): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...route, savedAt: Date.now() }))
  } catch { /* quota dépassé — non critique */ }
}

export function loadRouteFromStorage(): StoredRoute | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as StoredRoute
    if (Date.now() - data.savedAt > MAX_AGE_MS) { clearRouteFromStorage(); return null }
    return data
  } catch { return null }
}

export function clearRouteFromStorage(): void {
  localStorage.removeItem(KEY)
}
