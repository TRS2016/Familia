import type { Grocery } from './useGroceries'

export const CATEGORIES = [
  { key: 'Fruits & légumes', emoji: '🥦' },
  { key: 'Boucherie',        emoji: '🥩' },
  { key: 'Boulangerie',      emoji: '🥖' },
  { key: 'Frais',            emoji: '🧊' },
  { key: 'Épicerie',         emoji: '🥫' },
  { key: 'Boissons',         emoji: '🥤' },
  { key: 'Hygiène',          emoji: '🧴' },
  { key: 'Autre',            emoji: '📦' },
] as const

export type CategoryKey = typeof CATEGORIES[number]['key']
export const CATEGORY_ORDER = CATEGORIES.map(c => c.key)

export function getCategoryEmoji(key: string | null): string {
  if (!key) return ''
  return CATEGORIES.find(c => c.key === key)?.emoji ?? ''
}

export function formatPrice(price: number): string {
  return price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

// ── Total estimé ──────────────────────────────────────────────────────────────

// Quantité numérique = multiplicateur de prix (« 3 » → ×3), mais bornée :
// « 500 » désigne presque sûrement des grammes, pas 500 unités — on retombe
// alors sur ×1 plutôt que de faire exploser le total estimé.
export function parseQtyMultiplier(qty: string | null): number {
  if (!qty) return 1
  const n = Number(qty.trim())
  return Number.isFinite(n) && n > 0 && n <= 50 ? n : 1
}

export function computeTotal(items: Grocery[]): number {
  return items
    .filter(g => g.price !== null)
    .reduce((sum, g) => sum + (g.price! * parseQtyMultiplier(g.quantity)), 0)
}

// ── Dates de session ──────────────────────────────────────────────────────────

export function formatSessionDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diffDays === 0) return "Aujourd'hui"
  if (diffDays === 1) return 'Hier'
  if (diffDays < 7) return `Il y a ${diffDays}j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// ── Persistance locale (suggestions noms / enseignes) ─────────────────────────

const STORES_STORAGE_KEY = 'familia-grocery-stores'
const NAMES_STORAGE_KEY  = 'familia-grocery-names'

export function getStoredStores(): string[] {
  try { return JSON.parse(localStorage.getItem(STORES_STORAGE_KEY) ?? '[]') }
  catch { return [] }
}

export function persistStore(name: string) {
  const existing = getStoredStores()
  if (!existing.includes(name)) {
    localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify([...existing, name].slice(-30)))
  }
}

export function getStoredNames(): string[] {
  try { return JSON.parse(localStorage.getItem(NAMES_STORAGE_KEY) ?? '[]') }
  catch { return [] }
}

export function persistName(name: string) {
  const existing = getStoredNames()
  const updated = [name, ...existing.filter(n => n !== name)].slice(0, 50)
  localStorage.setItem(NAMES_STORAGE_KEY, JSON.stringify(updated))
}
