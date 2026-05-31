import { useState, useRef } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Upload, Link as LinkIcon, Trash2, Plus, X, ListMusic } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { QK } from '../../lib/query-keys'
import { memberColor } from '../../lib/constants'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import MediaPlayer from '../media/MediaPlayer'
import {
  useMediaFiles, useAddMediaFile, useDeleteMediaFile, useUploadMediaFile,
  useLecteurPlaylists, useAddLecteurPlaylist, useDeleteLecteurPlaylist,
  useLecteurPlaylistItems, useAddToLecteurPlaylist, useRemoveFromLecteurPlaylist,
  detectKind, applyLecteurFilters,
} from './useLecteur'
import type { MediaFile, LecteurPlaylist, LecteurSmartFilters, MediaFileKind } from './useLecteur'
import styles from './LecteurPage.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const KIND_META: Record<MediaFileKind, { emoji: string; label: string }> = {
  audio:  { emoji: '🎵', label: 'Audio'  },
  vidéo:  { emoji: '🎬', label: 'Vidéo'  },
  lien:   { emoji: '🔗', label: 'Lien'   },
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LecteurPage() {
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
  })

  const fileRef = useRef<HTMLInputElement>(null)

  // ── Tabs ──
  const [activeTab, setActiveTab] = useState<'bibliothèque' | 'listes'>('bibliothèque')

  // ── Filters ──
  const [filterKind, setFilterKind]           = useState<MediaFileKind | null>(null)
  const [filterMemberId, setFilterMemberId]   = useState<string | null>(null)

  // ── Modals ──
  const [showUrlModal, setShowUrlModal]         = useState(false)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  const [showAddPlaylist, setShowAddPlaylist]   = useState(false)
  const [showAddSmart, setShowAddSmart]         = useState(false)
  const [addToPlaylistFileId, setAddToPlaylistFileId] = useState<string | null>(null)

  // ── Player ──
  const [playingFileId, setPlayingFileId] = useState<string | null>(null)

  // ── Derived ──
  const filtered = files.filter(f => {
    if (filterKind     && detectKind(f) !== filterKind)     return false
    if (filterMemberId && f.member_id   !== filterMemberId) return false
    return true
  })

  const playingFile = playingFileId ? files.find(f => f.id === playingFileId) ?? null : null

  // ── Handlers ──
  async function handleUpload(file: File) {
    const result = await uploadFile.mutateAsync(file)
    const name   = file.name.replace(/\.[^.]+$/, '')
    await addFile.mutateAsync({
      title:     name,
      file_path: result.path,
      mime_type: result.mimeType,
    })
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
          <div className={styles.headerActions}>
            <button
              className={styles.urlBtn}
              onClick={() => setShowUrlModal(true)}
            >
              <LinkIcon size={13} strokeWidth={2} />
              URL
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

      {/* ── Player actif ─────────────────────────────────────────── */}
      {playingFile && (
        <div className={styles.playerWrap}>
          <MediaPlayer
            filePath={playingFile.file_path}
            externalUrl={playingFile.external_url}
            mimeType={playingFile.mime_type}
            title={playingFile.title}
          />
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className={styles.tabRow}>
        <button
          className={[styles.tab, activeTab === 'bibliothèque' ? styles.tabActive : ''].join(' ')}
          onClick={() => setActiveTab('bibliothèque')}
        >Bibliothèque</button>
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
          <div className={styles.filterRow}>
            <button
              className={[styles.filterPill, !filterKind ? styles.filterPillActive : ''].join(' ')}
              onClick={() => setFilterKind(null)}
            >Tous · {files.length}</button>
            {(['audio', 'vidéo', 'lien'] as MediaFileKind[]).map(k => (
              <button
                key={k}
                className={[styles.filterPill, filterKind === k ? styles.filterPillActive : ''].join(' ')}
                onClick={() => setFilterKind(fk => fk === k ? null : k)}
              >
                {KIND_META[k].emoji} {KIND_META[k].label}s
              </button>
            ))}
          </div>

          {members.length > 1 && (
            <div className={styles.filterRow}>
              <button
                className={[styles.filterPill, !filterMemberId ? styles.filterPillActive : ''].join(' ')}
                onClick={() => setFilterMemberId(null)}
              >Tous</button>
              {members.map((m, i) => {
                const active = filterMemberId === m.id
                const color  = memberColor(i)
                return (
                  <button
                    key={m.id}
                    className={[styles.filterPill, active ? styles.filterPillActive : ''].join(' ')}
                    style={active ? { borderColor: color, background: `${color}1A`, color } : {}}
                    onClick={() => setFilterMemberId(id => id === m.id ? null : m.id)}
                  >{m.display_name}</button>
                )
              })}
            </div>
          )}

          {isLoading ? (
            <div className={styles.spinnerWrap}><Spinner size={32} /></div>
          ) : files.length === 0 ? (
            <EmptyState
              emoji="🎵"
              title="Bibliothèque vide"
              description="Uploadez un fichier audio/vidéo ou ajoutez un lien YouTube/Spotify."
            />
          ) : (
            <ul className={styles.list}>
              {filtered.map(file => (
                <FileRow
                  key={file.id}
                  file={file}
                  isPlaying={playingFileId === file.id}
                  onPlay={() => setPlayingFileId(id => id === file.id ? null : file.id)}
                  onDelete={() => deleteFile.mutate(file.id)}
                  onAddToPlaylist={() => setAddToPlaylistFileId(file.id)}
                  manualPlaylists={playlists.filter(p => p.type === 'manual')}
                />
              ))}
              {filtered.length === 0 && filterKind && (
                <EmptyState emoji="🔍" title="Aucun résultat." description="Modifiez le filtre." />
              )}
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
          onPlay={setPlayingFileId}
          playingFileId={playingFileId}
        />
      )}

      {/* ── Modals ───────────────────────────────────────────────── */}
      {showUrlModal && (
        <AddUrlModal onClose={() => setShowUrlModal(false)} />
      )}

      {showAddPlaylist && (
        <AddPlaylistModal onClose={() => setShowAddPlaylist(false)} />
      )}

      {showAddSmart && (
        <AddSmartPlaylistModal
          files={files}
          members={members}
          onClose={() => setShowAddSmart(false)}
        />
      )}

      {addToPlaylistFileId && (
        <AddToPlaylistModal
          mediaFileId={addToPlaylistFileId}
          playlists={playlists.filter(p => p.type === 'manual')}
          onClose={() => setAddToPlaylistFileId(null)}
        />
      )}

    </div>
  )
}

// ── FileRow ───────────────────────────────────────────────────────────────────

function FileRow({ file, isPlaying, onPlay, onDelete, onAddToPlaylist, manualPlaylists }: {
  file: MediaFile
  isPlaying: boolean
  onPlay: () => void
  onDelete: () => void
  onAddToPlaylist: () => void
  manualPlaylists: LecteurPlaylist[]
}) {
  const kind = detectKind(file)
  const meta = KIND_META[kind]

  return (
    <li>
      <div
        className={styles.fileRow}
        onClick={onPlay}
        role="button"
        tabIndex={0}
      >
        <div className={styles.kindIcon}>{meta.emoji}</div>
        <div className={styles.fileBody}>
          <div className={styles.fileTitle}>{file.title}</div>
          <div className={styles.fileMeta}>
            {meta.label}
            {file.member && ` · ${file.member.display_name}`}
          </div>
        </div>
        {isPlaying && <div className={styles.playingIndicator} />}
        {manualPlaylists.length > 0 && (
          <button
            className={styles.addToListBtn}
            onClick={e => { e.stopPropagation(); onAddToPlaylist() }}
            title="Ajouter à une liste"
          >
            <Plus size={11} strokeWidth={2.5} />
          </button>
        )}
        <button
          className={styles.deleteBtn}
          onClick={e => { e.stopPropagation(); onDelete() }}
          aria-label="Supprimer"
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>
    </li>
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
  onPlay: (id: string) => void
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
          ✨ Smart liste
        </button>
      </div>

      {playlists.length === 0 ? (
        <EmptyState emoji="🎵" title="Aucune liste" description="Créez une liste de lecture ou une smart liste." />
      ) : (
        <ul className={styles.playlistList}>
          {playlists.map(pl => {
            const count = pl.type === 'smart' && pl.smart_filters
              ? applyLecteurFilters(allFiles, pl.smart_filters).length
              : null
            return (
              <li key={pl.id}>
                <button className={styles.playlistRow} onClick={() => onSelect(pl.id)}>
                  <span className={styles.playlistIcon}>{pl.type === 'smart' ? '✨' : '🎵'}</span>
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
  if (f.kind) parts.push(KIND_META[f.kind].emoji + ' ' + f.kind)
  return parts.length > 0 ? parts.join(' · ') : 'Tous les médias'
}

// ── PlaylistDetailPane ────────────────────────────────────────────────────────

function PlaylistDetailPane({ playlist, allFiles, onBack, onPlay, playingFileId }: {
  playlist: LecteurPlaylist
  allFiles: MediaFile[]
  onBack: () => void
  onPlay: (id: string) => void
  playingFileId: string | null
}) {
  const deletePlaylist    = useDeleteLecteurPlaylist()
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
        <button className={styles.deleteListBtn} onClick={() => { deletePlaylist.mutate(playlist.id); onBack() }}>
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>

      {displayFiles.length === 0 ? (
        <EmptyState emoji="🎵" title="Liste vide"
          description={playlist.type === 'smart' ? 'Aucun fichier ne correspond.' : 'Ajoutez des fichiers depuis la bibliothèque.'} />
      ) : (
        <ul className={styles.list}>
          {displayFiles.map((file, i) => (
            <li key={file.id}>
              <div className={styles.playlistItemRow} onClick={() => onPlay(file.id)} role="button" tabIndex={0}>
                <span className={styles.playlistItemPos}>{i + 1}</span>
                <span style={{ fontSize: 18 }}>{KIND_META[detectKind(file)].emoji}</span>
                <div className={styles.fileBody} style={{ flex: 1 }}>
                  <div className={styles.fileTitle}>{file.title}</div>
                </div>
                {playingFileId === file.id && <div className={styles.playingIndicator} />}
                {playlist.type === 'manual' && (
                  <button className={styles.removeFromListBtn} onClick={e => {
                    e.stopPropagation()
                    const ri = rawItems.find(r => r.media_file_id === file.id)
                    if (ri) removeFromPlaylist.mutate({ itemId: ri.id, playlistId: playlist.id })
                  }}>
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
  const [title, setTitle]   = useState('')
  const [url, setUrl]       = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !url.trim()) return
    await addFile.mutateAsync({ title, external_url: url })
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
  const [name, setName]       = useState('')
  const [filters, setFilters] = useState<LecteurSmartFilters>({})

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
