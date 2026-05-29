import { useState, useRef, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Search, Pencil, Trash2, Play, Link as LinkIcon, Paperclip, ListMusic, X, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { QK } from '../../lib/query-keys'
import { memberColor } from '../../lib/constants'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import MediaPlayer from './MediaPlayer'
import {
  useMediaItems, useAddMediaItem, useUpdateMediaStatus, useUpdateMediaItem, useDeleteMediaItem,
  usePlaylists, useAddPlaylist, useDeletePlaylist,
  usePlaylistItems, useAddToPlaylist, useRemoveFromPlaylist,
  useUploadMediaFile,
  applySmartFilters,
  NEXT_STATUS,
} from './useMedia'
import type { MediaType, MediaItem, UpdateMediaInput, Playlist, SmartFilters } from './useMedia'
import { useMediaRealtime } from './useMediaRealtime'
import styles from './MediaPage.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

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

// ── Utils ─────────────────────────────────────────────────────────────────────

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

function hasMedia(item: MediaItem) {
  return !!(item.file_path || item.external_url)
}

// ── SmartFilters label ────────────────────────────────────────────────────────

function smartFilterSummary(f: SmartFilters): string {
  const parts: string[] = []
  if (f.type)            parts.push(TYPE_META[f.type]?.emoji + ' ' + f.type)
  if (f.status)          parts.push(f.status)
  if (f.rating_min)      parts.push(`★ ≥ ${f.rating_min}`)
  if (f.genre)           parts.push(f.genre)
  if (f.has_media)       parts.push('avec média')
  return parts.length > 0 ? parts.join(' · ') : 'Tous les médias'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MediaPage() {
  useMediaRealtime()

  const { data: items = [], isLoading } = useMediaItems()
  const { data: playlists = [] }        = usePlaylists()
  const addItem       = useAddMediaItem()
  const updateStatus  = useUpdateMediaStatus()
  const updateItem    = useUpdateMediaItem()
  const deleteItem    = useDeleteMediaItem()

  const { data: members = [] } = useQuery({
    queryKey: QK.membersList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members').select('id, display_name').eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as { id: string; display_name: string }[]
    },
  })

  // ── Tabs ──
  const [activeTab, setActiveTab] = useState<'catalogue' | 'listes'>('catalogue')

  // ── Catalogue state ──
  const [filterType, setFilterType]         = useState<MediaType | null>(null)
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null)
  const [filterTopRated, setFilterTopRated] = useState(false)
  const [search, setSearch]                 = useState('')
  const [sortBy, setSortBy]                 = useState<SortBy>('added')
  const [showAdd, setShowAdd]               = useState(false)
  const [detailItemId, setDetailItemId]     = useState<string | null>(null)

  const [draft, setDraft] = useState<{
    title: string; type: MediaType; member_id: string | null
    author_director: string; release_year: string; genre: string; external_url: string
  }>({ title: '', type: 'film', member_id: null, author_director: '', release_year: '', genre: '', external_url: '' })

  // ── Playlists state ──
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  const [showAddPlaylist, setShowAddPlaylist]         = useState(false)
  const [showAddSmart, setShowAddSmart]               = useState(false)
  const [addToPlaylistItemId, setAddToPlaylistItemId] = useState<string | null>(null)

  // ── Derived ──
  const countByType = TYPES.reduce((acc, t) => {
    acc[t] = items.filter(i => i.type === t).length
    return acc
  }, {} as Record<MediaType, number>)

  const q        = search.trim().toLowerCase()
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

  // ── Handlers ──
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
        external_url:    draft.external_url.trim() || null,
      })
      setDraft({ title: '', type: 'film', member_id: null, author_director: '', release_year: '', genre: '', external_url: '' })
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
        {activeTab === 'catalogue' && (
          <button className={styles.addBtn} onClick={() => setShowAdd(true)}>
            <Plus size={15} strokeWidth={3} /> Ajouter
          </button>
        )}
      </header>

      {/* Tabs */}
      <div className={styles.tabRow}>
        <button
          className={[styles.tab, activeTab === 'catalogue' ? styles.tabActive : ''].join(' ')}
          onClick={() => setActiveTab('catalogue')}
        >
          Catalogue
        </button>
        <button
          className={[styles.tab, activeTab === 'listes' ? styles.tabActive : ''].join(' ')}
          onClick={() => setActiveTab('listes')}
        >
          <ListMusic size={13} strokeWidth={2} style={{ marginRight: 4 }} />
          Listes {playlists.length > 0 && <span className={styles.tabBadge}>{playlists.length}</span>}
        </button>
      </div>

      {/* ── Catalogue tab ─────────────────────────────────────────── */}
      {activeTab === 'catalogue' && (
        <>
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
        </>
      )}

      {/* ── Listes tab ────────────────────────────────────────────── */}
      {activeTab === 'listes' && (
        <PlaylistsPane
          playlists={playlists}
          allItems={items}
          selectedId={selectedPlaylistId}
          onSelect={setSelectedPlaylistId}
          onBack={() => setSelectedPlaylistId(null)}
          onNewManual={() => setShowAddPlaylist(true)}
          onNewSmart={() => setShowAddSmart(true)}
        />
      )}

      {/* ── Modals ────────────────────────────────────────────────── */}

      {showAdd && (
        <SlideUpModal title="Ajouter un élément" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAddSubmit} className={styles.form}>
            <div className={styles.fieldGroup}>
              <label htmlFor="m-title" className={styles.fieldLabel}>Titre</label>
              <input id="m-title" type="text" value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                className={styles.input} placeholder="Dune, Atomic Habits…" required autoFocus />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Type</label>
              <div className={styles.typePills}>
                {TYPES.map(t => (
                  <button key={t} type="button"
                    className={[styles.typePill, draft.type === t ? styles.typePillActive : ''].join(' ')}
                    style={draft.type === t ? { borderColor: 'var(--accent)', background: 'rgba(224,123,84,0.1)', color: 'var(--accent)' } : {}}
                    onClick={() => setDraft(d => ({ ...d, type: t }))}>
                    {TYPE_META[t].emoji} {TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="m-author" className={styles.fieldLabel}>
                Auteur / Réalisateur <span className={styles.optional}>optionnel</span>
              </label>
              <input id="m-author" type="text" value={draft.author_director}
                onChange={e => setDraft(d => ({ ...d, author_director: e.target.value }))}
                className={styles.input} placeholder="Denis Villeneuve…" />
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.fieldGroup}>
                <label htmlFor="m-year" className={styles.fieldLabel}>Année <span className={styles.optional}>optionnel</span></label>
                <input id="m-year" type="number" value={draft.release_year}
                  onChange={e => setDraft(d => ({ ...d, release_year: e.target.value }))}
                  className={styles.input} placeholder="2024" min={1800} max={2100} />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="m-genre" className={styles.fieldLabel}>Genre <span className={styles.optional}>optionnel</span></label>
                <input id="m-genre" type="text" value={draft.genre}
                  onChange={e => setDraft(d => ({ ...d, genre: e.target.value }))}
                  className={styles.input} placeholder="SF, Romance…" />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="m-url" className={styles.fieldLabel}>
                Lien <span className={styles.optional}>YouTube, Spotify, direct…</span>
              </label>
              <input id="m-url" type="url" value={draft.external_url}
                onChange={e => setDraft(d => ({ ...d, external_url: e.target.value }))}
                className={styles.input} placeholder="https://youtube.com/watch?v=…" />
            </div>

            {members.length > 1 && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Ajouté par</label>
                <div className={styles.memberPills}>
                  {members.map((m, i) => {
                    const isActive = draft.member_id === m.id
                    const color    = memberColor(i)
                    return (
                      <button key={m.id} type="button"
                        className={[styles.memberPill, isActive ? styles.memberPillActive : ''].join(' ')}
                        style={isActive ? { borderColor: color, background: `${color}1A`, color } : {}}
                        onClick={() => setDraft(d => ({ ...d, member_id: m.id }))}
                      >{m.display_name}</button>
                    )
                  })}
                </div>
              </div>
            )}

            <button type="submit" className={styles.submitBtn} disabled={addItem.isPending || !draft.title.trim()}>
              {addItem.isPending ? 'Ajout…' : 'Ajouter'}
            </button>
          </form>
        </SlideUpModal>
      )}

      {detailItem && (
        <MediaDetailModal
          item={detailItem}
          members={members}
          playlists={playlists}
          onClose={() => setDetailItemId(null)}
          onCycleStatus={() => handleCycleStatus(detailItem)}
          onUpdate={fields => updateItem.mutate({ id: detailItem.id, ...fields })}
          onDelete={() => { deleteItem.mutate(detailItem.id); setDetailItemId(null) }}
          onAddToPlaylist={() => setAddToPlaylistItemId(detailItem.id)}
        />
      )}

      {showAddPlaylist && (
        <AddPlaylistModal onClose={() => setShowAddPlaylist(false)} />
      )}

      {showAddSmart && (
        <AddSmartPlaylistModal
          items={items}
          members={members}
          onClose={() => setShowAddSmart(false)}
        />
      )}

      {addToPlaylistItemId && (
        <AddToPlaylistModal
          mediaItemId={addToPlaylistItemId}
          playlists={playlists.filter(p => p.type === 'manual')}
          onClose={() => setAddToPlaylistItemId(null)}
        />
      )}

    </div>
  )
}

