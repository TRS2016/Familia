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

/**
 * Convertit la valeur d'un `<input type="month">` ('YYYY-MM' ou '') en date de
 * fin d'échéance = dernier jour du mois (inclut tout le mois choisi).
 */
export function monthInputToEndDate(ym: string): string | null {
  if (!ym) return null
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return null
  const lastDay = new Date(y, m, 0).getDate()
  return `${ym}-${String(lastDay).padStart(2, '0')}`
}

/** Dernier jour du mois affiché, au format 'YYYY-MM-DD'. */
export function lastDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
}

/** Échappement CSV : les noms de catégorie sont libres et peuvent contenir des virgules. */
export function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}


/** État commun aux formulaires d'ajout et d'édition d'une opération. */
export interface EntryDraft {
  category_id: string
  amount: string
  description: string
  date: string
  member_id: string | null
  tags: string[]
  recurring: boolean
  series_id: string | null
  series_end: string | null
  saving_goal_id: string | null
}

export const EMPTY_DRAFT: EntryDraft = {
  category_id: '', amount: '', description: '', date: '',
  member_id: null, tags: [], recurring: false,
  series_id: null, series_end: null, saving_goal_id: null,
}
