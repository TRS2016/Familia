import { format, addDays, subDays, startOfWeek } from 'date-fns'
import type { Habit, HabitCompletion } from './useHabits'

// ── Constantes partagées ──────────────────────────────────────────────────────

export const WEEK_LABELS   = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
export const EMOJI_PALETTE = ['⭐','🏃','📚','💧','🧘','🥗','😴','🎵','✍️','🌿','💊','🏋️','🎯','🚲','🧹']

export const FREQ_OPTS = [
  { value: 'daily', label: 'Quotidien' },
  { value: '3x',    label: '3×/sem.' },
  { value: '2x',    label: '2×/sem.' },
  { value: '1x',    label: '1×/sem.' },
]

// ── Calendrier ────────────────────────────────────────────────────────────────

export function weekDates(): string[] {
  const mon = startOfWeek(new Date(), { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => format(addDays(mon, i), 'yyyy-MM-dd'))
}

export function freqTarget(frequency: string): number {
  if (frequency === '3x') return 3
  if (frequency === '2x') return 2
  if (frequency === '1x') return 1
  return 7
}

/** JS getDay (0=dim…6=sam) → ISO dow (1=lun…7=dim). T12:00 évite le décalage
 *  de jour des timezones à l'ouest de Greenwich (minuit UTC + getDay local). */
export function isoDow(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00')
  return d.getDay() === 0 ? 7 : d.getDay()
}

/** Champs de planification suffisants pour savoir si une habitude est prévue
 *  un jour donné — la Home n'a qu'une projection partielle des habitudes. */
export type HabitSchedule = Pick<Habit, 'id' | 'frequency_days' | 'start_date'>

export function isApplicable(habit: Pick<Habit, 'frequency_days' | 'start_date'>, dateStr: string): boolean {
  if (habit.start_date && dateStr < habit.start_date) return false
  if (!habit.frequency_days || habit.frequency_days.length === 0) return true
  return habit.frequency_days.includes(isoDow(dateStr))
}

// ── Séries ────────────────────────────────────────────────────────────────────

export function streakMilestone(streak: number): { emoji: string } | null {
  if (streak >= 365) return { emoji: '🏆' }
  if (streak >= 100) return { emoji: '💎' }
  if (streak >= 60)  return { emoji: '🥇' }
  if (streak >= 30)  return { emoji: '🥈' }
  if (streak >= 21)  return { emoji: '🌟' }
  if (streak >= 14)  return { emoji: '⭐' }
  if (streak >= 7)   return { emoji: '🔥' }
  return null
}

/**
 * Série en cours : remonte le calendrier en ne comptant que les jours où
 * l'habitude était prévue — un mardi ne casse pas la série d'une habitude
 * lun/mer/ven, il est simplement sauté. Aujourd'hui pas encore fait n'est
 * pas pénalisé. Fenêtre bornée à 120 jours (celle des données chargées).
 */
export function calcStreak(
  habit: HabitSchedule,
  completions: Pick<HabitCompletion, 'habit_id' | 'date' | 'completed'>[],
): number {
  const doneSet = new Set(
    completions.filter(c => c.habit_id === habit.id && c.completed).map(c => c.date)
  )
  let streak = 0
  let d = new Date()
  const todayStr = format(d, 'yyyy-MM-dd')
  if (isApplicable(habit, todayStr) && !doneSet.has(todayStr)) d = subDays(d, 1)
  for (let i = 0; i < 120; i++) {
    const ds = format(d, 'yyyy-MM-dd')
    if (habit.start_date && ds < habit.start_date) break
    if (!isApplicable(habit, ds)) { d = subDays(d, 1); continue }
    if (!doneSet.has(ds)) break
    streak++
    d = subDays(d, 1)
  }
  return streak
}

/**
 * Meilleure série : parcourt du premier jour complété à aujourd'hui en ne
 * considérant que les jours prévus. Filtre `completed` lui-même (les
 * complétions d'année incluent désormais les partiels pour la heatmap).
 */
export function calcBestStreak(
  habit: HabitSchedule,
  completions: Pick<HabitCompletion, 'habit_id' | 'date' | 'completed'>[],
): number {
  const doneSet = new Set(
    completions.filter(c => c.habit_id === habit.id && c.completed).map(c => c.date)
  )
  if (doneSet.size === 0) return 0

  const first = [...doneSet].sort()[0]
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  let best = 0
  let current = 0
  let d = new Date(first + 'T12:00')
  for (let i = 0; i < 366; i++) {
    const ds = format(d, 'yyyy-MM-dd')
    if (ds > todayStr) break
    if (isApplicable(habit, ds)) {
      if (doneSet.has(ds)) {
        current++
        if (current > best) best = current
      } else if (ds !== todayStr) {
        current = 0 // aujourd'hui pas encore fait ne casse pas la série en cours
      }
    }
    d = addDays(d, 1)
  }
  return best
}
