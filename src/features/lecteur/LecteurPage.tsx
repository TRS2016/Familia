import { useState, useRef, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Upload, Link as LinkIcon, Trash2, Plus, X,
  ListMusic, Search, Pencil, MoreHorizontal, Play, Sparkles,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { QK } from '../../lib/query-keys'
import { memberColor } from '../../lib/constants'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import MediaPlayer, { mediaFileUrlKey, signMediaFileUrl } from '../media/MediaPlayer'
import {
  useMediaFiles, useAddMediaFile, useDeleteMediaFile, useUploadMediaFile,
  useEditMediaFile,
  useLecteurPlaylists, useAddLecteurPlaylist, useDeleteLecteurPlaylist,
  useLecteurPlaylistItems, useAddToLecteurPlaylist, useRemoveFromLecteurPlaylist,
  detectKind, applyLecteurFilters,
} from './useLecteur'
import type { MediaFile, LecteurPlaylist, LecteurSmartFilters, MediaFileKind } from './useLecteur'
import { useLecteurRealtime } from './useLecteurRealtime'
import styles from './LecteurPage.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const KIND_META: Record<MediaFileKind, { emoji: string; label: string }> = {
  audio:  { emoji: '🎵', label: 'Audio'  },
  vidéo:  { emoji: '🎬', label: 'Vidéo'  },
  lien:   { emoji: '🔗', label: 'Lien'   },
}

// ── Equalizer bars animation ──────────────────────────────────────────────────

