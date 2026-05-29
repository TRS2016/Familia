import { useState, useRef, useMemo } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Trash2, Camera, X, Pencil, MessageCircle, Send } from 'lucide-react'
import { format, parseISO, subDays, subYears } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useMember } from '../../auth/useMember'
import { memberColor } from '../../lib/constants'
import { capitalize } from '../../lib/utils'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import {
  useMoments, useTodayLastYear, useSignedPhotoUrls, useToggleReaction,
  useAddMoment, useDeleteMoment, useEditMomentText,
  useComments, useAddComment, useDeleteComment,
  EMOJIS,
} from './useMoments'
import type { Moment, MomentComment } from './useMoments'
import { useMomentsRealtime } from './useMomentsRealtime'
import styles from './MomentsPage.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const min  = Math.floor(diff / 60_000)
  if (min < 1)  return 'maintenant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)   return `il y a ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)    return `il y a ${d}j`
  return format(parseISO(isoString), 'd MMM', { locale: fr })
}

function dateSeparatorLabel(isoString: string): string {
  const dateStr  = format(parseISO(isoString), 'yyyy-MM-dd')
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  if (dateStr === todayStr) return 'Aujourd\'hui'
  if (dateStr === format(subDays(new Date(), 1), 'yyyy-MM-dd')) return 'Hier'
  const date     = parseISO(isoString)
  const daysDiff = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (daysDiff < 7)  return capitalize(format(date, 'EEEE', { locale: fr }))
  if (date.getFullYear() === new Date().getFullYear()) return capitalize(format(date, 'd MMMM', { locale: fr }))
  return capitalize(format(date, 'd MMMM yyyy', { locale: fr }))
}

function momentDateStr(m: Moment) {
  return format(parseISO(m.created_at), 'yyyy-MM-dd')
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ urls, initialIndex, onClose }: {
  urls: string[]
  initialIndex: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const url = urls[index]

  return (
    <div className={styles.lightbox} onClick={onClose}>
      <img src={url} className={styles.lightboxImg} alt="" onClick={e => e.stopPropagation()} />
      <button className={styles.lightboxClose} onClick={onClose} aria-label="Fermer">
        <X size={18} strokeWidth={2.5} />
      </button>
      {urls.length > 1 && (
        <>
          {index > 0 && (
            <button
              className={styles.lightboxNavPrev}
              onClick={e => { e.stopPropagation(); setIndex(i => i - 1) }}
              aria-label="Photo précédente"
            >
              <ChevronLeft size={22} strokeWidth={2.5} />
            </button>
          )}
          {index < urls.length - 1 && (
            <button
              className={styles.lightboxNavNext}
              onClick={e => { e.stopPropagation(); setIndex(i => i + 1) }}
              aria-label="Photo suivante"
            >
              <ChevronRight size={22} strokeWidth={2.5} />
            </button>
          )}
          <div className={styles.lightboxCounter}>{index + 1} / {urls.length}</div>
        </>
      )}
    </div>
  )
}

// ── PhotoGrid ─────────────────────────────────────────────────────────────────

