import type { KakeboCategory } from './useKakebo'

export const CAT_META: Record<string, { glyph: string; desc: string }> = {
  fixed:    { glyph: '必', desc: 'Loyer, courses, transport' },
  leisure:  { glyph: '楽', desc: 'Sorties, restaurants, sport' },
  variable: { glyph: '知', desc: 'Livres, abonnements, ciné' },
  extra:    { glyph: '他', desc: 'Imprévus, cadeaux, divers' },
  income:   { glyph: '入', desc: 'Salaires, aides, revenus' },
}

export function catGlyph(type: string) { return CAT_META[type]?.glyph ?? '•' }
export function catDesc(type: string)  { return CAT_META[type]?.desc ?? '' }
export function catColor(cat: KakeboCategory | null | undefined) { return cat?.color ?? '#A89F97' }

export function fmtEur(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export const MONTH_LABELS_FR = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']
