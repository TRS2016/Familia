import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { QK } from '../../lib/query-keys'
import { memberColor } from '../../lib/constants'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import {
  useMediaItems, useAddMediaItem, useUpdateMediaStatus, useUpdateMediaItem, useDeleteMediaItem,
  NEXT_STATUS,
} from './useMedia'
import type { MediaType, MediaItem, UpdateMediaInput } from './useMedia'
import { useMediaRealtime } from './useMediaRealtime'
import styles from './MediaPage.module.css'

const TYPE_META: Record<MediaType, { emoji: string; label: string }> = {
  film:  { emoji: '🎬', label: 'Film'  },
  série: { emoji: '📺', label: 'Série' },
  livre: { emoji: '📚', label: 'Livre' },
  jeu:   { emoji: '🎮', label: 'Jeu'   },
}

const TYPES: MediaType[] = ['film', 'série', 'livre', 'jeu']

type SortBy = 'added' | 'title' | 'rating' | 'finished'

const SORT_LABELS: Record<SortBy, string> = {
  added:    'Ajouté',
  title:    'Titre',
  rating:   'Note',
  finished: 'Terminé',
}

function sortItems(items: MediaItem[], sort: SortBy): MediaItem[] {
  if (sort === 'added') return items
  return [...items].sort((a, b) => {
    if (sort === 'title')    return a.title.localeCompare(b.title, 'fr')
    if (sort === 'rating')   return (b.rating ?? 0) - (a.rating ?? 0)
    if (sort === 'finished') return (b.finished_at ?? '').localeCompare(a.finished_at ?? '')
    return 0
  })
}

function formatDate(d: string | null) {
  if (!d) return null
  return format(parseISO(d), 'd MMM yyyy', { locale: fr })
}

