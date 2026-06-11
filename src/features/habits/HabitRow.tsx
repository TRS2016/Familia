import { useState } from 'react'
import { Archive, BarChart2, ChevronDown, ChevronUp, Flame, MoreHorizontal, Pencil, StickyNote, Trash2 } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import type { Habit } from './useHabits'
import { freqTarget, streakMilestone } from './habits.utils'
import styles from './HabitsPage.module.css'

// Ligne d'habitude : check/compteur du jour, badges (série, fréquence, taux
// mensuel, note) et bottom sheet d'actions.
export default function HabitRow({ habit, color, streak, monthlyRate, weekDone, done, count, target, hasNote, readOnly = false, onToggle, onNote, onDelete, onEdit, onStats, onArchive, canReorder, isFirst, isLast, onMoveUp, onMoveDown }: {
  habit: Habit
  color: string
  streak: number
  monthlyRate?: number
  weekDone: number
  done: boolean
  count: number
  target: number
  hasNote: boolean
  readOnly?: boolean
  onToggle: () => void
  onNote: () => void
  onDelete: () => void
  onEdit: () => void
  onStats: () => void
  onArchive: () => void
  canReorder: boolean
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [showSheet, setShowSheet] = useState(false)

  const weekTarget = habit.frequency_days?.length ?? freqTarget(habit.frequency ?? 'daily')
  const isOnTrack  = weekDone >= weekTarget
  const nonDaily   = (habit.frequency_days?.length ?? 0) > 0 || (habit.frequency ?? 'daily') !== 'daily'
  const isAvoid    = habit.kind === 'avoid'
  const checkColor = isAvoid ? '#5B9E8F' : color

  return (
    <>
      <div className={styles.habitItem}>
        <span className={styles.rowEmoji}>{habit.emoji}</span>
        <div className={styles.rowMeta}>
          <span className={styles.rowName}>
            {habit.name}
            {isAvoid && <span className={styles.avoidTag}>🚫 à éviter</span>}
          </span>
          <div className={styles.rowStreak}>
            {streakMilestone(streak) ? (
              <span className={styles.milestoneBadge} style={{ color }}>
                {streakMilestone(streak)!.emoji} {streak}j
              </span>
            ) : (
              <>
                <Flame size={10} strokeWidth={2.5} color="#E07B54" />
                <span className={styles.rowStreakVal}>{streak}j</span>
              </>
            )}
            {nonDaily && (
              <span className={[styles.rowFreqBadge, isOnTrack ? styles.rowFreqDone : ''].join(' ')}>
                {weekDone}/{weekTarget}
              </span>
            )}
            {monthlyRate !== undefined && (
              <span
                className={styles.monthlyRateBadge}
                style={{ color: monthlyRate >= 80 ? '#5B9E8F' : monthlyRate >= 50 ? 'var(--text-muted)' : '#E07B54' }}
              >
                {monthlyRate}%
              </span>
            )}
            {hasNote && <StickyNote size={11} strokeWidth={2} className={styles.noteIndicator} />}
          </div>
        </div>
        <button
          className={styles.rowMoreBtn}
          onClick={() => setShowSheet(true)}
          aria-label="Actions"
          data-no-feedback
        >
          <MoreHorizontal size={15} strokeWidth={2} />
        </button>
        {target > 1 ? (
          <button
            className={[styles.habitCount, done ? styles.habitCountDone : ''].join(' ')}
            style={done ? { background: checkColor, borderColor: checkColor }
                        : count > 0 ? { borderColor: checkColor, color: checkColor } : {}}
            onClick={onToggle}
            disabled={readOnly}
            aria-label={`Progression ${count} sur ${target}`}
          >
            {done ? <span className={styles.checkMark}>✓</span> : <span className={styles.habitCountText}>{count}/{target}</span>}
          </button>
        ) : (
          <button
            className={[styles.habitCheck, done ? styles.habitCheckDone : ''].join(' ')}
            style={done ? { background: checkColor, borderColor: checkColor } : {}}
            onClick={onToggle}
            disabled={readOnly}
            aria-label={done ? (isAvoid ? 'Annuler « tenu »' : 'Décocher') : (isAvoid ? 'Marquer tenu' : 'Cocher')}
            aria-pressed={done}
          >
            {done && <span className={styles.checkMark}>✓</span>}
          </button>
        )}
      </div>

      {showSheet && (
        <SlideUpModal
          title={`${habit.emoji} ${habit.name}`}
          onClose={() => setShowSheet(false)}
        >
          <div className={styles.habitSheet}>
            {canReorder && (
              <>
                <button className={styles.habitSheetAction} disabled={isFirst} onClick={() => { onMoveUp(); setShowSheet(false) }}>
                  <ChevronUp size={18} strokeWidth={2} />
                  <span>Monter</span>
                </button>
                <button className={styles.habitSheetAction} disabled={isLast} onClick={() => { onMoveDown(); setShowSheet(false) }}>
                  <ChevronDown size={18} strokeWidth={2} />
                  <span>Descendre</span>
                </button>
              </>
            )}
            <button className={styles.habitSheetAction} onClick={() => { onNote(); setShowSheet(false) }}>
              <StickyNote size={18} strokeWidth={2} />
              <span>{hasNote ? 'Modifier la note du jour' : 'Ajouter une note'}</span>
            </button>
            <button className={styles.habitSheetAction} onClick={() => { onStats(); setShowSheet(false) }}>
              <BarChart2 size={18} strokeWidth={2} />
              <span>Statistiques</span>
            </button>
            <button className={styles.habitSheetAction} onClick={() => { onEdit(); setShowSheet(false) }}>
              <Pencil size={18} strokeWidth={2} />
              <span>Modifier</span>
            </button>
            <button className={styles.habitSheetAction} onClick={() => { onArchive(); setShowSheet(false) }}>
              <Archive size={18} strokeWidth={2} />
              <span>Archiver</span>
            </button>
            <button
              className={[styles.habitSheetAction, styles.habitSheetDanger].join(' ')}
              onClick={() => { onDelete(); setShowSheet(false) }}
            >
              <Trash2 size={18} strokeWidth={2} />
              <span>Supprimer</span>
            </button>
          </div>
        </SlideUpModal>
      )}
    </>
  )
}
