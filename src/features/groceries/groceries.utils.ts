export const CATEGORIES = [
  { key: 'Fruits & légumes', emoji: '🥦' },
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