export default function MediaPage() {
  useMediaRealtime()

  const { data: items = [], isLoading } = useMediaItems()
  const addItem      = useAddMediaItem()
  const updateStatus = useUpdateMediaStatus()
  const updateItem   = useUpdateMediaItem()
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

  const [filterType, setFilterType]         = useState<MediaType | null>(null)
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null)
  const [filterTopRated, setFilterTopRated] = useState(false)
  const [search, setSearch]                 = useState('')
  const [sortBy, setSortBy]                 = useState<SortBy>('added')
  const [showAdd, setShowAdd]               = useState(false)
  const [detailItemId, setDetailItemId]     = useState<string | null>(null)

  const [draft, setDraft] = useState<{
    title: string; type: MediaType; member_id: string | null
    author_director: string; release_year: string; genre: string
  }>({ title: '', type: 'film', member_id: null, author_director: '', release_year: '', genre: '' })

  const countByType = TYPES.reduce((acc, t) => {
    acc[t] = items.filter(i => i.type === t).length
    return acc
  }, {} as Record<MediaType, number>)

  const q = search.trim().toLowerCase()
  const filtered = items.filter(i => {
    if (filterType && i.type !== filterType) return false
    if (filterMemberId && i.member_id !== filterMemberId) return false
    if (filterTopRated && (i.rating ?? 0) < 4) return false
    if (q && !i.title.toLowerCase().includes(q) &&
             !(i.author_director ?? '').toLowerCase().includes(q)) return false
    return true
  })

  const sorted = sortItems(filtered, sortBy)
  const active = sorted.filter(i => i.status !== 'terminé')
  const done   = sorted.filter(i => i.status === 'terminé')

  const detailItem = detailItemId ? (items.find(i => i.id === detailItemId) ?? null) : null

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft.title.trim()) return
    const year = draft.release_year ? parseInt(draft.release_year, 10) : null
    try {
      await addItem.mutateAsync({
        title:           draft.title,
        type:            draft.type,
        member_id:       draft.member_id,
        author_director: draft.author_director.trim() || null,
        release_year:    year && !isNaN(year) ? year : null,
        genre:           draft.genre.trim() || null,
      })
      setDraft({ title: '', type: 'film', member_id: null, author_director: '', release_year: '', genre: '' })
      setShowAdd(false)
    } catch { /* onError handles toast */ }
  }

  function handleCycleStatus(item: MediaItem) {
    updateStatus.mutate({ id: item.id, status: NEXT_STATUS[item.status], current: item })
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
          Tous · {items.length}
        </button>
        {TYPES.map(t => (
          <button
            key={t}
            className={[styles.filterPill, filterType === t ? styles.filterPillActive : ''].join(' ')}
            style={filterType === t ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(224,123,84,0.1)' } : {}}
            onClick={() => setFilterType(t)}
          >
            {TYPE_META[t].emoji} {TYPE_META[t].label}s · {countByType[t] ?? 0}
          </button>
        ))}
        <button
          className={[styles.filterPill, filterTopRated ? styles.filterPillActive : ''].join(' ')}
          style={filterTopRated ? { borderColor: '#E8B84B', color: '#E8B84B', background: 'rgba(232,184,75,0.12)' } : {}}
          onClick={() => setFilterTopRated(v => !v)}
        >
          ★ 4+
        </button>
      </div>

      {/* Search */}
      <div className={styles.searchWrap}>
        <Search size={14} className={styles.searchIcon} strokeWidth={2.5} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Titre, auteur…"
          className={styles.searchInput}
          autoComplete="off"
        />
        {search && (
          <button className={styles.searchClear} onClick={() => setSearch('')} aria-label="Effacer">×</button>
        )}
      </div>

      {/* Member filter */}
      {members.length > 1 && (
        <div className={styles.memberFilter}>
          <button
            className={[styles.memberChip, filterMemberId === null ? styles.memberChipActive : ''].join(' ')}
            onClick={() => setFilterMemberId(null)}
          >Tous</button>
          {members.map((m, i) => {
            const isActive = filterMemberId === m.id
            const color    = memberColor(i)
            return (
              <button
                key={m.id}
                className={[styles.memberChip, isActive ? styles.memberChipActive : ''].join(' ')}
                style={isActive ? { borderColor: color, background: `${color}1A`, color } : {}}
                onClick={() => setFilterMemberId(id => id === m.id ? null : m.id)}
              >{m.display_name}</button>
            )
          })}
        </div>
      )}

      {/* Sort row */}
      {items.length > 1 && (
        <div className={styles.sortRow}>
          {(['added', 'title', 'rating', 'finished'] as SortBy[]).map(s => (
            <button
              key={s}
              className={[styles.sortPill, sortBy === s ? styles.sortPillActive : ''].join(' ')}
              onClick={() => setSortBy(s)}
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
      )}

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
                  onCycleStatus={() => handleCycleStatus(item)}
                  onOpen={() => setDetailItemId(item.id)}
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
                    onCycleStatus={() => handleCycleStatus(item)}
                    onOpen={() => setDetailItemId(item.id)}
                  />
                ))}
              </ul>
            </>
          )}

          {filtered.length === 0 && (filterType || filterMemberId || q || filterTopRated) && (
            <EmptyState emoji="🔍" title="Aucun résultat." description="Modifiez vos filtres ou la recherche." />
          )}
        </>
      )}

      {/* Add modal */}
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

            <div className={styles.fieldGroup}>
              <label htmlFor="m-author" className={styles.fieldLabel}>
                Auteur / Réalisateur <span className={styles.optional}>optionnel</span>
              </label>
              <input
                id="m-author"
                type="text"
                value={draft.author_director}
                onChange={e => setDraft(d => ({ ...d, author_director: e.target.value }))}
                className={styles.input}
                placeholder="Ex: Denis Villeneuve, J.K. Rowling…"
              />
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.fieldGroup}>
                <label htmlFor="m-year" className={styles.fieldLabel}>
                  Année <span className={styles.optional}>optionnel</span>
                </label>
                <input
                  id="m-year"
                  type="number"
                  value={draft.release_year}
                  onChange={e => setDraft(d => ({ ...d, release_year: e.target.value }))}
                  className={styles.input}
                  placeholder="2024"
                  min={1800}
                  max={2100}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="m-genre" className={styles.fieldLabel}>
                  Genre <span className={styles.optional}>optionnel</span>
                </label>
                <input
                  id="m-genre"
                  type="text"
                  value={draft.genre}
                  onChange={e => setDraft(d => ({ ...d, genre: e.target.value }))}
                  className={styles.input}
                  placeholder="SF, Romance…"
                />
              </div>
            </div>

            {members.length > 1 && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Ajouté par</label>
                <div className={styles.memberPills}>
                  {members.map((m, i) => {
                    const isActive = draft.member_id === m.id
                    const color    = memberColor(i)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={[styles.memberPill, isActive ? styles.memberPillActive : ''].join(' ')}
                        style={isActive ? { borderColor: color, background: `${color}1A`, color } : {}}
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

      {/* Detail modal */}
      {detailItem && (
        <MediaDetailModal
          item={detailItem}
          members={members}
          onClose={() => setDetailItemId(null)}
          onCycleStatus={() => handleCycleStatus(detailItem)}
          onUpdate={fields => updateItem.mutate({ id: detailItem.id, ...fields })}
          onDelete={() => {
            deleteItem.mutate(detailItem.id)
            setDetailItemId(null)
          }}
        />
      )}

    </div>
  )
}

function MediaRow({ item, members, done = false, onCycleStatus, onOpen }: {
  item: MediaItem
  members: { id: string; display_name: string }[]
  done?: boolean
  onCycleStatus: () => void
  onOpen: () => void
}) {
  const meta      = TYPE_META[item.type]
  const memberIdx = members.findIndex(m => m.id === item.member_id)

  const statusStyle: Record<string, { background: string; color: string; borderColor: string }> = {
    'à voir':   { background: 'transparent', color: 'var(--text-muted)', borderColor: 'var(--border)' },
    'en cours': { background: 'rgba(224,123,84,0.12)', color: 'var(--accent)', borderColor: 'var(--accent)' },
    'terminé':  { background: 'rgba(91,158,143,0.12)', color: '#5B9E8F', borderColor: '#5B9E8F' },
  }

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
        <span className={styles.itemTitle}>{item.title}</span>
        <div className={styles.itemSubRow}>
          {subParts.length > 0 && (
            <span className={styles.itemMeta}>{subParts.join(' · ')}</span>
          )}
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
        style={statusStyle[item.status]}
        onClick={e => { e.stopPropagation(); onCycleStatus() }}
        title="Changer le statut"
      >
        {item.status}
      </button>
    </li>
  )
}

interface DetailDraft {
  title: string
  type: MediaType
  author_director: string
  release_year: string
  genre: string
}

function MediaDetailModal({ item, members, onClose, onCycleStatus, onUpdate, onDelete }: {
  item: MediaItem
  members: { id: string; display_name: string }[]
  onClose: () => void
  onCycleStatus: () => void
  onUpdate: (fields: Omit<UpdateMediaInput, 'id'>) => void
  onDelete: () => void
}) {
  const [editMode, setEditMode] = useState(false)
  const [editDraft, setEditDraft] = useState<DetailDraft>({
    title:           item.title,
    type:            item.type,
    author_director: item.author_director ?? '',
    release_year:    item.release_year != null ? String(item.release_year) : '',
    genre:           item.genre ?? '',
  })
  const [commentText, setCommentText] = useState(item.comment ?? '')

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setCommentText(item.comment ?? '') }, [item.comment])

  useEffect(() => {
    setEditDraft({
      title:           item.title,
      type:            item.type,
      author_director: item.author_director ?? '',
      release_year:    item.release_year != null ? String(item.release_year) : '',
      genre:           item.genre ?? '',
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])
  /* eslint-enable react-hooks/set-state-in-effect */

  const statusStyle: Record<string, { background: string; color: string; borderColor: string }> = {
    'à voir':   { background: 'transparent', color: 'var(--text-muted)', borderColor: 'var(--border)' },
    'en cours': { background: 'rgba(224,123,84,0.12)', color: 'var(--accent)', borderColor: 'var(--accent)' },
    'terminé':  { background: 'rgba(91,158,143,0.12)', color: '#5B9E8F', borderColor: '#5B9E8F' },
  }

  function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    const year = editDraft.release_year ? parseInt(editDraft.release_year, 10) : null
    onUpdate({
      title:           editDraft.title.trim() || item.title,
      type:            editDraft.type,
      author_director: editDraft.author_director.trim() || null,
      release_year:    year && !isNaN(year) ? year : null,
      genre:           editDraft.genre.trim() || null,
    })
    setEditMode(false)
  }

  const memberIdx = members.findIndex(m => m.id === item.member_id)
  const meta = TYPE_META[item.type]

  return (
    <SlideUpModal
      title={editMode ? 'Modifier' : `${meta.emoji} ${item.title}`}
      onClose={onClose}
    >
      {editMode ? (
        <form onSubmit={handleSaveEdit} className={styles.form}>
          <div className={styles.fieldGroup}>
            <label htmlFor="d-title" className={styles.fieldLabel}>Titre</label>
            <input
              id="d-title"
              type="text"
              value={editDraft.title}
              onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
              className={styles.input}
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
                  className={[styles.typePill, editDraft.type === t ? styles.typePillActive : ''].join(' ')}
                  style={editDraft.type === t ? { borderColor: 'var(--accent)', background: 'rgba(224,123,84,0.1)', color: 'var(--accent)' } : {}}
                  onClick={() => setEditDraft(d => ({ ...d, type: t }))}
                >
                  {TYPE_META[t].emoji} {TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="d-author" className={styles.fieldLabel}>
              Auteur / Réalisateur <span className={styles.optional}>optionnel</span>
            </label>
            <input
              id="d-author"
              type="text"
              value={editDraft.author_director}
              onChange={e => setEditDraft(d => ({ ...d, author_director: e.target.value }))}
              className={styles.input}
            />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.fieldGroup}>
              <label htmlFor="d-year" className={styles.fieldLabel}>
                Année <span className={styles.optional}>optionnel</span>
              </label>
              <input
                id="d-year"
                type="number"
                value={editDraft.release_year}
                onChange={e => setEditDraft(d => ({ ...d, release_year: e.target.value }))}
                className={styles.input}
                min={1800}
                max={2100}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="d-genre" className={styles.fieldLabel}>
                Genre <span className={styles.optional}>optionnel</span>
              </label>
              <input
                id="d-genre"
                type="text"
                value={editDraft.genre}
                onChange={e => setEditDraft(d => ({ ...d, genre: e.target.value }))}
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.editActions}>
            <button type="submit" className={styles.submitBtn}>Sauvegarder</button>
            <button type="button" className={styles.cancelEditBtn} onClick={() => setEditMode(false)}>Annuler</button>
          </div>
        </form>
      ) : (
        <div className={styles.detailView}>

          <button
            className={styles.statusBtn}
            style={statusStyle[item.status]}
            onClick={onCycleStatus}
          >
            {item.status}
          </button>

          {(item.author_director || item.release_year || item.genre) && (
            <div className={styles.detailMeta}>
              {item.author_director && (
                <span className={styles.detailMetaItem}>{item.author_director}</span>
              )}
              {item.release_year && (
                <span className={styles.detailMetaItem}>{item.release_year}</span>
              )}
              {item.genre && (
                <span className={styles.detailMetaItem}>{item.genre}</span>
              )}
            </div>
          )}

          {(item.started_at || item.finished_at) && (
            <div className={styles.detailDates}>
              {item.started_at && (
                <span className={styles.detailDateItem}>Commencé · {formatDate(item.started_at)}</span>
              )}
              {item.finished_at && (
                <span className={styles.detailDateItem}>Terminé · {formatDate(item.finished_at)}</span>
              )}
            </div>
          )}

          {item.member && memberIdx >= 0 && (
            <span className={styles.detailMemberTag} style={{ color: memberColor(memberIdx) }}>
              {item.member.display_name}
            </span>
          )}

          <div className={styles.detailSection}>
            <span className={styles.detailSectionLabel}>Note</span>
            <div className={styles.starRow}>
              {[1,2,3,4,5].map(n => (
                <button
                  key={n}
                  className={[styles.star, (item.rating ?? 0) >= n ? styles.starFilled : ''].join(' ')}
                  onClick={() => onUpdate({ rating: item.rating === n ? null : n })}
                  aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                >★</button>
              ))}
            </div>
          </div>

          <div className={styles.detailSection}>
            <span className={styles.detailSectionLabel}>Note personnelle</span>
            <textarea
              className={styles.commentInput}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onBlur={() => {
                const trimmed = commentText.trim()
                const current = item.comment ?? ''
                if (trimmed !== current) onUpdate({ comment: trimmed || null })
              }}
              placeholder="Ajouter une note…"
              rows={3}
            />
          </div>

          <div className={styles.detailActions}>
            <button className={styles.editBtn} onClick={() => setEditMode(true)}>
              <Pencil size={13} /> Modifier
            </button>
            <button className={styles.deleteActionBtn} onClick={onDelete}>
              <Trash2 size={13} /> Supprimer
            </button>
          </div>

        </div>
      )}
    </SlideUpModal>
  )
}
