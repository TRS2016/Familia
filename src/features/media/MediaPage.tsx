import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { QK } from '../../lib/query-keys'
import { memberColor } from '../../lib/constants'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import {
  useMediaItems, useAddMediaItem, useUpdateMediaStatus, useDeleteMediaItem,
  NEXT_STATUS,
} from './useMedia'
import type { MediaType, MediaItem } from './useMedia'
import { useMediaRealtime } from './useMediaRealtime'
import styles from './MediaPage.module.css'

const TYPE_META: Record<MediaType, { emoji: string; label: string }> = {
  film:   { emoji: '🎬', label: 'Film'  },
  série:  { emoji: '📺', label: 'Série' },
  livre:  { emoji: '📚', label: 'Livre' },
}

const TYPES: MediaType[] = ['film', 'série', 'livre']

export default function MediaPage() {
  useMediaRealtime()

  const { data: items = [], isLoading } = useMediaItems()
  const addItem      = useAddMediaItem()
  const updateStatus = useUpdateMediaStatus()
  const deleteItem   = useDeleteMediaItem()

  const { data: members = [] } = useQuery({
    queryKey: QK.membersList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members').select('id, display_name').eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as { id: string; display_name: string }[]
    },
  })

  const [filterType, setFilterType] = useState<MediaType | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState<{ title: string; type: MediaType; member_id: string | null }>({
    title: '', type: 'film', member_id: null,
  })

  const filtered = filterType ? items.filter(i => i.type === filterType) : items
  const active   = filtered.filter(i => i.status !== 'terminé')
  const done     = filtered.filter(i => i.status === 'terminé')

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.title.trim()) return
    await addItem.mutateAsync(draft)
    setDraft({ title: '', type: 'film', member_id: null })
    setShowAdd(false)
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Médias</h1>
        <button className={styles.addBtn} onClick={() => setShowAdd(true)}>
          <Plus size={15} strokeWidth={3} /> Ajouter
        </button>
      </header>

      {/* Type filter */}
      <div className={styles.filterRow}>
        <button
          className={[styles.filterPill, filterType === null ? styles.filterPillActive : ''].join(' ')}
          style={filterType === null ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(224,123,84,0.1)' } : {}}
          onClick={() => setFilterType(null)}
        >
          Tous
        </button>
        {TYPES.map(t => (
          <button
            key={t}
            className={[styles.filterPill, filterType === t ? styles.filterPillActive : ''].join(' ')}
            style={filterType === t ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(224,123,84,0.1)' } : {}}
            onClick={() => setFilterType(t)}
          >
            {TYPE_META[t].emoji} {TYPE_META[t].label}s
          </button>
        ))}
      </div>

      {isLoading ? null : items.length === 0 ? (
        <EmptyState emoji="🎬" title="Rien à voir pour l'instant." description="Ajoutez un film, une série ou un livre !" />
      ) : (
        <>
          {active.length > 0 && (
            <ul className={styles.list}>
              {active.map(item => (
                <MediaRow
                  key={item.id}
                  item={item}
                  members={members}
                  onCycleStatus={() => updateStatus.mutate({ id: item.id, status: NEXT_STATUS[item.status] })}
                  onDelete={() => deleteItem.mutate(item.id)}
                />
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <>
              <div className={styles.separator}>
                <div className={styles.separatorLine} />
                <span className={styles.separatorLabel}>Terminé · {done.length}</span>
                <div className={styles.separatorLine} />
              </div>
              <ul className={styles.list}>
                {done.map(item => (
                  <MediaRow
                    key={item.id}
                    item={item}
                    members={members}
                    done
                    onCycleStatus={() => updateStatus.mutate({ id: item.id, status: NEXT_STATUS[item.status] })}
                    onDelete={() => deleteItem.mutate(item.id)}
                  />
                ))}
              </ul>
            </>
          )}

          {filtered.length === 0 && filterType && (
            <EmptyState emoji={TYPE_META[filterType].emoji} title={`Aucun(e) ${TYPE_META[filterType].label.toLowerCase()} dans la liste.`} />
          )}
        </>
      )}

      {showAdd && (
        <SlideUpModal title="Ajouter un élément" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAddSubmit} className={styles.form}>

            <div className={styles.fieldGroup}>
              <label htmlFor="m-title" className={styles.fieldLabel}>Titre</label>
              <input
                id="m-title"
                type="text"
                value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                className={styles.input}
                placeholder="Ex: Dune, Stranger Things, Atomic Habits…"
                required
                autoFocus
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Type</label>
              <div className={styles.typePills}>
                {TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    className={[styles.typePill, draft.type === t ? styles.typePillActive : ''].join(' ')}
                    style={draft.type === t ? { borderColor: 'var(--accent)', background: 'rgba(224,123,84,0.1)', color: 'var(--accent)' } : {}}
                    onClick={() => setDraft(d => ({ ...d, type: t }))}
                  >
                    {TYPE_META[t].emoji} {TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>

            {members.length > 1 && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Ajouté par</label>
                <div className={styles.memberPills}>
                  {members.map((m, i) => {
                    const active = draft.member_id === m.id
                    const color  = memberColor(i)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={[styles.memberPill, active ? styles.memberPillActive : ''].join(' ')}
                        style={active ? { borderColor: color, background: `${color}1A`, color } : {}}
                        onClick={() => setDraft(d => ({ ...d, member_id: m.id }))}
                      >
                        {m.display_name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={addItem.isPending || !draft.title.trim()}
            >
              {addItem.isPending ? 'Ajout…' : 'Ajouter'}
            </button>
          </form>
        </SlideUpModal>
      )}

    </div>
  )
}

function MediaRow({ item, members, done = false, onCycleStatus, onDelete }: {
  item: MediaItem
  members: { id: string; display_name: string }[]
  done?: boolean
  onCycleStatus: () => void
  onDelete: () => void
}) {
  const meta    = TYPE_META[item.type]
  const memberIdx = members.findIndex(m => m.id === item.member_id)

  const statusStyle: Record<string, { background: string; color: string; borderColor: string }> = {
    'à voir':  { background: 'transparent', color: 'var(--text-muted)', borderColor: 'var(--border)' },
    'en cours': { background: 'rgba(224,123,84,0.12)', color: 'var(--accent)', borderColor: 'var(--accent)' },
    'terminé': { background: 'rgba(91,158,143,0.12)', color: '#5B9E8F', borderColor: '#5B9E8F' },
  }

  return (
    <li className={[styles.item, done ? styles.itemDone : ''].join(' ')}>
      <span className={styles.typeEmoji}>{meta.emoji}</span>
      <div className={styles.itemBody}>
        <span className={styles.itemTitle}>{item.title}</span>
        {item.member && (
          <span className={styles.itemMeta} style={memberIdx >= 0 ? { color: memberColor(memberIdx) } : {}}>
            {item.member.display_name}
          </span>
        )}
      </div>
      <button
        className={styles.statusBtn}
        style={statusStyle[item.status]}
        onClick={onCycleStatus}
        title="Changer le statut"
      >
        {item.status}
      </button>
      <button className={styles.deleteBtn} onClick={onDelete} aria-label="Supprimer">
        <Trash2 size={14} />
      </button>
    </li>
  )
}
