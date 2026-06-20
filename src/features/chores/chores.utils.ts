import { format, addDays, startOfWeek, differenceInCalendarDays, differenceInCalendarWeeks } from 'date-fns'
import type { Chore } from './useChores'

export const WEEK_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export const EMOJI_PALETTE = ['🧹','🍳','🍽️','🚗','🛁','🍼','🌙','🗑️','🛒','👕','🐶','🐾','🌿','📄','✨','💪']

// Référence stable pour les cycles de rotation (un lundi).
const ROTATION_EPOCH = new Date('2024-01-01T12:00') // lundi

/** JS getDay (0=dim…6=sam) → ISO dow (1=lun…7=dim). T12:00 évite le décalage TZ. */
export function isoDow(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00')
  return d.getDay() === 0 ? 7 : d.getDay()
}

export function weekDates(weekStart?: Date): string[] {
  const mon = startOfWeek(weekStart ?? new Date(), { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => format(addDays(mon, i), 'yyyy-MM-dd'))
}

/** La tâche est-elle prévue ce jour ? (start_date + frequency_days, comme les habits) */
export function isApplicable(chore: Pick<Chore, 'frequency' | 'frequency_days' | 'start_date'>, dateStr: string): boolean {
  if (chore.frequency === 'none') return false
  if (chore.start_date && dateStr < chore.start_date) return false
  if (!chore.frequency_days || chore.frequency_days.length === 0) return true
  return chore.frequency_days.includes(isoDow(dateStr))
}

/**
 * Membre dû pour une tâche à une date donnée.
 * - rotation_member_ids défini : cycle (par semaine ou par jour) sur la liste.
 * - sinon : default_member_id (ou null = libre, n'importe qui).
 */
export function dueMemberFor(chore: Pick<Chore, 'rotation_member_ids' | 'rotation_period' | 'default_member_id'>, dateStr: string): string | null {
  const ids = chore.rotation_member_ids
  if (ids && ids.length > 0) {
    const d = new Date(dateStr + 'T12:00')
    const cycle = chore.rotation_period === 'day'
      ? differenceInCalendarDays(d, ROTATION_EPOCH)
      : differenceInCalendarWeeks(d, ROTATION_EPOCH, { weekStartsOn: 1 })
    const idx = ((cycle % ids.length) + ids.length) % ids.length
    return ids[idx]
  }
  return chore.default_member_id
}

export const FREQ_OPTS = [
  { value: 'daily',  label: 'Tous les jours' },
  { value: 'weekly', label: 'Jours choisis' },
  { value: 'none',   label: 'À la demande' },
]

// ── Stats par membre (pour les badges) ────────────────────────────────────────

interface LogLike { member_id: string; chore_id: string | null; done_on: string }

export interface MemberStats {
  totalChores: number
  byCategory: Record<string, number>
  streakDays: number
}

/** Agrège les logs d'un membre : total, répartition par catégorie, série de jours. */
export function memberStats(
  logs: LogLike[],
  categoryByChore: Map<string, string>,
  memberId: string,
): MemberStats {
  const mine = logs.filter(l => l.member_id === memberId)
  const byCategory: Record<string, number> = {}
  const dayset = new Set<string>()
  for (const l of mine) {
    dayset.add(l.done_on)
    if (l.chore_id) {
      const cat = categoryByChore.get(l.chore_id)
      if (cat) byCategory[cat] = (byCategory[cat] ?? 0) + 1
    }
  }
  // Série : jours consécutifs avec au moins une tâche, en remontant depuis
  // aujourd'hui (ou hier si rien aujourd'hui — pas encore pénalisant).
  let streakDays = 0
  let d = new Date()
  const todayStr = format(d, 'yyyy-MM-dd')
  if (!dayset.has(todayStr)) d = addDays(d, -1)
  for (let i = 0; i < 366; i++) {
    const ds = format(d, 'yyyy-MM-dd')
    if (!dayset.has(ds)) break
    streakDays++
    d = addDays(d, -1)
  }
  return { totalChores: mine.length, byCategory, streakDays }
}
