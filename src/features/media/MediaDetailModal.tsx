import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Pencil, Trash2, ExternalLink } from 'lucide-react'
import { memberColor } from '../../lib/constants'
import SlideUpModal from '../../components/SlideUpModal'
import { useMember } from '../../auth/useMember'
import { useUpdateMediaItem, useDeleteMediaItem, useUpsertMyRating } from './useMedia'
import type { MediaItem, MediaType, UpdateMediaInput, MediaRating } from './useMedia'
import { TYPE_META, STATUS_STYLE } from './MediaRow'
import styles from './MediaPage.module.css'

const TYPES: MediaType[] = ['film', 'série', 'livre', 'jeu']

function formatDate(d: string | null) {
  if (!d) return null
  return format(parseISO(d), 'd MMM yyyy', { locale: fr })
}

type EditDraft = {
  title: string; type: MediaType
  author_director: string; release_year: string; genre: string; external_url: string
}

export default function MediaDetailModal({ item, members, ratings, onClose, onCycleStatus }: {
  item: MediaItem
  members: { id: string; display_name: string }[]
  ratings: MediaRating[]
  onClose: () => void
  onCycleStatus: () => void
}) {
  const { data: member } = useMember()
  const updateItem = useUpdateMediaItem()
  const deleteItem = useDeleteMediaItem()
  const upsertRating = useUpsertMyRating()

  const myRating = ratings.find(r => r.member_id === member?.id) ?? null
  const othersRatings = ratings.filter(r => r.member_id !== member?.id && (r.rating != null || r.comment))

  const [editMode, setEditMode]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [commentText, setCommentText] = useState(myRating?.comment ?? '')
  const [editDraft, setEditDraft]   = useState<EditDraft>({
    title:           item.title,
    type:            item.type,
    author_director: item.author_director ?? '',
    release_year:    item.release_year != null ? String(item.release_year) : '',
    genre:           item.genre ?? '',
    external_url:    item.external_url ?? '',
  })

  useEffect(() => { setCommentText(myRating?.comment ?? '') }, [myRating?.comment])
  useEffect(() => {
    setEditDraft({
      title:           item.title,
      type:            item.type,
      author_director: item.author_director ?? '',
      release_year:    item.release_year != null ? String(item.release_year) : '',
      genre:           item.genre ?? '',
      external_url:    item.external_url ?? '',
    })
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function onUpdate(fields: Omit<UpdateMediaInput, 'id'>) {
    updateItem.mutate({ id: item.id, ...fields })
  }

  function handleDelete() {
    deleteItem.mutate(item.id)
    onClose()
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

  const memberIdx = members.findIndex(m => m.id === item.member_id)
  const meta      = TYPE_META[item.type]

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
              id="d-title" type="text" value={editDraft.title} required autoFocus
              onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
              className={styles.input}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Type</label>
            <div className={styles.typePills}>
              {TYPES.map(t => (
                <button
                  key={t} type="button"
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
              id="d-author" type="text" value={editDraft.author_director}
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
                id="d-year" type="number" inputMode="numeric" value={editDraft.release_year} min={1800} max={2100}
                onChange={e => setEditDraft(d => ({ ...d, release_year: e.target.value }))}
                className={styles.input}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="d-genre" className={styles.fieldLabel}>
                Genre <span className={styles.optional}>optionnel</span>
              </label>
              <input
                id="d-genre" type="text" value={editDraft.genre}
                onChange={e => setEditDraft(d => ({ ...d, genre: e.target.value }))}
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="d-url" className={styles.fieldLabel}>
              Où regarder <span className={styles.optional}>Netflix, YouTube…</span>
            </label>
            <input
              id="d-url" type="url" value={editDraft.external_url} placeholder="https://…"
              onChange={e => setEditDraft(d => ({ ...d, external_url: e.target.value }))}
              className={styles.input}
            />
          </div>

          <div className={styles.editActions}>
            <button type="submit" className={styles.submitBtn}>Sauvegarder</button>
            <button type="button" className={styles.cancelEditBtn} onClick={() => setEditMode(false)}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.detailView}>

          {/* Status */}
          <div className={styles.detailStatusRow}>
            <button
              className={styles.statusBtn}
              style={STATUS_STYLE[item.status]}
              onClick={onCycleStatus}
            >
              {item.status}
            </button>
            {item.status !== 'abandonné' ? (
              <button
                className={styles.abandonBtn}
                onClick={() => onUpdate({ status: 'abandonné' })}
              >
                Abandonner
              </button>
            ) : (
              <button
                className={styles.abandonBtn}
                onClick={() => onUpdate({ status: 'à voir' })}
              >
                Reprendre
              </button>
            )}
          </div>

          {/* Metadata */}
          {(item.author_director || item.release_year || item.genre) && (
            <div className={styles.detailMeta}>
              {item.author_director && <span className={styles.detailMetaItem}>{item.author_director}</span>}
              {item.release_year    && <span className={styles.detailMetaItem}>{item.release_year}</span>}
              {item.genre           && <span className={styles.detailMetaItem}>{item.genre}</span>}
            </div>
          )}

          {/* Dates */}
          {(item.started_at || item.finished_at) && (
            <div className={styles.detailDates}>
              {item.started_at  && <span className={styles.detailDateItem}>Commencé · {formatDate(item.started_at)}</span>}
              {item.finished_at && <span className={styles.detailDateItem}>Terminé · {formatDate(item.finished_at)}</span>}
            </div>
          )}

          {/* Member */}
          {item.member && memberIdx >= 0 && (
            <span className={styles.detailMemberTag} style={{ color: memberColor(memberIdx) }}>
              {item.member.display_name}
            </span>
          )}

          {/* Où regarder */}
          {item.external_url && (
            <div className={styles.detailSection}>
              <a
                href={item.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.watchLink}
              >
                <ExternalLink size={13} strokeWidth={2} />
                Où regarder
              </a>
            </div>
          )}

          {/* Ma note */}
          <div className={styles.detailSection}>
            <span className={styles.detailSectionLabel}>Ma note</span>
            <div className={styles.starRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  className={[styles.star, (myRating?.rating ?? 0) >= n ? styles.starFilled : ''].join(' ')}
                  onClick={() => upsertRating.mutate({
                    mediaItemId: item.id,
                    rating: myRating?.rating === n ? null : n,
                    comment: myRating?.comment ?? null,
                  })}
                  aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                >★</button>
              ))}
            </div>
            <textarea
              className={styles.commentInput}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onBlur={() => {
                const trimmed = commentText.trim()
                if (trimmed !== (myRating?.comment ?? '')) {
                  upsertRating.mutate({ mediaItemId: item.id, rating: myRating?.rating ?? null, comment: trimmed || null })
                }
              }}
              placeholder="Ajouter une note…"
              rows={3}
            />
          </div>

          {/* Notes des autres membres */}
          {othersRatings.length > 0 && (
            <div className={styles.detailSection}>
              <span className={styles.detailSectionLabel}>Notes du foyer</span>
              {othersRatings.map(r => {
                const idx = members.findIndex(m => m.id === r.member_id)
                return (
                  <div key={r.id} className={styles.otherRatingRow}>
                    <span className={styles.otherRatingName} style={{ color: idx >= 0 ? memberColor(idx) : 'var(--text-muted)' }}>
                      {r.member?.display_name ?? '?'}
                    </span>
                    {r.rating != null && (
                      <span className={styles.otherRatingStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    )}
                    {r.comment && <span className={styles.otherRatingComment}>{r.comment}</span>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Actions */}
          {confirmDelete ? (
            <div className={styles.detailActions}>
              <button className={styles.editBtn} onClick={() => setConfirmDelete(false)}>
                Annuler
              </button>
              <button className={styles.deleteActionBtn} onClick={handleDelete}>
                <Trash2 size={13} /> Confirmer la suppression
              </button>
            </div>
          ) : (
            <div className={styles.detailActions}>
              <button className={styles.editBtn} onClick={() => setEditMode(true)}>
                <Pencil size={13} /> Modifier
              </button>
              <button className={styles.deleteActionBtn} onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} /> Supprimer
              </button>
            </div>
          )}
        </div>
      )}
    </SlideUpModal>
  )
}
