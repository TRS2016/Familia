import { useState } from 'react'
import type { FormEvent } from 'react'
import SlideUpModal from '../../components/SlideUpModal'
import Spinner from '../../components/Spinner'
import { useProposeRule, PRIORITY_META } from './useRules'
import type { HouseholdRule } from './useRules'
import styles from './RulesPage.module.css'

const RULE_EMOJIS = ['📜', '💰', '🍽️', '🧽', '🛒', '📅', '🧊', '👕', '🌙', '🧸', '📵', '🧹', '🤝', '🛁', '🚗', '🎨', '🧒', '💞', '🕊️', '🗑️', '🧺', '🛏️', '💪', '😴', '🏦', '📝', '⚖️', '✨']

/**
 * Proposer un commandement : nouveau (revising absent) ou révision d'un
 * commandement actif (revising présent). Dans les deux cas la proposition
 * doit être validée par l'autre parent avant d'entrer dans la loi.
 */
export default function RuleFormModal({ revising, onClose }: {
  revising?: HouseholdRule | null
  onClose: () => void
}) {
  const propose = useProposeRule()
  const [text, setText] = useState(revising?.text ?? '')
  const [emoji, setEmoji] = useState(revising?.emoji ?? '📜')
  const [priority, setPriority] = useState<1 | 2 | 3>(revising?.priority ?? 2)
  const [points, setPoints] = useState(String(revising?.points ?? PRIORITY_META[2].points))

  function pickPriority(p: 1 | 2 | 3) {
    setPriority(p)
    setPoints(String(PRIORITY_META[p].points))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const pts = parseInt(points, 10)
    if (!text.trim() || isNaN(pts) || pts <= 0) return
    propose.mutate(
      {
        action: revising ? 'edit' : 'add',
        text,
        emoji,
        priority,
        points: pts,
        replaces_rule_id: revising?.id ?? null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <SlideUpModal
      title={revising ? 'Proposer une révision' : 'Proposer un commandement'}
      onClose={onClose}
    >
      <form onSubmit={submit} className={styles.form}>
        <label className={styles.formLabel}>
          Texte (ton solennel-fun encouragé)
          <textarea
            className={styles.formArea}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Tu ne laisseras point…"
            rows={3}
            required
            autoFocus={!revising}
          />
        </label>

        <div className={styles.formLabel}>
          Emoji
          <div className={styles.chipRow}>
            {RULE_EMOJIS.map(em => (
              <button
                key={em}
                type="button"
                className={[styles.chip, emoji === em ? styles.chipActive : ''].join(' ')}
                onClick={() => setEmoji(em)}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.formLabel}>
          Priorité
          <div className={styles.chipRow}>
            {([1, 2, 3] as const).map(p => (
              <button
                key={p}
                type="button"
                className={[styles.chip, priority === p ? styles.chipActive : ''].join(' ')}
                style={priority === p ? { borderColor: PRIORITY_META[p].color, color: PRIORITY_META[p].color } : {}}
                onClick={() => pickPriority(p)}
              >
                {PRIORITY_META[p].label}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.formLabel}>
          Points perdus en cas de manquement
          <input
            className={styles.formInput}
            type="number"
            min="1"
            max="50"
            value={points}
            onChange={e => setPoints(e.target.value)}
            required
          />
        </label>

        <button type="submit" className={styles.submitBtn} disabled={propose.isPending || !text.trim()}>
          {propose.isPending ? <Spinner size={14} /> : 'Soumettre à l\'autre parent 🕊️'}
        </button>
      </form>
    </SlideUpModal>
  )
}