// ── MediaRow ──────────────────────────────────────────────────────────────────

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
    'à voir':   { background: 'transparent',              color: 'var(--text-muted)', borderColor: 'var(--border)' },
    'en cours': { background: 'rgba(224,123,84,0.12)',    color: 'var(--accent)',     borderColor: 'var(--accent)' },
    'terminé':  { background: 'rgba(91,158,143,0.12)',    color: '#5B9E8F',           borderColor: '#5B9E8F' },
  }

  const subParts: string[] = []
  if (item.author_director) subParts.push(item.author_director)
  if (item.release_year)    subParts.push(String(item.release_year))

  return (
    <li className={[styles.item, done ? styles.itemDone : ''].join(' ')}
        onClick={onOpen} role="button" tabIndex={0}>
      <span className={styles.typeEmoji}>{meta.emoji}</span>
      <div className={styles.itemBody}>
        <div className={styles.itemTitleRow}>
          <span className={styles.itemTitle}>{item.title}</span>
          {hasMedia(item) && <Play size={10} strokeWidth={2.5} className={styles.itemPlayIcon} />}
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
      <button className={styles.statusBtn} style={statusStyle[item.status]}
        onClick={e => { e.stopPropagation(); onCycleStatus() }} title="Changer le statut">
        {item.status}
      </button>
    </li>
  )
}

