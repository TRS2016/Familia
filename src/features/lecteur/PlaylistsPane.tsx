import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ListVideo, Play, Plus, Shuffle, Sparkles, Trash2, X } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import EqBars from './EqBars'
import {
  applyLecteurFilters, detectKind, useDeleteLecteurPlaylist, useLecteurPlaylistItems,
  useRemoveFromLecteurPlaylist, useReorderLecteurPlaylistItem,
} from './useLecteur'
import type { LecteurPlaylist, MediaFile } from './useLecteur'
import { KIND_META, shuffleArray, smartFilterLabel } from './lecteur.utils'
import styles from './LecteurPage.module.css'

export default function PlaylistsPane({ playlists, allFiles, selectedId, onSelect, onBack, onNewManual, onNewSmart, onImportYt, onPlay, playingFileId }: {
  playlists: LecteurPlaylist[]
  allFiles: MediaFile[]
  selectedId: string | null
  onSelect: (id: string) => void
  onBack: () => void
  onNewManual: () => void
  onNewSmart: () => void
  onImportYt: () => void
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
        <button className={styles.newListBtn} onClick={onImportYt}>
          <ListVideo size={13} strokeWidth={2.5} aria-hidden="true" /> Importer YouTube
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

function PlaylistDetailPane({ playlist, allFiles, onBack, onPlay, playingFileId }: {
  playlist: LecteurPlaylist
  allFiles: MediaFile[]
  onBack: () => void
  onPlay: (files: MediaFile[], index: number) => void
  playingFileId: string | null
}) {
  const deletePlaylist     = useDeleteLecteurPlaylist()
  const removeFromPlaylist = useRemoveFromLecteurPlaylist()
  const reorderItem        = useReorderLecteurPlaylistItem()
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
        {displayFiles.length > 1 && (
          <button
            className={styles.shuffleBtn}
            onClick={() => onPlay(shuffleArray(displayFiles), 0)}
            aria-label="Lecture aléatoire"
            title="Lecture aléatoire"
          >
            <Shuffle size={14} strokeWidth={2.5} />
          </button>
        )}
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
                  <>
                    {/* rawItems suit le même ordre que displayFiles (tri position). */}
                    <button
                      className={styles.jukeboxMoveBtn}
                      onClick={e => { e.stopPropagation(); reorderItem.mutate({ a: rawItems[i], b: rawItems[i - 1] }) }}
                      disabled={i === 0 || reorderItem.isPending}
                      aria-label={`Monter ${file.title}`}
                    >
                      <ChevronUp size={15} strokeWidth={2.5} />
                    </button>
                    <button
                      className={styles.jukeboxMoveBtn}
                      onClick={e => { e.stopPropagation(); reorderItem.mutate({ a: rawItems[i], b: rawItems[i + 1] }) }}
                      disabled={i === displayFiles.length - 1 || reorderItem.isPending}
                      aria-label={`Descendre ${file.title}`}
                    >
                      <ChevronDown size={15} strokeWidth={2.5} />
                    </button>
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
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