function EqBars({ small = false }: { small?: boolean }) {
  return (
    <div className={[styles.eqBars, small ? styles.eqBarsSmall : ''].join(' ')}>
      <span className={styles.eqBar} />
      <span className={styles.eqBar} />
      <span className={styles.eqBar} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LecteurPage() {
  useLecteurRealtime()
  const { data: files = [], isLoading } = useMediaFiles()
  const { data: playlists = [] }        = useLecteurPlaylists()
  const addFile    = useAddMediaFile()
  const deleteFile = useDeleteMediaFile()
  const uploadFile = useUploadMediaFile()

  const { data: members = [] } = useQuery({
    queryKey: QK.membersList,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members').select('id, display_name').eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as { id: string; display_name: string }[]
    },
    staleTime: 60 * 60 * 1000,
  })

  const fileRef = useRef<HTMLInputElement>(null)

  // ── Tabs ──
  const [activeTab, setActiveTab] = useState<'bibliothèque' | 'listes'>('bibliothèque')

  // ── Filters ──
  const [filterKind,     setFilterKind]     = useState<MediaFileKind | null>(null)
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null)
  const [filterTag,      setFilterTag]      = useState<string | null>(null)
  const [filterTitle,    setFilterTitle]    = useState('')

  // Tous les tags existants, triés par fréquence décroissante
  const allTags = (() => {
    const counts = new Map<string, number>()
    for (const f of files) for (const t of (f.tags ?? [])) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  })()

  // ── Queue + player ──
  const [queue,      setQueue]      = useState<MediaFile[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const playingFile = queue[queueIndex] ?? null
  const hasPrev = queueIndex > 0
  const hasNext = queueIndex < queue.length - 1

  // Précharge l'URL signée de la piste suivante pour lisser l'auto-advance.
  const queryClient = useQueryClient()
  useEffect(() => {
    const nextPath = queue[queueIndex + 1]?.file_path
    if (!nextPath) return
    queryClient.prefetchQuery({
      queryKey: mediaFileUrlKey(nextPath),
      queryFn: () => signMediaFileUrl(nextPath),
      staleTime: 90 * 60 * 1000,
    })
  }, [queue, queueIndex, queryClient])

  function playFiles(fileList: MediaFile[], startIndex = 0) {
    if (fileList.length === 0) return
    setQueue(fileList)
    setQueueIndex(Math.max(0, Math.min(startIndex, fileList.length - 1)))
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  function stop() {
    setQueue([])
    setQueueIndex(0)
  }

  // ── Modal state ──
  const [editingFile,          setEditingFile]          = useState<MediaFile | null>(null)
  const [showUrlModal,         setShowUrlModal]         = useState(false)
  const [selectedPlaylistId,   setSelectedPlaylistId]   = useState<string | null>(null)
  const [showAddPlaylist,      setShowAddPlaylist]      = useState(false)
  const [showAddSmart,         setShowAddSmart]         = useState(false)
  const [addToPlaylistFileId,  setAddToPlaylistFileId]  = useState<string | null>(null)

  // ── Derived ──
  const filtered = files.filter(f => {
    if (filterKind     && detectKind(f) !== filterKind)                              return false
    if (filterMemberId && f.member_id   !== filterMemberId)                          return false
    if (filterTag      && !(f.tags ?? []).includes(filterTag))                       return false
    if (filterTitle    && !f.title.toLowerCase().includes(filterTitle.toLowerCase())) return false
    return true
  })

  // ── Handlers ──
  async function handleUpload(file: File) {
    const result = await uploadFile.mutateAsync(file)
    const name   = file.name.replace(/\.[^.]+$/, '')
    await addFile.mutateAsync({ title: name, file_path: result.path, mime_type: result.mimeType })
  }

  return (
    <div className={styles.page}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Lecteur</h1>
        {activeTab === 'bibliothèque' && (
          <div className={styles.headerRight}>
            {members.length > 1 && (
              <div className={styles.headerMembers}>
                <button
                  className={[styles.headerMemberPill, !filterMemberId ? styles.headerMemberPillActive : ''].join(' ')}
                  onClick={() => setFilterMemberId(null)}
                >
                  Tous
                </button>
                {members.map((m, i) => {
                  const active = filterMemberId === m.id
                  const color  = memberColor(i)
                  return (
                    <button
                      key={m.id}
                      className={[styles.headerMemberPill, active ? styles.headerMemberPillActive : ''].join(' ')}
                      style={active ? { borderColor: color, background: `${color}1A`, color } : {}}
                      onClick={() => setFilterMemberId(id => id === m.id ? null : m.id)}
                    >
                      {m.display_name}
                    </button>
                  )
                })}
              </div>
            )}
            <div className={styles.headerActions}>
              <button className={styles.urlBtn} onClick={() => setShowUrlModal(true)}>
                <LinkIcon size={13} strokeWidth={2} /> URL
              </button>
              <button
                className={styles.uploadBtn}
                onClick={() => fileRef.current?.click()}
                disabled={uploadFile.isPending || addFile.isPending}
              >
                <Upload size={13} strokeWidth={2} />
                {uploadFile.isPending ? 'Upload…' : 'Ajouter'}
              </button>
            </div>
          </div>
        )}
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="video/*,audio/*"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
          e.target.value = ''
        }}
      />

      {/* ── Sticky player dock (now-playing bar + embed) ─────────── */}
      {playingFile && (
        <div className={styles.playerDock}>
          <div className={styles.nowPlaying}>
            <div className={styles.nowPlayingArt}>
              <span className={styles.nowPlayingArtEmoji} aria-hidden="true">{KIND_META[detectKind(playingFile)].emoji}</span>
              <span className={styles.nowPlayingArtEq}><EqBars small /></span>
            </div>
            <div className={styles.nowPlayingInfo}>
              <span className={styles.nowPlayingTitle}>{playingFile.title}</span>
              <span className={styles.nowPlayingSub}>
                {KIND_META[detectKind(playingFile)].label}
                {playingFile.member && ` · ${playingFile.member.display_name}`}
                {queue.length > 1 && ` · ${queueIndex + 1}/${queue.length}`}
              </span>
            </div>
            <div className={styles.nowPlayingNav}>
              <button
                className={styles.nowPlayingNavBtn}
                onClick={() => setQueueIndex(i => i - 1)}
                disabled={!hasPrev}
                aria-label="Précédent"
              >
                <ChevronLeft size={16} strokeWidth={2.5} />
              </button>
              <button
                className={styles.nowPlayingNavBtn}
                onClick={() => setQueueIndex(i => i + 1)}
                disabled={!hasNext}
                aria-label="Suivant"
              >
                <ChevronRight size={16} strokeWidth={2.5} />
              </button>
              <button className={styles.nowPlayingStopBtn} onClick={stop} aria-label="Fermer">
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
          <div className={styles.playerWrap}>
            <MediaPlayer
              filePath={playingFile.file_path}
              externalUrl={playingFile.external_url}
              mimeType={playingFile.mime_type}
              title={playingFile.title}
              autoPlay
              onEnded={hasNext ? () => setQueueIndex(i => i + 1) : undefined}
            />
          </div>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className={styles.tabRow}>
        <button
          className={[styles.tab, activeTab === 'bibliothèque' ? styles.tabActive : ''].join(' ')}
          onClick={() => setActiveTab('bibliothèque')}
        >
          Bibliothèque
        </button>
        <button
          className={[styles.tab, activeTab === 'listes' ? styles.tabActive : ''].join(' ')}
          onClick={() => setActiveTab('listes')}
        >
          <ListMusic size={13} strokeWidth={2} />
          Listes
          {playlists.length > 0 && <span className={styles.tabBadge}>{playlists.length}</span>}
        </button>
      </div>

      {/* ── Bibliothèque tab ─────────────────────────────────────── */}
      {activeTab === 'bibliothèque' && (
        <>
          {/* Type filters */}
          <div className={styles.filterRow}>
            <button
              className={[styles.filterPill, !filterKind ? styles.filterPillActive : ''].join(' ')}
              onClick={() => setFilterKind(null)}
            >
              Tous · {files.length}
            </button>
            {(['audio', 'vidéo', 'lien'] as MediaFileKind[]).map(k => {
              const count = files.filter(f => detectKind(f) === k).length
              if (count === 0) return null
              return (
                <button
                  key={k}
                  className={[styles.filterPill, filterKind === k ? styles.filterPillActive : ''].join(' ')}
                  onClick={() => setFilterKind(fk => fk === k ? null : k)}
                >
                  {KIND_META[k].emoji} {KIND_META[k].label}s · {count}
                </button>
              )
            })}
          </div>

          {/* Tag filters */}
          {allTags.length > 0 && (
            <div className={styles.filterRow}>
              {filterTag && (
                <button
                  className={[styles.filterPill, styles.filterPillClear].join(' ')}
                  onClick={() => setFilterTag(null)}
                >
                  <X size={11} strokeWidth={2.5} /> Tag
                </button>
              )}
              {allTags.map(t => (
                <button
                  key={t}
                  className={[styles.tagFilterPill, filterTag === t ? styles.tagFilterPillActive : ''].join(' ')}
                  onClick={() => setFilterTag(cur => cur === t ? null : t)}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          {files.length > 3 && (
            <div className={styles.searchWrap}>
              <Search size={14} strokeWidth={2} className={styles.searchIcon} />
              <input
                type="search"
                className={styles.searchInput}
                value={filterTitle}
                onChange={e => setFilterTitle(e.target.value)}
                placeholder="Rechercher dans la bibliothèque…"
              />
              {filterTitle && (
                <button className={styles.searchClear} onClick={() => setFilterTitle('')} aria-label="Effacer">
                  <X size={13} strokeWidth={2.5} />
                </button>
              )}
            </div>
          )}

          {/* List */}
          {isLoading ? (
            <div className={styles.spinnerWrap}><Spinner size={32} /></div>
          ) : files.length === 0 ? (
            <EmptyState
              emoji="🎵"
              title="Bibliothèque vide"
              description="Uploadez un fichier audio/vidéo ou ajoutez un lien YouTube/Spotify."
            />
          ) : filtered.length === 0 ? (
            <EmptyState emoji="🔍" title="Aucun résultat" description="Modifiez les filtres ou la recherche." />
          ) : (
            <ul className={[styles.list, styles.libraryGrid].join(' ')}>
              {filtered.map((file, i) => (
                <FileRow
                  key={file.id}
                  file={file}
                  isPlaying={playingFile?.id === file.id}
                  onPlay={() => playFiles(filtered, i)}
                  onDelete={() => {
                    if (playingFile?.id === file.id) stop()
                    deleteFile.mutate(file.id)
                  }}
                  onEdit={() => setEditingFile(file)}
                  onAddToPlaylist={() => setAddToPlaylistFileId(file.id)}
                  manualPlaylists={playlists.filter(p => p.type === 'manual')}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {/* ── Listes tab ───────────────────────────────────────────── */}
      {activeTab === 'listes' && (
        <PlaylistsPane
          playlists={playlists}
          allFiles={files}
          selectedId={selectedPlaylistId}
          onSelect={setSelectedPlaylistId}
          onBack={() => setSelectedPlaylistId(null)}
          onNewManual={() => setShowAddPlaylist(true)}
          onNewSmart={() => setShowAddSmart(true)}
          onPlay={playFiles}
          playingFileId={playingFile?.id ?? null}
        />
      )}

      {/* ── Modals ───────────────────────────────────────────────── */}
      {showUrlModal && <AddUrlModal onClose={() => setShowUrlModal(false)} />}

      {showAddPlaylist && <AddPlaylistModal onClose={() => setShowAddPlaylist(false)} />}

      {showAddSmart && (
        <AddSmartPlaylistModal files={files} members={members} onClose={() => setShowAddSmart(false)} />
      )}

      {addToPlaylistFileId && (
        <AddToPlaylistModal
          mediaFileId={addToPlaylistFileId}
          playlists={playlists.filter(p => p.type === 'manual')}
          onClose={() => setAddToPlaylistFileId(null)}
        />
      )}

      {editingFile && (
        <EditFileModal file={editingFile} onClose={() => setEditingFile(null)} />
      )}

    </div>
  )
}

// ── FileRow ───────────────────────────────────────────────────────────────────

function FileRow({ file, isPlaying, onPlay, onDelete, onEdit, onAddToPlaylist, manualPlaylists }: {
  file: MediaFile
  isPlaying: boolean
  onPlay: () => void
  onDelete: () => void
  onEdit: () => void
  onAddToPlaylist: () => void
  manualPlaylists: LecteurPlaylist[]
}) {
  const [showActions, setShowActions] = useState(false)
  const kind = detectKind(file)
  const meta = KIND_META[kind]

  return (
    <li>
      <div
        className={[styles.fileRow, isPlaying ? styles.fileRowPlaying : ''].join(' ')}
        onClick={!showActions ? onPlay : undefined}
        onKeyDown={!showActions ? (e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay() }
        }) : undefined}
        role="button"
        tabIndex={0}
        aria-label={`Lire ${file.title}`}
      >
        <div className={[styles.kindIcon, isPlaying ? styles.kindIconPlaying : ''].join(' ')}>
          {isPlaying ? (
            <EqBars small />
          ) : (
            <>
              <span className={styles.kindEmoji} aria-hidden="true">{meta.emoji}</span>
              <span className={styles.kindPlay}><Play size={16} strokeWidth={2} fill="currentColor" /></span>
            </>
          )}
        </div>
        <div className={styles.fileBody}>
          <div className={styles.fileTitle}>{file.title}</div>
          <div className={styles.fileMeta}>
            <span className={styles.fileKindTag}>{meta.label}</span>
            {file.member && <span className={styles.fileMember}>{file.member.display_name}</span>}
          </div>
          {(file.tags ?? []).length > 0 && (
            <div className={styles.fileTags}>
              {(file.tags ?? []).map(t => (
                <span key={t} className={styles.fileTag}>#{t}</span>
              ))}
            </div>
          )}
        </div>

        {showActions ? (
          <div className={styles.fileActions} onClick={e => e.stopPropagation()}>
            <button
              className={styles.fileActionBtn}
              onClick={() => { onEdit(); setShowActions(false) }}
              aria-label="Modifier le titre"
              title="Modifier"
            >
              <Pencil size={15} strokeWidth={2} />
            </button>
            {manualPlaylists.length > 0 && (
              <button
                className={styles.fileActionBtn}
                onClick={() => { onAddToPlaylist(); setShowActions(false) }}
                aria-label="Ajouter à une liste"
                title="Ajouter à une liste"
              >
                <ListMusic size={15} strokeWidth={2} />
              </button>
            )}
            <button
              className={[styles.fileActionBtn, styles.fileActionDelete].join(' ')}
              onClick={() => { onDelete(); setShowActions(false) }}
              aria-label="Supprimer"
              title="Supprimer"
            >
              <Trash2 size={15} strokeWidth={2} />
            </button>
            <button
              className={styles.fileMoreBtn}
              onClick={() => setShowActions(false)}
              aria-label="Fermer"
            >
              <X size={15} strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <button
            className={styles.fileMoreBtn}
            onClick={e => { e.stopPropagation(); setShowActions(true) }}
            aria-label="Actions"
          >
            <MoreHorizontal size={16} strokeWidth={2} />
          </button>
        )}
      </div>
    </li>
  )
}

// ── TagInput ──────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')

  function add(raw: string) {
    const t = raw.trim().toLowerCase().replace(/^#+/, '')
    if (t && !tags.includes(t)) onChange([...tags, t])
    setInput('')
  }

  return (
    <div>
      {tags.length > 0 && (
        <div className={styles.tagEditChips}>
          {tags.map(t => (
            <span key={t} className={styles.tagEditChip}>
              #{t}
              <button type="button" onClick={() => onChange(tags.filter(x => x !== t))} aria-label={`Retirer ${t}`}>
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        className={styles.input}
        value={input}
        aria-label="Ajouter un tag"
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input) }
          else if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1))
        }}
        onBlur={() => { if (input.trim()) add(input) }}
        placeholder="chill, workout, enfants… (Entrée pour valider)"
      />
    </div>
  )
}

// ── PlaylistsPane ─────────────────────────────────────────────────────────────

function PlaylistsPane({ playlists, allFiles, selectedId, onSelect, onBack, onNewManual, onNewSmart, onPlay, playingFileId }: {
  playlists: LecteurPlaylist[]
  allFiles: MediaFile[]
  selectedId: string | null
  onSelect: (id: string) => void
  onBack: () => void
  onNewManual: () => void
  onNewSmart: () => void
  onPlay: (files: MediaFile[], index: number) => void
  playingFileId: string | null
}) {
  const selected = selectedId ? playlists.find(p => p.id === selectedId) ?? null : null

  if (selected) {
    return (
      <PlaylistDetailPane
        playlist={selected}
        allFiles={allFiles}
        onBack={onBack}
        onPlay={onPlay}
        playingFileId={playingFileId}
      />
    )
  }

  return (
    <>
      <div className={styles.playlistActions}>
        <button className={styles.newListBtn} onClick={onNewManual}>
          <Plus size={13} strokeWidth={2.5} /> Nouvelle liste
        </button>
        <button className={styles.newSmartBtn} onClick={onNewSmart}>
          <Sparkles size={13} strokeWidth={2.5} aria-hidden="true" /> Smart liste
        </button>
      </div>

      {playlists.length === 0 ? (
        <EmptyState emoji="🎵" title="Aucune liste" description="Créez une liste de lecture ou une smart liste." />
      ) : (
        <ul className={styles.playlistList}>
          {playlists.map(pl => {
            const displayFiles = pl.type === 'smart' && pl.smart_filters
              ? applyLecteurFilters(allFiles, pl.smart_filters)
              : null
            const count = displayFiles?.length ?? null
            const isCurrentContext = playingFileId && displayFiles?.some(f => f.id === playingFileId)

            return (
              <li key={pl.id}>
                <button className={styles.playlistRow} onClick={() => onSelect(pl.id)}>
                  <span className={styles.playlistIcon}>
                    {isCurrentContext ? <EqBars small /> : (pl.type === 'smart' ? '✨' : '🎵')}
                  </span>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div className={styles.playlistName}>{pl.name}</div>
                    {pl.smart_filters && (
                      <div className={styles.playlistMeta}>{smartFilterLabel(pl.smart_filters)}</div>
                    )}
                  </div>
                  {count !== null && <span className={styles.playlistCount}>{count}</span>}
                  <ChevronRight size={16} strokeWidth={2} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function smartFilterLabel(f: LecteurSmartFilters): string {
  const parts: string[] = []
  if (f.kind)   parts.push(KIND_META[f.kind].emoji + ' ' + f.kind)
  if (f.tag)    parts.push('#' + f.tag)
  if (f.sort === 'az')     parts.push('A→Z')
  if (f.sort === 'oldest') parts.push('Plus anciens')
  return parts.length > 0 ? parts.join(' · ') : 'Tous les médias'
}

// ── PlaylistDetailPane ────────────────────────────────────────────────────────

function PlaylistDetailPane({ playlist, allFiles, onBack, onPlay, playingFileId }: {
  playlist: LecteurPlaylist
  allFiles: MediaFile[]
  onBack: () => void
  onPlay: (files: MediaFile[], index: number) => void
  playingFileId: string | null
}) {
  const deletePlaylist     = useDeleteLecteurPlaylist()
  const removeFromPlaylist = useRemoveFromLecteurPlaylist()
  const { data: rawItems = [] } = useLecteurPlaylistItems(playlist.type === 'manual' ? playlist.id : null)

  const displayFiles: MediaFile[] = playlist.type === 'smart' && playlist.smart_filters
    ? applyLecteurFilters(allFiles, playlist.smart_filters)
    : rawItems.map(ri => ri.media_file).filter(Boolean) as MediaFile[]

  return (
    <>
      <div className={styles.playlistDetailHeader}>
        <button className={styles.backBtn} onClick={onBack}>
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
        <div style={{ flex: 1 }}>
          <div className={styles.playlistDetailName}>
            {playlist.type === 'smart' ? '✨ ' : '🎵 '}{playlist.name}
          </div>
          {playlist.smart_filters && (
            <div className={styles.playlistDetailFilters}>{smartFilterLabel(playlist.smart_filters)}</div>
          )}
        </div>
        {displayFiles.length > 0 && (
          <button
            className={styles.playAllBtn}
            onClick={() => onPlay(displayFiles, 0)}
            aria-label="Lire tout"
          >
            <Play size={13} strokeWidth={2.5} />
            Lire tout
          </button>
        )}
        <button
          className={styles.deleteListBtn}
          onClick={() => { deletePlaylist.mutate(playlist.id); onBack() }}
          aria-label="Supprimer la liste"
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>

      {displayFiles.length === 0 ? (
        <EmptyState
          emoji="🎵"
          title="Liste vide"
          description={playlist.type === 'smart' ? 'Aucun fichier ne correspond.' : 'Ajoutez des fichiers depuis la bibliothèque.'}
        />
      ) : (
        <ul className={styles.list}>
          {displayFiles.map((file, i) => (
            <li key={file.id}>
              <div
                className={[styles.playlistItemRow, playingFileId === file.id ? styles.playlistItemPlaying : ''].join(' ')}
                onClick={() => onPlay(displayFiles, i)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlay(displayFiles, i) }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Lire ${file.title}`}
              >
                <span className={styles.playlistItemPos}>
                  {playingFileId === file.id ? <EqBars small /> : i + 1}
                </span>
                <span style={{ fontSize: 18 }} aria-hidden="true">{KIND_META[detectKind(file)].emoji}</span>
                <div className={styles.fileBody} style={{ flex: 1 }}>
                  <div className={styles.fileTitle}>{file.title}</div>
                  {file.member && <div className={styles.fileMeta}>{file.member.display_name}</div>}
                </div>
                {playlist.type === 'manual' && (
                  <button
                    className={styles.removeFromListBtn}
                    onClick={e => {
                      e.stopPropagation()
                      const ri = rawItems.find(r => r.media_file_id === file.id)
                      if (ri) removeFromPlaylist.mutate({ itemId: ri.id, playlistId: playlist.id })
                    }}
                    aria-label="Retirer de la liste"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ── AddUrlModal ───────────────────────────────────────────────────────────────

function AddUrlModal({ onClose }: { onClose: () => void }) {
  const addFile = useAddMediaFile()
  const [title, setTitle] = useState('')
  const [url,   setUrl]   = useState('')
  const [tags,  setTags]  = useState<string[]>([])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !url.trim()) return
    await addFile.mutateAsync({ title, external_url: url, tags })
    onClose()
  }

  return (
    <SlideUpModal title="Ajouter un lien" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label htmlFor="l-title" className={styles.fieldLabel}>Titre</label>
          <input id="l-title" type="text" value={title} autoFocus required
            onChange={e => setTitle(e.target.value)}
            className={styles.input} placeholder="Ma playlist, Podcast du mois…" />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="l-url" className={styles.fieldLabel}>URL</label>
          <input id="l-url" type="url" value={url} required
            onChange={e => setUrl(e.target.value)}
            className={styles.input} placeholder="https://youtube.com/watch?v=…" />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Tags</label>
          <TagInput tags={tags} onChange={setTags} />
        </div>
        <button type="submit" className={styles.submitBtn} disabled={addFile.isPending || !title.trim() || !url.trim()}>
          {addFile.isPending ? 'Ajout…' : 'Ajouter'}
        </button>
      </form>
    </SlideUpModal>
  )
}

// ── AddPlaylistModal ──────────────────────────────────────────────────────────

function AddPlaylistModal({ onClose }: { onClose: () => void }) {
  const addPlaylist = useAddLecteurPlaylist()
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
          <input id="pl-name" type="text" value={name} autoFocus required
            onChange={e => setName(e.target.value)}
            className={styles.input} placeholder="Musique du soir, Podcasts…" />
        </div>
        <button type="submit" className={styles.submitBtn} disabled={addPlaylist.isPending || !name.trim()}>
          {addPlaylist.isPending ? 'Création…' : 'Créer'}
        </button>
      </form>
    </SlideUpModal>
  )
}

// ── AddSmartPlaylistModal ─────────────────────────────────────────────────────

function AddSmartPlaylistModal({ files, members, onClose }: {
  files: MediaFile[]
  members: { id: string; display_name: string }[]
  onClose: () => void
}) {
  const addPlaylist = useAddLecteurPlaylist()
  const [name,    setName]    = useState('')
  const [filters, setFilters] = useState<LecteurSmartFilters>({})

  const allTags = (() => {
    const set = new Set<string>()
    for (const f of files) for (const t of (f.tags ?? [])) set.add(t)
    return [...set].sort()
  })()

  const preview = applyLecteurFilters(files, filters)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await addPlaylist.mutateAsync({ name, type: 'smart', smart_filters: filters })
    onClose()
  }

  return (
    <SlideUpModal title="Smart liste" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label htmlFor="sp-name" className={styles.fieldLabel}>Nom</label>
          <input id="sp-name" type="text" value={name} autoFocus required
            onChange={e => setName(e.target.value)}
            className={styles.input} placeholder="Musique, Vidéos maison…" />
        </div>

        <div className={styles.smartSection}>
          <div className={styles.smartRow}>
            <span className={styles.smartLabel}>Type</span>
            <div className={styles.smartPills}>
              <button type="button"
                className={[styles.smartPill, !filters.kind ? styles.smartPillActive : ''].join(' ')}
                onClick={() => setFilters(f => ({ ...f, kind: undefined }))}>Tous</button>
              {(['audio', 'vidéo', 'lien'] as MediaFileKind[]).map(k => (
                <button key={k} type="button"
                  className={[styles.smartPill, filters.kind === k ? styles.smartPillActive : ''].join(' ')}
                  onClick={() => setFilters(f => ({ ...f, kind: f.kind === k ? undefined : k }))}>
                  {KIND_META[k].emoji} {KIND_META[k].label}
                </button>
              ))}
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

          {allTags.length > 0 && (
            <div className={styles.smartRow}>
              <span className={styles.smartLabel}>Tag</span>
              <div className={styles.smartPills}>
                <button type="button"
                  className={[styles.smartPill, !filters.tag ? styles.smartPillActive : ''].join(' ')}
                  onClick={() => setFilters(f => ({ ...f, tag: undefined }))}>Tous</button>
                {allTags.map(t => (
                  <button key={t} type="button"
                    className={[styles.smartPill, filters.tag === t ? styles.smartPillActive : ''].join(' ')}
                    onClick={() => setFilters(f => ({ ...f, tag: f.tag === t ? undefined : t }))}>
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.smartRow}>
            <span className={styles.smartLabel}>Ordre</span>
            <div className={styles.smartPills}>
              {([
                { value: undefined,   label: 'Récent'       },
                { value: 'az',        label: 'A → Z'        },
                { value: 'oldest',    label: 'Plus anciens' },
              ] as { value: LecteurSmartFilters['sort']; label: string }[]).map(opt => (
                <button key={opt.label} type="button"
                  className={[styles.smartPill, filters.sort === opt.value ? styles.smartPillActive : ''].join(' ')}
                  onClick={() => setFilters(f => ({ ...f, sort: opt.value }))}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.smartPreviewLabel}>
          Résultat : {preview.length} fichier{preview.length !== 1 ? 's' : ''}
        </div>

        <button type="submit" className={styles.submitBtn} disabled={addPlaylist.isPending || !name.trim()}>
          {addPlaylist.isPending ? 'Création…' : 'Créer la smart liste'}
        </button>
      </form>
    </SlideUpModal>
  )
}

// ── AddToPlaylistModal ────────────────────────────────────────────────────────

function AddToPlaylistModal({ mediaFileId, playlists, onClose }: {
  mediaFileId: string
  playlists: LecteurPlaylist[]
  onClose: () => void
}) {
  const addTo = useAddToLecteurPlaylist()

  async function handleAdd(playlistId: string) {
    await addTo.mutateAsync({ playlistId, mediaFileId })
    onClose()
  }

  return (
    <SlideUpModal title="Ajouter à une liste" onClose={onClose}>
      <div className={styles.form}>
        {playlists.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
            Créez d'abord une liste manuelle.
          </p>
        ) : (
          <ul className={styles.playlistPickerList}>
            {playlists.map(pl => (
              <li key={pl.id}>
                <button className={styles.playlistPickerRow}
                  onClick={() => handleAdd(pl.id)} disabled={addTo.isPending}>
                  <span>🎵</span>
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

// ── EditFileModal ─────────────────────────────────────────────────────────────

function EditFileModal({ file, onClose }: { file: MediaFile; onClose: () => void }) {
  const editFile = useEditMediaFile()
  const [title, setTitle] = useState(file.title)
  const [tags,  setTags]  = useState<string[]>(file.tags ?? [])

  const unchanged = title.trim() === file.title &&
    JSON.stringify(tags) === JSON.stringify(file.tags ?? [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await editFile.mutateAsync({ id: file.id, title, tags })
      onClose()
    } catch { /* onError handles toast */ }
  }

  return (
    <SlideUpModal title="Modifier" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label htmlFor="edit-file-title" className={styles.fieldLabel}>Titre</label>
          <input
            id="edit-file-title"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={styles.input}
            autoFocus
            required
            placeholder="Titre du fichier…"
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Tags</label>
          <TagInput tags={tags} onChange={setTags} />
        </div>
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={editFile.isPending || !title.trim() || unchanged}
        >
          {editFile.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </SlideUpModal>
  )
}
