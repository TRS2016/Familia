import { useState } from 'react'
import { CornerDownRight, ListMusic, ListPlus, MoreHorizontal, Pencil, Play, Star, Trash2, X } from 'lucide-react'
import EqBars from './EqBars'
import { detectKind } from './useLecteur'
import type { LecteurPlaylist, MediaFile } from './useLecteur'
import { KIND_META, fmtDuration, youtubeThumb } from './lecteur.utils'
import styles from './LecteurPage.module.css'

export default function FileRow({ file, isPlaying, onPlay, onDelete, onEdit, onAddToPlaylist, onToggleFavorite, onQueue, onPlayNext, manualPlaylists }: {
  file: MediaFile
  isPlaying: boolean
  onPlay: () => void
  onDelete: () => void
  onEdit: () => void
  onAddToPlaylist: () => void
  onToggleFavorite: () => void
  onQueue: () => void
  onPlayNext: () => void
  manualPlaylists: LecteurPlaylist[]
}) {
  const [showActions, setShowActions] = useState(false)
  const kind = detectKind(file)
  const meta = KIND_META[kind]
  const thumb = youtubeThumb(file.external_url)

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
              {thumb
                ? <img className={styles.kindThumb} src={thumb} alt="" loading="lazy" />
                : <span className={styles.kindEmoji} aria-hidden="true">{meta.emoji}</span>}
              <span className={styles.kindPlay}><Play size={16} strokeWidth={2} fill="currentColor" /></span>
            </>
          )}
        </div>
        <div className={styles.fileBody}>
          <div className={styles.fileTitle}>{file.title}</div>
          <div className={styles.fileMeta}>
            <span className={styles.fileKindTag}>{meta.label}</span>
            {file.duration_seconds != null && file.duration_seconds > 0 && (
              <span className={styles.fileDuration}>{fmtDuration(file.duration_seconds)}</span>
            )}
            {file.member && <span className={styles.fileMember}>{file.member.display_name}</span>}
            {file.play_count > 0 && (
              <span className={styles.fileDuration} title={`${file.play_count} écoute${file.play_count > 1 ? 's' : ''}`}>
                ▶ {file.play_count}
              </span>
            )}
          </div>
          {(file.tags ?? []).length > 0 && (
            <div className={styles.fileTags}>
              {(file.tags ?? []).map(t => (
                <span key={t} className={styles.fileTag}>#{t}</span>
              ))}
            </div>
          )}
        </div>

        <button
          className={[styles.favBtn, file.is_favorite ? styles.favBtnActive : ''].join(' ')}
          onClick={e => { e.stopPropagation(); onToggleFavorite() }}
          aria-label={file.is_favorite ? `Retirer ${file.title} des favoris` : `Ajouter ${file.title} aux favoris`}
          aria-pressed={file.is_favorite}
          title={file.is_favorite ? 'Favori' : 'Ajouter aux favoris'}
        >
          <Star size={15} strokeWidth={2} fill={file.is_favorite ? 'currentColor' : 'none'} />
        </button>

        {showActions ? (
          <div className={styles.fileActions} onClick={e => e.stopPropagation()}>
            <button
              className={styles.fileActionBtn}
              onClick={() => { onPlayNext(); setShowActions(false) }}
              aria-label="Lire ensuite"
              title="Lire ensuite"
            >
              <CornerDownRight size={15} strokeWidth={2} />
            </button>
            <button
              className={styles.fileActionBtn}
              onClick={() => { onQueue(); setShowActions(false) }}
              aria-label="Ajouter à la file de soirée"
              title="Ajouter à la file"
            >
              <ListPlus size={15} strokeWidth={2} />
            </button>
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