// ── MediaDetailModal ──────────────────────────────────────────────────────────

interface DetailDraft {
  title: string; type: MediaType
  author_director: string; release_year: string; genre: string; external_url: string
}

function MediaDetailModal({ item, members, playlists, onClose, onCycleStatus, onUpdate, onDelete, onAddToPlaylist }: {
  item: MediaItem
  members: { id: string; display_name: string }[]
  playlists: Playlist[]
  onClose: () => void
  onCycleStatus: () => void
  onUpdate: (fields: Omit<UpdateMediaInput, 'id'>) => void
  onDelete: () => void
  onAddToPlaylist: () => void
}) {
  const [editMode, setEditMode] = useState(false)
  const [showPlayer, setShowPlayer] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlDraft, setUrlDraft] = useState(item.external_url ?? '')
  const [commentText, setCommentText] = useState(item.comment ?? '')
  const [editDraft, setEditDraft] = useState<DetailDraft>({
    title:           item.title,
    type:            item.type,
    author_director: item.author_director ?? '',
    release_year:    item.release_year != null ? String(item.release_year) : '',
    genre:           item.genre ?? '',
    external_url:    item.external_url ?? '',
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadFile = useUploadMediaFile()

  useEffect(() => { setCommentText(item.comment ?? '') }, [item.comment])
  useEffect(() => {
    setEditDraft({
      title:           item.title,
      type:            item.type,
      author_director: item.author_director ?? '',
      release_year:    item.release_year != null ? String(item.release_year) : '',
      genre:           item.genre ?? '',
      external_url:    item.external_url ?? '',
    })
    setUrlDraft(item.external_url ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  const statusStyle: Record<string, { background: string; color: string; borderColor: string }> = {
    'à voir':   { background: 'transparent',           color: 'var(--text-muted)', borderColor: 'var(--border)' },
    'en cours': { background: 'rgba(224,123,84,0.12)', color: 'var(--accent)',     borderColor: 'var(--accent)' },
    'terminé':  { background: 'rgba(91,158,143,0.12)', color: '#5B9E8F',           borderColor: '#5B9E8F' },
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
      external_url:    editDraft.external_url.trim() || null,
    })
    setEditMode(false)
  }

  async function handleFileUpload(file: File) {
    const result = await uploadFile.mutateAsync(file)
    onUpdate({ file_path: result.path, mime_type: result.mimeType })
  }

  const memberIdx = members.findIndex(m => m.id === item.member_id)
  const meta      = TYPE_META[item.type]
  const itemHasMedia = hasMedia(item)
  const manualPlaylists = playlists.filter(p => p.type === 'manual')

  return (
    <SlideUpModal title={editMode ? 'Modifier' : `${meta.emoji} ${item.title}`} onClose={onClose}>
      {editMode ? (
        <form onSubmit={handleSaveEdit} className={styles.form}>
          <div className={styles.fieldGroup}>
            <label htmlFor="d-title" className={styles.fieldLabel}>Titre</label>
            <input id="d-title" type="text" value={editDraft.title}
              onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
              className={styles.input} required autoFocus />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Type</label>
            <div className={styles.typePills}>
              {TYPES.map(t => (
                <button key={t} type="button"
                  className={[styles.typePill, editDraft.type === t ? styles.typePillActive : ''].join(' ')}
                  style={editDraft.type === t ? { borderColor: 'var(--accent)', background: 'rgba(224,123,84,0.1)', color: 'var(--accent)' } : {}}
                  onClick={() => setEditDraft(d => ({ ...d, type: t }))}>
                  {TYPE_META[t].emoji} {TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="d-author" className={styles.fieldLabel}>Auteur / Réalisateur <span className={styles.optional}>optionnel</span></label>
            <input id="d-author" type="text" value={editDraft.author_director}
              onChange={e => setEditDraft(d => ({ ...d, author_director: e.target.value }))} className={styles.input} />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.fieldGroup}>
              <label htmlFor="d-year" className={styles.fieldLabel}>Année <span className={styles.optional}>optionnel</span></label>
              <input id="d-year" type="number" value={editDraft.release_year}
                onChange={e => setEditDraft(d => ({ ...d, release_year: e.target.value }))}
                className={styles.input} min={1800} max={2100} />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="d-genre" className={styles.fieldLabel}>Genre <span className={styles.optional}>optionnel</span></label>
              <input id="d-genre" type="text" value={editDraft.genre}
                onChange={e => setEditDraft(d => ({ ...d, genre: e.target.value }))} className={styles.input} />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="d-url" className={styles.fieldLabel}>Lien <span className={styles.optional}>YouTube, Spotify…</span></label>
            <input id="d-url" type="url" value={editDraft.external_url}
              onChange={e => setEditDraft(d => ({ ...d, external_url: e.target.value }))}
              className={styles.input} placeholder="https://…" />
          </div>

          <div className={styles.editActions}>
            <button type="submit" className={styles.submitBtn}>Sauvegarder</button>
            <button type="button" className={styles.cancelEditBtn} onClick={() => setEditMode(false)}>Annuler</button>
          </div>
        </form>
      ) : (
        <div className={styles.detailView}>

          <button className={styles.statusBtn} style={statusStyle[item.status]} onClick={onCycleStatus}>
            {item.status}
          </button>

          {(item.author_director || item.release_year || item.genre) && (
            <div className={styles.detailMeta}>
              {item.author_director && <span className={styles.detailMetaItem}>{item.author_director}</span>}
              {item.release_year    && <span className={styles.detailMetaItem}>{item.release_year}</span>}
              {item.genre           && <span className={styles.detailMetaItem}>{item.genre}</span>}
            </div>
          )}

          {(item.started_at || item.finished_at) && (
            <div className={styles.detailDates}>
              {item.started_at  && <span className={styles.detailDateItem}>Commencé · {formatDate(item.started_at)}</span>}
              {item.finished_at && <span className={styles.detailDateItem}>Terminé · {formatDate(item.finished_at)}</span>}
            </div>
          )}

          {item.member && memberIdx >= 0 && (
            <span className={styles.detailMemberTag} style={{ color: memberColor(memberIdx) }}>
              {item.member.display_name}
            </span>
          )}

          {/* ── Media section ── */}
          <div className={styles.mediaSection}>
            {itemHasMedia ? (
              <>
                {showPlayer ? (
                  <MediaPlayer
                    filePath={item.file_path}
                    externalUrl={item.external_url}
                    mimeType={item.mime_type}
                    title={item.title}
                  />
                ) : (
                  <button className={styles.playBtn} onClick={() => setShowPlayer(true)}>
                    <Play size={14} strokeWidth={2.5} />
                    Lire
                  </button>
                )}
                <button className={styles.attachBtnSmall}
                  onClick={() => { setShowPlayer(false); setShowUrlInput(true) }}>
                  <LinkIcon size={11} strokeWidth={2} /> Changer le lien
                </button>
              </>
            ) : (
              <div className={styles.attachRow}>
                <button className={styles.attachBtn} onClick={() => fileRef.current?.click()}
                  disabled={uploadFile.isPending}>
                  <Paperclip size={13} strokeWidth={2} />
                  {uploadFile.isPending ? 'Upload…' : 'Fichier local'}
                </button>
                <button className={styles.attachBtn} onClick={() => setShowUrlInput(v => !v)}>
                  <LinkIcon size={13} strokeWidth={2} />
                  Lier une URL
                </button>
              </div>
            )}

            {showUrlInput && (
              <input
                type="url"
                value={urlDraft}
                onChange={e => setUrlDraft(e.target.value)}
                onBlur={() => {
                  if (urlDraft.trim() !== (item.external_url ?? '')) {
                    onUpdate({ external_url: urlDraft.trim() || null })
                  }
                  setShowUrlInput(false)
                }}
                placeholder="https://youtube.com/watch?v=…"
                className={styles.urlInput}
                autoFocus
              />
            )}

            <input ref={fileRef} type="file" accept="video/*,audio/*" style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
              }} />
          </div>

          {/* ── Rating ── */}
          <div className={styles.detailSection}>
            <span className={styles.detailSectionLabel}>Note</span>
            <div className={styles.starRow}>
              {[1,2,3,4,5].map(n => (
                <button key={n}
                  className={[styles.star, (item.rating ?? 0) >= n ? styles.starFilled : ''].join(' ')}
                  onClick={() => onUpdate({ rating: item.rating === n ? null : n })}
                  aria-label={`${n} étoile${n > 1 ? 's' : ''}`}>★</button>
              ))}
            </div>
          </div>

          {/* ── Commentaire ── */}
          <div className={styles.detailSection}>
            <span className={styles.detailSectionLabel}>Note personnelle</span>
            <textarea
              className={styles.commentInput}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onBlur={() => {
                const trimmed = commentText.trim()
                if (trimmed !== (item.comment ?? '')) onUpdate({ comment: trimmed || null })
              }}
              placeholder="Ajouter une note…"
              rows={3}
            />
          </div>

          {/* ── Playlists ── */}
          {manualPlaylists.length > 0 && (
            <div className={styles.detailSection}>
              <span className={styles.detailSectionLabel}>Listes</span>
              <button className={styles.addToListBtn} onClick={onAddToPlaylist}>
                <Plus size={12} strokeWidth={2.5} /> Ajouter à une liste
              </button>
            </div>
          )}

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

// ── PlaylistsPane ─────────────────────────────────────────────────────────────

function PlaylistsPane({ playlists, allItems, selectedId, onSelect, onBack, onNewManual, onNewSmart }: {
  playlists: Playlist[]
  allItems: MediaItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onBack: () => void
  onNewManual: () => void
  onNewSmart: () => void
}) {
  const selected = selectedId ? playlists.find(p => p.id === selectedId) ?? null : null

  if (selected) {
    return (
      <PlaylistDetailPane
        playlist={selected}
        allItems={allItems}
        onBack={onBack}
      />
    )
  }

  return (
    <div className={styles.playlistsPane}>
      <div className={styles.playlistActions}>
        <button className={styles.newListBtn} onClick={onNewManual}>
          <Plus size={13} strokeWidth={2.5} /> Nouvelle liste
        </button>
        <button className={styles.newSmartBtn} onClick={onNewSmart}>
          ✨ Smart liste
        </button>
      </div>

      {playlists.length === 0 ? (
        <EmptyState emoji="🎵" title="Aucune liste" description="Créez une watchlist ou une smart liste." />
      ) : (
        <ul className={styles.playlistList}>
          {playlists.map(pl => {
            const count = pl.type === 'smart' && pl.smart_filters
              ? applySmartFilters(allItems, pl.smart_filters).length
              : null
            return (
              <li key={pl.id} className={styles.playlistRow} onClick={() => onSelect(pl.id)}>
                <div className={styles.playlistRowIcon}>
                  {pl.type === 'smart' ? '✨' : '🎵'}
                </div>
                <div className={styles.playlistRowBody}>
                  <span className={styles.playlistName}>{pl.name}</span>
                  {pl.smart_filters && (
                    <span className={styles.playlistMeta}>{smartFilterSummary(pl.smart_filters)}</span>
                  )}
                </div>
                {count !== null && (
                  <span className={styles.playlistCount}>{count}</span>
                )}
                <ChevronRight size={16} strokeWidth={2} className={styles.playlistChevron} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── PlaylistDetailPane ────────────────────────────────────────────────────────

function PlaylistDetailPane({ playlist, allItems, onBack }: {
  playlist: Playlist
  allItems: MediaItem[]
  onBack: () => void
}) {
  const removeFromPlaylist = useRemoveFromPlaylist()
  const deletePlaylist     = useDeletePlaylist()
  const [playingItemId, setPlayingItemId] = useState<string | null>(null)

  const { data: rawItems = [] } = usePlaylistItems(playlist.type === 'manual' ? playlist.id : null)

  const displayItems: MediaItem[] = playlist.type === 'smart' && playlist.smart_filters
    ? applySmartFilters(allItems, playlist.smart_filters)
    : rawItems.map(ri => ri.media_item).filter(Boolean) as MediaItem[]

  function handleDelete() {
    deletePlaylist.mutate(playlist.id)
    onBack()
  }

  return (
    <div className={styles.playlistDetail}>
      <div className={styles.playlistDetailHeader}>
        <button className={styles.backBtn} onClick={onBack}>
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <div className={styles.playlistDetailMeta}>
          <span className={styles.playlistDetailName}>
            {playlist.type === 'smart' ? '✨ ' : '🎵 '}{playlist.name}
          </span>
          {playlist.smart_filters && (
            <span className={styles.playlistDetailFilters}>{smartFilterSummary(playlist.smart_filters)}</span>
          )}
        </div>
        <button className={styles.deleteListBtn} onClick={handleDelete} aria-label="Supprimer la liste">
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>

      {displayItems.length === 0 ? (
        <EmptyState emoji="🎵" title="Liste vide"
          description={playlist.type === 'smart' ? 'Aucun média ne correspond aux critères.' : 'Ajoutez des médias depuis leur fiche.'} />
      ) : (
        <div className={styles.list}>
          {displayItems.map((item, i) => (
            <div key={item.id}>
              <div className={styles.playlistItemRow}>
                {hasMedia(item) && (
                  <button className={styles.playlistPlayBtn}
                    onClick={() => setPlayingItemId(playingItemId === item.id ? null : item.id)}
                    aria-label="Lire">
                    <Play size={12} strokeWidth={2.5} />
                  </button>
                )}
                <span className={styles.playlistItemPos}>{i + 1}</span>
                <div className={styles.itemBody} style={{ flex: 1 }}>
                  <div className={styles.itemTitleRow}>
                    <span className={styles.itemTitle}>{item.title}</span>
                  </div>
                  <span className={styles.itemMeta}>{TYPE_META[item.type]?.emoji} {item.type}</span>
                </div>
                {playlist.type === 'manual' && (
                  <button className={styles.removeFromListBtn}
                    onClick={() => {
                      const ri = rawItems.find(r => r.media_item_id === item.id)
                      if (ri) removeFromPlaylist.mutate({ itemId: ri.id, playlistId: playlist.id })
                    }}
                    aria-label="Retirer">
                    <X size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
              {playingItemId === item.id && (
                <div className={styles.playlistPlayerWrap}>
                  <MediaPlayer filePath={item.file_path} externalUrl={item.external_url}
                    mimeType={item.mime_type} title={item.title} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AddPlaylistModal ──────────────────────────────────────────────────────────

function AddPlaylistModal({ onClose }: { onClose: () => void }) {
  const addPlaylist = useAddPlaylist()
  const [name, setName] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await addPlaylist.mutateAsync({ name, type: 'manual' })
    onClose()
  }

  return (
    <SlideUpModal title="Nouvelle liste" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label htmlFor="pl-name" className={styles.fieldLabel}>Nom de la liste</label>
          <input id="pl-name" type="text" value={name} onChange={e => setName(e.target.value)}
            className={styles.input} placeholder="Films du soir, Lectures en cours…" autoFocus required />
        </div>
        <button type="submit" className={styles.submitBtn} disabled={addPlaylist.isPending || !name.trim()}>
          {addPlaylist.isPending ? 'Création…' : 'Créer'}
        </button>
      </form>
    </SlideUpModal>
  )
}

// ── AddSmartPlaylistModal ─────────────────────────────────────────────────────

function AddSmartPlaylistModal({ items, members, onClose }: {
  items: MediaItem[]
  members: { id: string; display_name: string }[]
  onClose: () => void
}) {
  const addPlaylist = useAddPlaylist()
  const [name, setName] = useState('')
  const [filters, setFilters] = useState<SmartFilters>({})

  const preview = applySmartFilters(items, filters)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await addPlaylist.mutateAsync({ name, type: 'smart', smart_filters: filters })
    onClose()
  }

  const ALL_STATUSES: Array<{ value: 'à voir' | 'en cours' | 'terminé'; label: string }> = [
    { value: 'à voir', label: 'À voir' },
    { value: 'en cours', label: 'En cours' },
    { value: 'terminé', label: 'Terminé' },
  ]

  return (
    <SlideUpModal title="Smart liste" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label htmlFor="sp-name" className={styles.fieldLabel}>Nom</label>
          <input id="sp-name" type="text" value={name} onChange={e => setName(e.target.value)}
            className={styles.input} placeholder="Top Films non vus, Lectures 4+…" autoFocus required />
        </div>

        <div className={styles.smartSection}>
          <span className={styles.smartSectionLabel}>Critères</span>

          <div className={styles.smartRow}>
            <span className={styles.smartLabel}>Type</span>
            <div className={styles.smartPills}>
              <button type="button"
                className={[styles.smartPill, !filters.type ? styles.smartPillActive : ''].join(' ')}
                onClick={() => setFilters(f => ({ ...f, type: undefined }))}>Tous</button>
              {TYPES.map(t => (
                <button key={t} type="button"
                  className={[styles.smartPill, filters.type === t ? styles.smartPillActive : ''].join(' ')}
                  onClick={() => setFilters(f => ({ ...f, type: f.type === t ? undefined : t }))}>
                  {TYPE_META[t].emoji} {TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.smartRow}>
            <span className={styles.smartLabel}>Statut</span>
            <div className={styles.smartPills}>
              <button type="button"
                className={[styles.smartPill, !filters.status ? styles.smartPillActive : ''].join(' ')}
                onClick={() => setFilters(f => ({ ...f, status: undefined }))}>Tous</button>
              {ALL_STATUSES.map(s => (
                <button key={s.value} type="button"
                  className={[styles.smartPill, filters.status === s.value ? styles.smartPillActive : ''].join(' ')}
                  onClick={() => setFilters(f => ({ ...f, status: f.status === s.value ? undefined : s.value }))}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.smartRow}>
            <span className={styles.smartLabel}>Note min.</span>
            <div className={styles.smartPills}>
              <button type="button"
                className={[styles.smartPill, !filters.rating_min ? styles.smartPillActive : ''].join(' ')}
                onClick={() => setFilters(f => ({ ...f, rating_min: undefined }))}>Toutes</button>
              {[2, 3, 4, 5].map(n => (
                <button key={n} type="button"
                  className={[styles.smartPill, filters.rating_min === n ? styles.smartPillActive : ''].join(' ')}
                  onClick={() => setFilters(f => ({ ...f, rating_min: f.rating_min === n ? undefined : n }))}>
                  {'★'.repeat(n) + '☆'.repeat(5 - n)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.smartRow}>
            <span className={styles.smartLabel}>Avec média</span>
            <div className={styles.smartPills}>
              <button type="button"
                className={[styles.smartPill, !filters.has_media ? styles.smartPillActive : ''].join(' ')}
                onClick={() => setFilters(f => ({ ...f, has_media: undefined }))}>Non filtré</button>
              <button type="button"
                className={[styles.smartPill, filters.has_media ? styles.smartPillActive : ''].join(' ')}
                onClick={() => setFilters(f => ({ ...f, has_media: f.has_media ? undefined : true }))}>
                ▶ Lisibles uniquement
              </button>
            </div>
          </div>

          {members.length > 1 && (
            <div className={styles.smartRow}>
              <span className={styles.smartLabel}>Membre</span>
              <div className={styles.smartPills}>
                <button type="button"
                  className={[styles.smartPill, !filters.member_id ? styles.smartPillActive : ''].join(' ')}
                  onClick={() => setFilters(f => ({ ...f, member_id: undefined }))}>Tous</button>
                {members.map((m, i) => (
                  <button key={m.id} type="button"
                    className={[styles.smartPill, filters.member_id === m.id ? styles.smartPillActive : ''].join(' ')}
                    style={filters.member_id === m.id ? { borderColor: memberColor(i), color: memberColor(i) } : {}}
                    onClick={() => setFilters(f => ({ ...f, member_id: f.member_id === m.id ? undefined : m.id }))}>
                    {m.display_name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.smartPreviewLabel}>
          Résultat : {preview.length} média{preview.length !== 1 ? 's' : ''}
        </div>

        <button type="submit" className={styles.submitBtn} disabled={addPlaylist.isPending || !name.trim()}>
          {addPlaylist.isPending ? 'Création…' : 'Créer la smart liste'}
        </button>
      </form>
    </SlideUpModal>
  )
}

// ── AddToPlaylistModal ────────────────────────────────────────────────────────

function AddToPlaylistModal({ mediaItemId, playlists, onClose }: {
  mediaItemId: string
  playlists: Playlist[]
  onClose: () => void
}) {
  const addTo = useAddToPlaylist()

  async function handleAdd(playlistId: string) {
    await addTo.mutateAsync({ playlistId, mediaItemId })
    onClose()
  }

  return (
    <SlideUpModal title="Ajouter à une liste" onClose={onClose}>
      <div className={styles.form}>
        {playlists.length === 0 ? (
          <p className={styles.emptyListsMsg}>Créez d'abord une liste manuelle.</p>
        ) : (
          <ul className={styles.playlistPickerList}>
            {playlists.map(pl => (
              <li key={pl.id}>
                <button className={styles.playlistPickerRow}
                  onClick={() => handleAdd(pl.id)} disabled={addTo.isPending}>
                  <span className={styles.playlistPickerIcon}>🎵</span>
                  <span className={styles.playlistPickerName}>{pl.name}</span>
                  <Plus size={14} strokeWidth={2.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SlideUpModal>
  )
}
