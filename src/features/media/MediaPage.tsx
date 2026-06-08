import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { QK } from '../../lib/query-keys'
import { memberColor } from '../../lib/constants'
import EmptyState from '../../components/EmptyState'
import { useMediaItems, useUpdateMediaStatus, NEXT_STATUS } from './useMedia'
import type { MediaType, MediaItem } from './useMedia'
import { useMediaRealtime } from './useMediaRealtime'
import MediaRow, { TYPE_META } from './MediaRow'
import MediaDetailModal from './MediaDetailModal'
import { AddMediaForm, EMPTY_DRAFT } from './AddMediaModal'
import type { AddMediaDraft } from './AddMediaModal'
import styles from './MediaPage.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MediaPage() {
  useMediaRealtime()

  const { data: items = [], isLoading } = useMediaItems()
  const updateStatus = useUpdateMediaStatus()

  const { data: members = [] } = useQuery({
    queryKey: QK.membersList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members').select('id, display_name').eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as { id: string; display_name: string }[]
    },
  })

  // ── Filters & sort ──
  const [filterType, setFilterType]         = useState<MediaType | null>(null)
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null)
  const [filterTopRated, setFilterTopRated] = useState(false)
  const [search, setSearch]                 = useState('')
  const [sortBy, setSortBy]                 = useState<SortBy>('added')

  // ── Modals ──
  const [showAdd, setShowAdd]           = useState(false)
  const [draft, setDraft]               = useState<AddMediaDraft>(EMPTY_DRAFT)
  const [detailItemId, setDetailItemId] = useState<string | null>(null)

  // ── Derived ──
  const countByType = TYPES.reduce((acc, t) => {
    acc[t] = items.filter(i => i.type === t).length
    return acc
  }, {} as Record<MediaType, number>)

  const q        = search.trim().toLowerCase()
  const filtered = items.filter(i => {
    if (filterType     && i.type      !== filterType)     return false
    if (filterMemberId && i.member_id !== filterMemberId) return false
    if (filterTopRated && (i.rating ?? 0) < 4)           return false
    if (q && !i.title.toLowerCase().includes(q) &&
             !(i.author_director ?? '').toLowerCase().includes(q) &&
             !(i.genre ?? '').toLowerCase().includes(q)) return false
    return true
  })
  const sorted = sortItems(filtered, sortBy)
  const active = sorted.filter(i => i.status !== 'terminé')
  const done   = sorted.filter(i => i.status === 'terminé')

  const detailItem = detailItemId ? (items.find(i => i.id === detailItemId) ?? null) : null

  function handleCycleStatus(item: MediaItem) {
    updateStatus.mutate({ id: item.id, status: NEXT_STATUS[item.status], current: item })
  }

  return (
    <div className={styles.page}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Médias</h1>
        <button className={styles.addBtn} onClick={() => setShowAdd(true)}>
          <Plus size={15} strokeWidth={3} /> Ajouter
        </button>
      </header>

      {/* ── Type filter ──────────────────────────────────────────── */}
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

      {/* ── Search ───────────────────────────────────────────────── */}
      <div className={styles.searchWrap}>
        <Search size={14} className={styles.searchIcon} strokeWidth={2.5} />
        <input
          type="text" value={search} autoComplete="off"
          onChange={e => setSearch(e.target.value)}
          placeholder="Titre, auteur, genre…"
          className={styles.searchInput}
        />
        {search && (
          <button className={styles.searchClear} onClick={() => setSearch('')} aria-label="Effacer">×</button>
        )}
      </div>

      {/* ── Member filter ────────────────────────────────────────── */}
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

      {/* ── Sort ─────────────────────────────────────────────────── */}
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

      {/* ── List ─────────────────────────────────────────────────── */}
      {isLoading ? null : items.length === 0 ? (
        <EmptyState
          emoji="🎬"
          title="Rien à voir pour l'instant."
          description="Ajoutez un film, une série ou un livre !"
        />
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

      {/* ── Modals ───────────────────────────────────────────────── */}
      {showAdd && (
        <AddMediaForm
          draft={draft}
          setDraft={setDraft}
          members={members}
          onClose={() => setShowAdd(false)}
        />
      )}

      {detailItem && (
        <MediaDetailModal
          item={detailItem}
          members={members}
          onClose={() => setDetailItemId(null)}
          onCycleStatus={() => handleCycleStatus(detailItem)}
        />
      )}

    </div>
  )
}
