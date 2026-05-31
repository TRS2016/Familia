import { ExternalLink } from 'lucide-react'
import { memberColor } from '../../lib/constants'
import type { MediaItem } from './useMedia'
import styles from './MediaPage.module.css'

export const TYPE_META: Record<string, { emoji: string; label: string }> = {
  film:  { emoji: '🎬', label: 'Film'  },
  série: { emoji: '📺', label: 'Série' },
  livre: { emoji: '📚', label: 'Livre' },
  jeu:   { emoji: '🎮', label: 'Jeu'   },
}

export const STATUS_STYLE: Record<string, { background: string; color: string; borderColor: string }> = {
  'à voir':   { background: 'transparent',              color: 'var(--text-muted)', borderColor: 'var(--border)' },
  'en cours': { background: 'rgba(224,123,84,0.12)',    color: 'var(--accent)',     borderColor: 'var(--accent)' },
  'terminé':  { background: 'rgba(91,158,143,0.12)',    color: '#5B9E8F',           borderColor: '#5B9E8F' },
}

export default function MediaRow({ item, members, done = false, onCycleStatus, onOpen }: {
  item: MediaItem
  members: { id: string; display_name: string }[]
  done?: boolean
  onCycleStatus: () => void
  onOpen: () => void
}) {
  const meta      = TYPE_META[item.type]
  const memberIdx = members.findIndex(m => m.id === item.member_id)

  const subParts: string[] = []
  if (item.author_director) subParts.push(item.author_director)
  if (item.release_year)    subParts.push(String(item.release_year))

  return (
    <li
      className={[styles.item, done ? styles.itemDone : ''].join(' ')}
      onClick={onOpen}
      role="button"
      tabIndex={0}
    >
      <span className={styles.typeEmoji}>{meta.emoji}</span>
      <div className={styles.itemBody}>
        <div className={styles.itemTitleRow}>
          <span className={styles.itemTitle}>{item.title}</span>
          {item.external_url && (
            <ExternalLink size={10} strokeWidth={2.5} className={styles.itemPlayIcon} />
          )}
        </div>
        <div className={styles.itemSubRow}>
          {subParts.length > 0 && <span className={styles.itemMeta}>{subParts.join(' · ')}</span>}
          {item.member && memberIdx >= 0 && (
            <span className={styles.itemMemberDot} style={{ background: memberColor(memberIdx) }} />
          )}
        </div>
        {done && item.rating && item.rating > 0 && (
          <div className={styles.itemRatingMini}>
            {'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}
          </div>
        )}
      </div>
      <button
        className={styles.statusBtn}
        style={STATUS_STYLE[item.status]}
        onClick={e => { e.stopPropagation(); onCycleStatus() }}
        title="Changer le statut"
      >
        {item.status}
      </button>
    </li>
  )
}
