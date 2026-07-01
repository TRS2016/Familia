import type { KakeboCategory } from './useKakebo'

export const CAT_META: Record<string, { glyph: string; desc: string }> = {
  fixed:    { glyph: '必', desc: 'Loyer, courses, transport' },
  leisure:  { glyph: '楽', desc: 'Sorties, restaurants, sport' },
  variable: { glyph: '知', desc: 'Livres, abonnements, ciné' },
  extra:    { glyph: '他', desc: 'Imprévus, cadeaux, divers' },
  income:   { glyph: '入', desc: 'Salaires, aides, revenus' },
  saving:   { glyph: '貯', desc: 'Virements vers le compte épargne' },
}

export function catGlyph(type: string) { return CAT_META[type]?.glyph ?? '•' }
export function catDesc(type: string)  { return CAT_META[type]?.desc ?? '' }
export function catColor(cat: KakeboCategory | null | undefined) { return cat?.color ?? '#A89F97' }

// ── Classification des types de catégorie ──────────────────────────────────
// - income  : revenus (entrée d'argent)
// - saving  : épargne mise de côté (virement vers un compte épargne, sortie du
//             compte courant mais PAS une dépense de consommation)
// - autres  : dépenses de consommation (fixed / variable / leisure / extra)
export const isIncomeType = (t: string | null | undefined) => t === 'income'
export const isSavingType = (t: string | null | undefined) => t === 'saving'
export const isSpendType  = (t: string | null | undefined) => !!t && t !== 'income' && t !== 'saving'

export function fmtEur(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export const MONTH_LABELS_FR = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']
