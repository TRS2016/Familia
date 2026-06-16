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

// ── Tri & groupage de la liste ─────────────────────────────────────────────────

// Applique l'ordre manuel (drag & drop) : les ids absents passent en fin.
export function applyOrder(items: Grocery[], orderedIds: string[]): Grocery[] {
  if (!orderedIds.length) return items
  const rank = new Map(orderedIds.map((id, i) => [id, i]))
  return [...items].sort((a, b) => (rank.get(a.id) ?? orderedIds.length) - (rank.get(b.id) ?? orderedIds.length))
}

// Articles cochés, du plus récemment coché au plus ancien.
export function sortChecked(items: Grocery[]): Grocery[] {
  return items
    .filter(g => g.checked)
    .sort((a, b) =>
      new Date(b.checked_at ?? b.created_at).getTime() -
      new Date(a.checked_at ?? a.created_at).getTime()
    )
}

export type Group = { label: string | null; items: Grocery[] }

export function groupByCategory(items: Grocery[]): Group[] {
  const hasAny = items.some(g => g.category)
  if (!hasAny) return [{ label: null, items }]

  const map = new Map<string | null, Grocery[]>()
  for (const item of items) {
    const k = item.category && CATEGORY_ORDER.includes(item.category as CategoryKey) ? item.category : null
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  const ordered: Group[] = []
  for (const key of CATEGORY_ORDER) {
    if (map.has(key)) ordered.push({ label: key, items: map.get(key)! })
  }
  if (map.has(null)) ordered.push({ label: null, items: map.get(null)! })
  return ordered
}

export function groupByStore(items: Grocery[]): Group[] {
  const hasAny = items.some(g => g.store)
  if (!hasAny) return [{ label: null, items }]

  // Conserve l'ordre d'apparition des enseignes.
  const groupOrder: (string | null)[] = []
  const map = new Map<string | null, Grocery[]>()
  for (const item of items) {
    const k = item.store || null
    if (!map.has(k)) { map.set(k, []); groupOrder.push(k) }
    map.get(k)!.push(item)
  }
  return groupOrder.map(k => ({ label: k, items: map.get(k)! }))
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
  // Accepte la virgule décimale française (« 1,5 » → 1.5).
  const n = Number(qty.trim().replace(',', '.'))
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
