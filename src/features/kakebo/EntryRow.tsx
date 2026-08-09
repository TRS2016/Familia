import { RefreshCcw, Pencil, Trash2 } from 'lucide-react'
import { catColor, fmtEur, isPocketDetail, MONTH_LABELS_FR } from './kakebo.utils'
import type { KakeboEntry } from './useKakebo'
import styles from './KakeboPage.module.css'

export default function EntryRow({ entry, showBorder, onEdit, onDelete, onReplay }: {
  entry: KakeboEntry
  showBorder: boolean
  onEdit?: () => void
  onDelete?: () => void
  onReplay?: () => void
}) {
  const cat = entry.category
  const isIncome = cat?.type === 'income'
  const onPocket = isPocketDetail(entry)
  return (
    <div className={[styles.entryRow, showBorder ? styles.entryRowBorder : ''].join(' ')}>
      <div className={styles.entryDateBox} style={{ background: `${catColor(cat)}1F` }}>
        <span className={styles.entryDay} style={{ color: catColor(cat) }}>
          {entry.date.slice(8)}
        </span>
        <span className={styles.entryMon} style={{ color: catColor(cat) }}>
          {MONTH_LABELS_FR[parseInt(entry.date.slice(5, 7)) - 1]}
        </span>
      </div>
      <div className={styles.entryBody}>
        <p className={styles.entryDesc}>
          {entry.description ?? cat?.name ?? '—'}
          {entry.recurring && (
            <span className={styles.entryRecur} title={entry.series_end ? `Charge fixe jusqu'à ${MONTH_LABELS_FR[parseInt(entry.series_end.slice(5, 7)) - 1]} ${entry.series_end.slice(0, 4)}` : 'Charge fixe mensuelle'}>
              {' '}🔁{entry.series_end ? ` → ${MONTH_LABELS_FR[parseInt(entry.series_end.slice(5, 7)) - 1]} ${entry.series_end.slice(2, 4)}` : ''}
            </span>
          )}
        </p>
        <p className={styles.entryMeta}>
          {cat?.name}{entry.member?.display_name ? ` · ${entry.member.display_name}` : ''}
          {onPocket && <span className={styles.pocketBadge} title="Détail de l'enveloppe d'argent de poche — non recompté dans les dépenses">sur enveloppe</span>}
        </p>
        {(entry.tags ?? []).length > 0 && (
          <div className={styles.entryTags}>
            {(entry.tags ?? []).map(t => (
              <span key={t} className={styles.entryTag}>#{t}</span>
            ))}
          </div>
        )}
      </div>
      <div className={styles.entryRight}>
        <span
          className={styles.entryAmount}
          style={isIncome ? { color: '#5B9E8F' } : onPocket ? { color: 'var(--text-muted)' } : undefined}
        >
          {isIncome ? '+' : '−'}{fmtEur(Number(entry.amount))} €
        </span>
        {onReplay && (
          <button className={styles.replayBtn} onClick={onReplay} aria-label="Rejouer">
            <RefreshCcw size={12} strokeWidth={2} />
          </button>
        )}
        {onEdit && (
          <button className={styles.editBtn} onClick={onEdit} aria-label="Modifier">
            <Pencil size={13} strokeWidth={2} />
          </button>
        )}
        {onDelete && (
          <button className={styles.deleteBtn} onClick={onDelete} aria-label="Supprimer">
            <Trash2 size={14} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  )
}
