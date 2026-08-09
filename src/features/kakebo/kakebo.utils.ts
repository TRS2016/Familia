import type { KakeboCategory } from './useKakebo'

export const CAT_META: Record<string, { glyph: string; desc: string }> = {
  fixed:     { glyph: '必', desc: 'Loyer, courses, transport' },
  leisure:   { glyph: '楽', desc: 'Sorties, restaurants, sport' },
  variable:  { glyph: '知', desc: 'Livres, abonnements, ciné' },
  extra:     { glyph: '他', desc: 'Imprévus, cadeaux, divers' },
  income:    { glyph: '入', desc: 'Salaires, aides, revenus' },
  saving:    { glyph: '貯', desc: 'Virements vers le compte épargne' },
  allowance: { glyph: '銭', desc: 'Enveloppe dépensée librement' },
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
/** Catégorie portant la somme ALLOUÉE à l'argent de poche (une vraie dépense). */
export const isAllowanceType = (t: string | null | undefined) => t === 'allowance'

// ── Argent de poche ────────────────────────────────────────────────────────
// Une catégorie `allowance` porte l'enveloppe allouée (ex. retrait de 200 €),
// comptée comme une dépense normale. Les opérations tagguées `argent-poche`
// dans une AUTRE catégorie ne sont que le détail de ce que l'enveloppe est
// devenue : elles ne sont pas recomptées (les 200 € le seraient deux fois).
// Seul le dépassement (détail − alloué) s'ajoute aux dépenses.

export const POCKET_TAG = 'argent-poche'

type PocketEntry = { amount: number; tags?: string[] | null; category?: { type: string } | null }

/** Détail d'une enveloppe : taggué, mais hors catégorie d'allocation. */
export function isPocketDetail(e: PocketEntry): boolean {
  return (e.tags ?? []).includes(POCKET_TAG) && !isAllowanceType(e.category?.type)
}

export interface PocketBreakdown {
  /** Somme allouée ce mois (catégories de type allowance). */
  envelope: number
  /** Détail dépensé sur l'enveloppe (opérations tagguées). */
  spent: number
  /** Part du détail qui excède l'enveloppe : compte en dépense supplémentaire. */
  overflow: number
  /** Reste disponible sur l'enveloppe. */
  remaining: number
}

export function pocketBreakdown(entries: PocketEntry[]): PocketBreakdown {
  let envelope = 0
  let spent = 0
  for (const e of entries) {
    if (isAllowanceType(e.category?.type)) envelope += Number(e.amount)
    else if (isPocketDetail(e)) spent += Number(e.amount)
  }
  return {
    envelope,
    spent,
    overflow: Math.max(0, spent - envelope),
    remaining: Math.max(0, envelope - spent),
  }
}

/**
 * Total des dépenses d'un lot d'opérations, règle de l'argent de poche
 * appliquée : le détail taggué est exclu, le dépassement éventuel ajouté.
 */
export function spendTotal(entries: PocketEntry[]): number {
  const base = entries
    .filter(e => isSpendType(e.category?.type) && !isPocketDetail(e))
    .reduce((s, e) => s + Number(e.amount), 0)
  return base + pocketBreakdown(entries).overflow
}

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