function PhotoGrid({
  photoPaths,
  urlMap,
  onOpen,
}: {
  photoPaths: string[]
  urlMap: Record<string, string>
  onOpen: (index: number) => void
}) {
  const count = photoPaths.length
  if (count === 0) return null

  const urls = photoPaths.map(p => urlMap[p])

  if (count === 1) {
    if (!urls[0]) return <div className={styles.photoSkeleton} />
    return (
      <img
        src={urls[0]}
        className={[styles.photo, styles.photoClickable].join(' ')}
        alt=""
        loading="lazy"
        onClick={() => onOpen(0)}
      />
    )
  }

  if (count === 2) {
    return (
      <div className={[styles.photoGrid, styles.photoGrid2].join(' ')}>
        {[0, 1].map(i => (
          <div key={i} className={styles.photoThumbWrap} onClick={() => onOpen(i)}>
            {!urls[i] ? (
              <div className={styles.photoThumbSkeleton} />
            ) : (
              <img src={urls[i]} className={styles.photoThumb} alt="" loading="lazy" />
            )}
          </div>
        ))}
      </div>
    )
  }

  // 3+ photos: main (index 0) left + up to 2 thumbs (right), "+N" on last if more hidden
  const thumbIndices = [1, 2].filter(i => i < count)
  const extraCount   = count - 1 - thumbIndices.length

  return (
    <div className={[styles.photoGrid, styles.photoGrid3Plus].join(' ')}>
      <div className={styles.photoGridMain} onClick={() => onOpen(0)}>
        {!urls[0] ? (
          <div className={styles.photoGridMainSkeleton} />
        ) : (
          <img src={urls[0]} className={styles.photoGridMainImg} alt="" loading="lazy" />
        )}
      </div>
      <div className={styles.photoGridThumbs}>
        {thumbIndices.map((photoIdx, ti) => {
          const isLast = ti === thumbIndices.length - 1 && extraCount > 0
          return (
            <div key={photoIdx} className={styles.photoThumbWrap} onClick={() => onOpen(photoIdx)}>
              {!urls[photoIdx] ? (
                <div className={styles.photoThumbSkeleton} />
              ) : (
                <img src={urls[photoIdx]} className={styles.photoThumb} alt="" loading="lazy" />
              )}
              {isLast && (
                <div className={styles.photoMoreOverlay}>+{extraCount}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── CommentsSection ───────────────────────────────────────────────────────────

function CommentsSection({ momentId, currentMemberId }: { momentId: string; currentMemberId: string }) {
  const { data: comments = [], isLoading } = useComments(momentId)
  const addComment    = useAddComment()
  const deleteComment = useDeleteComment()
  const [text, setText] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await addComment.mutateAsync({ momentId, text })
    setText('')
  }

  return (
    <div className={styles.commentsSection}>
      {isLoading ? (
        <div className={styles.commentsSkeleton} />
      ) : (
        <>
          {comments.map(c => (
            <CommentRow
              key={c.id}
              comment={c}
              isOwn={c.member_id === currentMemberId}
              onDelete={() => deleteComment.mutate({ id: c.id, momentId })}
            />
          ))}
        </>
      )}
      <form className={styles.commentForm} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.commentInput}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Ajouter un commentaire…"
          maxLength={500}
        />
        <button
          type="submit"
          className={styles.commentSendBtn}
          disabled={!text.trim() || addComment.isPending}
          aria-label="Envoyer"
        >
          <Send size={14} strokeWidth={2.5} />
        </button>
      </form>
    </div>
  )
}

function CommentRow({ comment, isOwn, onDelete }: {
  comment: MomentComment
  isOwn: boolean
  onDelete: () => void
}) {
  const name = comment.member?.display_name ?? '?'
  return (
    <div className={styles.commentRow}>
      <span className={styles.commentAuthor}>{name}</span>
      <span className={styles.commentText}>{comment.text}</span>
      {isOwn && (
        <button className={styles.commentDeleteBtn} onClick={onDelete} aria-label="Supprimer">
          <X size={10} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

// ── MomentCard ────────────────────────────────────────────────────────────────

function MomentCard({ moment, currentMemberId, onDelete, onEdit, onOpenPhoto }: {
  moment: Moment
  currentMemberId: string
  onDelete: (m: Moment) => void
  onEdit: (m: Moment) => void
  onOpenPhoto: (urls: string[], index: number) => void
}) {
  const toggleReaction = useToggleReaction()
  const [showComments, setShowComments] = useState(false)
  const isOwn        = moment.member_id === currentMemberId
  const isOptimistic = moment.id.startsWith('optimistic-')
  const name         = moment.member?.display_name ?? '?'
  const colorIndex   = name.charCodeAt(0) % 4

  const photoPaths = useMemo(() => {
    if (moment.photos.length > 0) return moment.photos.map(p => p.photo_path)
    if (moment.photo_path && !moment.photo_archived) return [moment.photo_path]
    return []
  }, [moment.photos, moment.photo_path, moment.photo_archived])

  const { data: urlMap = {} } = useSignedPhotoUrls(photoPaths)

  function handlePhotoOpen(index: number) {
    const urls = photoPaths.map(p => urlMap[p]).filter(Boolean)
    if (urls.length > 0) onOpenPhoto(urls, index)
  }

  return (
    <article className={[styles.card, isOptimistic ? styles.cardOptimistic : ''].join(' ')}>
      <div className={styles.cardHeader}>
        <div className={styles.avatar} style={{ background: memberColor(colorIndex) }}>
          {name.trim().slice(0, 2).toUpperCase()}
        </div>
        <div className={styles.cardMeta}>
          <span className={styles.memberName}>{name}</span>
          <span className={styles.timestamp}>{relativeTime(moment.created_at)}</span>
        </div>
        {isOwn && !isOptimistic && (
          <div className={styles.cardActions}>
            <button className={styles.actionBtn} onClick={() => onEdit(moment)} aria-label="Modifier">
              <Pencil size={13} strokeWidth={2} />
            </button>
            <button className={styles.actionBtn} onClick={() => onDelete(moment)} aria-label="Supprimer" style={{ color: 'var(--text-muted)' }}>
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      {moment.text && <p className={styles.text}>{moment.text}</p>}

      {photoPaths.length > 0 && (
        <PhotoGrid photoPaths={photoPaths} urlMap={urlMap} onOpen={handlePhotoOpen} />
      )}

      {!isOptimistic && (
        <>
          <div className={styles.reactionsBar}>
            {EMOJIS.map(emoji => {
              const count  = moment.reactions.filter(r => r.emoji === emoji).length
              const active = moment.reactions.some(r => r.emoji === emoji && r.member_id === currentMemberId)
              return (
                <button
                  key={emoji}
                  className={[styles.reactionBtn, active ? styles.reactionBtnActive : ''].join(' ')}
                  onClick={() => toggleReaction.mutate({ momentId: moment.id, emoji })}
                  aria-label={`Réagir avec ${emoji}`}
                >
                  <span>{emoji}</span>
                  {count > 0 && <span className={styles.reactionCount}>{count}</span>}
                </button>
              )
            })}
            <button
              className={[styles.commentToggleBtn, showComments ? styles.commentToggleBtnActive : ''].join(' ')}
              onClick={() => setShowComments(s => !s)}
              aria-label="Commentaires"
            >
              <MessageCircle size={13} strokeWidth={2} />
            </button>
          </div>

          {showComments && (
            <CommentsSection momentId={moment.id} currentMemberId={currentMemberId} />
          )}
        </>
      )}
    </article>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20
const MAX_PHOTOS = 5

export default function MomentsPage() {
  useMomentsRealtime()

  const { data: member }         = useMember()
  const [limit, setLimit]        = useState(PAGE_SIZE)
  const { data: moments = [], isLoading } = useMoments(limit)
  const { data: lastYear = [] }  = useTodayLastYear()
  const addMoment    = useAddMoment()
  const deleteMoment = useDeleteMoment()
  const editText     = useEditMomentText()

  const [showCompose, setShowCompose]       = useState(false)
  const [text, setText]                     = useState('')
  const [photos, setPhotos]                 = useState<File[]>([])
  const [previews, setPreviews]             = useState<string[]>([])
  const [confirmDelete, setConfirmDelete]   = useState<Moment | null>(null)
  const [editTarget, setEditTarget]         = useState<Moment | null>(null)
  const [editDraft, setEditDraft]           = useState('')
  const [lightbox, setLightbox]             = useState<{ urls: string[]; index: number } | null>(null)
  const [showLastYear, setShowLastYear]     = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const remaining = MAX_PHOTOS - photos.length
    const toAdd = files.slice(0, remaining)
    setPhotos(prev => [...prev, ...toAdd])
    toAdd.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => setPreviews(prev => [...prev, ev.target?.result as string])
      reader.readAsDataURL(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removePhoto(idx: number) {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
    setPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  function resetCompose() {
    setText('')
    setPhotos([])
    setPreviews([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() && photos.length === 0) return
    try {
      await addMoment.mutateAsync({ text, photos })
      resetCompose()
      setShowCompose(false)
    } catch { /* onError handles toast */ }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    try {
      await deleteMoment.mutateAsync({
        id: confirmDelete.id,
        photo_path: confirmDelete.photo_path,
        photos: confirmDelete.photos ?? [],
      })
      setConfirmDelete(null)
    } catch { /* onError handles toast */ }
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    try {
      await editText.mutateAsync({ id: editTarget.id, text: editDraft })
      setEditTarget(null)
    } catch { /* onError handles toast */ }
  }

  const canPublish = (text.trim().length > 0 || photos.length > 0) && !addMoment.isPending

  const lastYearDate = format(subYears(new Date(), 1), 'd MMMM yyyy', { locale: fr })

  const deleteHasPhotos = (confirmDelete?.photos?.length ?? 0) > 0 || !!confirmDelete?.photo_path

  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Moments</h1>
        <button className={styles.addBtn} onClick={() => setShowCompose(true)}>
          <Plus size={14} strokeWidth={3} />
          Nouveau
        </button>
      </header>

      {/* Ce jour-là — anniversaire */}
      {lastYear.length > 0 && (
        <div className={styles.lastYearBanner}>
          <button
            className={styles.lastYearToggle}
            onClick={() => setShowLastYear(s => !s)}
          >
            <span className={styles.lastYearIcon}>🗓️</span>
            <span className={styles.lastYearTitle}>Ce jour-là · {lastYearDate}</span>
            <span className={styles.lastYearCount}>{lastYear.length}</span>
          </button>
          {showLastYear && (
            <div className={[styles.feed, styles.feedLastYear].join(' ')}>
              {lastYear.map(m => (
                <MomentCard
                  key={m.id}
                  moment={m}
                  currentMemberId={member?.id ?? ''}
                  onDelete={setConfirmDelete}
                  onEdit={m => { setEditDraft(m.text ?? ''); setEditTarget(m) }}
                  onOpenPhoto={(urls, index) => setLightbox({ urls, index })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Feed */}
      {isLoading ? (
        <div className={styles.skeletonList}>
          {[0, 1, 2].map(i => <div key={i} className={styles.skeletonCard} />)}
        </div>
      ) : moments.length === 0 ? (
        <EmptyState
          emoji="📸"
          title="Aucun moment partagé"
          description="Publiez un texte ou une photo pour commencer."
          action={{ label: 'Publier un moment', onClick: () => setShowCompose(true) }}
        />
      ) : (
        <>
          <div className={styles.feed}>
            {moments.map((m, i) => {
              const prevDate = i > 0 ? momentDateStr(moments[i - 1]) : null
              const currDate = momentDateStr(m)
              const showSep  = prevDate !== currDate
              return (
                <div key={m.id}>
                  {showSep && (
                    <div className={styles.dateSeparator}>{dateSeparatorLabel(m.created_at)}</div>
                  )}
                  <MomentCard
                    moment={m}
                    currentMemberId={member?.id ?? ''}
                    onDelete={setConfirmDelete}
                    onEdit={m => { setEditDraft(m.text ?? ''); setEditTarget(m) }}
                    onOpenPhoto={(urls, index) => setLightbox({ urls, index })}
                  />
                </div>
              )
            })}
          </div>

          {moments.length === limit && (
            <button
              className={styles.loadMoreBtn}
              onClick={() => setLimit(l => l + PAGE_SIZE)}
            >
              Voir {PAGE_SIZE} moments de plus
            </button>
          )}
        </>
      )}

      {/* Lightbox */}
      {lightbox && (
        <Lightbox
          urls={lightbox.urls}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Compose modal */}
      {showCompose && (
        <SlideUpModal onClose={() => { setShowCompose(false); resetCompose() }} title="Nouveau moment">
          <form onSubmit={handleSubmit} className={styles.composeForm}>
            <textarea
              className={styles.composeTextarea}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Partagez un moment avec la famille…"
              rows={4}
              autoFocus
            />
            {previews.length === 0 ? (
              <button type="button" className={styles.photoPickerBtn} onClick={() => fileInputRef.current?.click()}>
                <Camera size={16} strokeWidth={2} />
                Ajouter des photos
              </button>
            ) : (
              <div className={styles.previewGrid}>
                {previews.map((preview, idx) => (
                  <div key={idx} className={styles.previewThumbWrap}>
                    <img src={preview} className={styles.previewThumb} alt="" />
                    <button
                      type="button"
                      className={styles.removePhotoBtn}
                      onClick={() => removePhoto(idx)}
                      aria-label="Retirer la photo"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    className={styles.addMoreBtn}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Ajouter une photo"
                  >
                    <Camera size={18} strokeWidth={2} />
                  </button>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
            <button type="submit" className={styles.publishBtn} disabled={!canPublish}>
              {addMoment.isPending ? 'Publication…' : 'Publier'}
            </button>
          </form>
        </SlideUpModal>
      )}

      {/* Edit caption modal */}
      {editTarget && (
        <SlideUpModal onClose={() => setEditTarget(null)} title="Modifier la légende">
          <form onSubmit={handleEditSubmit} className={styles.composeForm}>
            <textarea
              className={styles.composeTextarea}
              value={editDraft}
              onChange={e => setEditDraft(e.target.value)}
              placeholder="Légende du moment…"
              rows={4}
              autoFocus
            />
            <button type="submit" className={styles.publishBtn} disabled={editText.isPending}>
              {editText.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        </SlideUpModal>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <SlideUpModal onClose={() => setConfirmDelete(null)} title="Supprimer ce moment ?">
          <div className={styles.confirmBody}>
            <p className={styles.confirmText}>
              {deleteHasPhotos
                ? 'Ce moment et ses photos seront supprimés définitivement.'
                : 'Ce moment sera supprimé définitivement.'}
            </p>
            <button className={styles.confirmDeleteBtn} onClick={handleConfirmDelete} disabled={deleteMoment.isPending}>
              {deleteMoment.isPending ? 'Suppression…' : 'Supprimer'}
            </button>
            <button className={styles.cancelBtn} onClick={() => setConfirmDelete(null)}>
              Annuler
            </button>
          </div>
        </SlideUpModal>
      )}

    </div>
  )
}

