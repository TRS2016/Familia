import { useState, useRef, useMemo, useEffect } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Trash2, Camera, Image as ImageIcon, X, Pencil, MessageCircle, Send, Download, Share2, Pin, Search } from 'lucide-react'
import { format, parseISO, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useMember } from '../../auth/useMember'
import { memberColor } from '../../lib/constants'
import { capitalize } from '../../lib/utils'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import {
  useMoments, useOnThisDay, useSearchMoments, useSignedPhotoUrls, useToggleReaction,
  getMomentPhotoPaths,
  useAddMoment, useDeleteMoment, useEditMomentText,
  useAddPhotoToMoment, useRemovePhotoFromMoment,
  useComments, useAddComment, useDeleteComment, useTogglePin,
  EMOJIS, EMOJI_PICKER,
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

// Couleur stable par membre (id → palette) : avatar et chips de filtre cohérents.
function colorForMember(id: string): string {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return memberColor(sum)
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

const canWebShare = typeof navigator !== 'undefined' && 'share' in navigator

async function fetchAsFile(url: string, name: string): Promise<File> {
  const blob = await fetch(url).then(r => r.blob())
  const ext  = blob.type.split('/')[1] || 'jpg'
  return new File([blob], `${name}.${ext}`, { type: blob.type })
}

async function downloadBlob(blob: Blob, name: string) {
  const blobUrl = URL.createObjectURL(blob)
  const a       = document.createElement('a')
  a.href        = blobUrl
  a.download    = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

function Lightbox({ urls, initialIndex, onClose, onOpenAlbumShare }: {
  urls: string[]
  initialIndex: number
  onClose: () => void
  onOpenAlbumShare: (urls: string[]) => void
}) {
  const [index, setIndex]                   = useState(initialIndex)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [zoomed, setZoomed]                 = useState(false)
  const touchStartXRef = useRef<number | null>(null)
  const lastTapRef     = useRef(0)
  const url = urls[index]

  function navigate(newIndex: number) {
    setIndex(newIndex)
    setZoomed(false)
  }

  // Verrou du scroll de fond tant que la lightbox est ouverte.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Navigation clavier (desktop) : ←/→ pour changer de photo, Échap pour fermer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') { setIndex(i => Math.min(urls.length - 1, i + 1)); setZoomed(false) }
      else if (e.key === 'ArrowLeft')  { setIndex(i => Math.max(0, i - 1)); setZoomed(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [urls.length, onClose])

  function handleTouchStart(e: React.TouchEvent) {
    if (zoomed) return
    touchStartXRef.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (zoomed || touchStartXRef.current === null) return
    const dx = touchStartXRef.current - e.changedTouches[0].clientX
    touchStartXRef.current = null
    if (Math.abs(dx) < 50) return
    if (dx > 0 && index < urls.length - 1) navigate(index + 1)
    if (dx < 0 && index > 0) navigate(index - 1)
  }

  function handleImgClick(e: React.MouseEvent) {
    e.stopPropagation()
    const now = Date.now()
    if (now - lastTapRef.current < 300) setZoomed(z => !z)
    lastTapRef.current = now
  }

  async function handleDownloadOne() {
    try {
      const blob = await fetch(url).then(r => r.blob())
      await downloadBlob(blob, `photo-${index + 1}.jpg`)
    } catch (err) { console.error('Download photo failed:', err) }
  }

  async function handleShareOne() {
    if (!canWebShare) return
    try {
      const file = await fetchAsFile(url, `photo-${index + 1}`)
      await navigator.share({ files: [file] })
    } catch { /* user cancelled or not supported */ }
  }

  async function handleDownloadAll() {
    setDownloadingAll(true)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      await Promise.all(urls.map(async (u, i) => {
        const blob = await fetch(u).then(r => r.blob())
        const ext  = blob.type.split('/')[1] || 'jpg'
        zip.file(`photo-${i + 1}.${ext}`, blob)
      }))
      const content = await zip.generateAsync({ type: 'blob' })
      await downloadBlob(content, `album-${Date.now()}.zip`)
    } catch (err) { console.error('ZIP download failed:', err) }
    setDownloadingAll(false)
  }

  return (
    <div
      className={styles.lightbox}
      onClick={zoomed ? undefined : onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <img
        src={url}
        className={[styles.lightboxImg, zoomed ? styles.lightboxImgZoomed : ''].join(' ')}
        alt=""
        onClick={handleImgClick}
      />

      {/* Top-right: close */}
      <button className={styles.lightboxClose} onClick={onClose} aria-label="Fermer">
        <X size={18} strokeWidth={2.5} />
      </button>

      {/* Top-left: download + share — masqué quand zoomé */}
      {!zoomed && (
        <div className={styles.lightboxTopLeft} onClick={e => e.stopPropagation()}>
          <button className={styles.lightboxIconBtn} onClick={handleDownloadOne} aria-label="Télécharger">
            <Download size={16} strokeWidth={2.5} />
          </button>
          {canWebShare && (
            <button className={styles.lightboxIconBtn} onClick={handleShareOne} aria-label="Partager">
              <Share2 size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}

      {/* Navigation prev/next + barre album — masqués quand zoomé */}
      {!zoomed && urls.length > 1 && (
        <>
          {index > 0 && (
            <button className={styles.lightboxNavPrev}
              onClick={e => { e.stopPropagation(); navigate(index - 1) }}
              aria-label="Photo précédente">
              <ChevronLeft size={22} strokeWidth={2.5} />
            </button>
          )}
          {index < urls.length - 1 && (
            <button className={styles.lightboxNavNext}
              onClick={e => { e.stopPropagation(); navigate(index + 1) }}
              aria-label="Photo suivante">
              <ChevronRight size={22} strokeWidth={2.5} />
            </button>
          )}

          <div className={styles.lightboxAlbumBar} onClick={e => e.stopPropagation()}>
            {canWebShare && (
              <button className={styles.lightboxAlbumBtn}
                onClick={() => { onClose(); onOpenAlbumShare(urls) }}>
                <Share2 size={13} strokeWidth={2} /> Partager l'album
              </button>
            )}
            <span className={styles.lightboxBarCounter}>{index + 1} / {urls.length}</span>
            <button className={styles.lightboxAlbumBtn}
              onClick={handleDownloadAll}
              disabled={downloadingAll}>
              <Download size={13} strokeWidth={2} />
              {downloadingAll ? '…' : 'Télécharger'}
            </button>
          </div>
        </>
      )}

      {/* Indication zoom — disparaît après le premier zoom */}
      {!zoomed && (
        <span className={styles.lightboxZoomHint}>Double-tap pour zoomer</span>
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

// ── AlbumShareModal ───────────────────────────────────────────────────────────

function AlbumShareModal({ urls, onClose }: { urls: string[]; onClose: () => void }) {
  const [selected, setSelected] = useState(() => new Set(urls.map((_, i) => i)))
  const [sharing, setSharing]   = useState(false)

  function toggle(i: number) {
    setSelected(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  }

  const allSelected = selected.size === urls.length
  const count       = selected.size

  async function handleShare() {
    if (count === 0) return
    setSharing(true)
    try {
      const files = await Promise.all(
        urls
          .filter((_, i) => selected.has(i))
          .map((url, i) => fetchAsFile(url, `photo-${i + 1}`))
      )
      await navigator.share({ files })
    } catch { /* user cancelled */ }
    setSharing(false)
  }

  return (
    <SlideUpModal title="Partager l'album" onClose={onClose}>
      <div className={styles.albumShareBody}>
        <div className={styles.albumGrid}>
          {urls.map((url, i) => (
            <button
              key={i}
              type="button"
              className={[styles.albumThumb, !selected.has(i) ? styles.albumThumbOff : ''].join(' ')}
              onClick={() => toggle(i)}
              aria-label={selected.has(i) ? 'Désélectionner' : 'Sélectionner'}
            >
              <img src={url} className={styles.albumThumbImg} alt="" loading="lazy" />
              <div className={styles.albumThumbOverlay}>
                {selected.has(i)
                  ? <span className={styles.albumThumbCheck}>✓</span>
                  : <X size={14} strokeWidth={2.5} className={styles.albumThumbX} />}
              </div>
            </button>
          ))}
        </div>

        <button
          type="button"
          className={styles.albumSelectAllBtn}
          onClick={() => setSelected(allSelected ? new Set() : new Set(urls.map((_, i) => i)))}
        >
          {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </button>

        <button
          type="button"
          className={styles.publishBtn}
          disabled={count === 0 || sharing}
          onClick={handleShare}
        >
          {sharing ? 'Préparation…' : `Partager ${count} photo${count > 1 ? 's' : ''}`}
        </button>
      </div>
    </SlideUpModal>
  )
}

// ── EditMomentModal ───────────────────────────────────────────────────────────

function EditMomentModal({ moment, onClose }: { moment: Moment; onClose: () => void }) {
  const [caption, setCaption] = useState(moment.text ?? '')
  const editText    = useEditMomentText()
  const addPhoto    = useAddPhotoToMoment()
  const removePhoto = useRemovePhotoFromMoment()
  const cameraRef   = useRef<HTMLInputElement>(null)
  const fileRef     = useRef<HTMLInputElement>(null)

  const currentPhotos = useMemo(
    () => (moment.photos ?? []).slice().sort((a, b) => a.position - b.position),
    [moment.photos],
  )
  const photoPaths = useMemo(() => currentPhotos.map(p => p.photo_path), [currentPhotos])
  const { data: urlMap = {} } = useSignedPhotoUrls(photoPaths)

  const nextPosition = currentPhotos.length > 0 ? Math.max(...currentPhotos.map(p => p.position)) + 1 : 0
  const canAddMore   = currentPhotos.length < MAX_PHOTOS

  function handlePhotoSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    addPhoto.mutate({ momentId: moment.id, file, nextPosition })
    if (e.target) e.target.value = ''
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    try {
      await editText.mutateAsync({ id: moment.id, text: caption })
      onClose()
    } catch { /* onError handles toast */ }
  }

  return (
    <SlideUpModal onClose={onClose} title="Modifier le moment">
      <form onSubmit={handleSave} className={styles.composeForm}>
        <textarea
          className={styles.composeTextarea}
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Légende du moment…"
          rows={3}
          autoFocus
        />

        {/* ── Photos ── */}
        {(currentPhotos.length > 0 || addPhoto.isPending) ? (
          <div className={styles.previewGrid}>
            {currentPhotos.map(photo => (
              <div key={photo.id} className={styles.previewThumbWrap}>
                {urlMap[photo.photo_path]
                  ? <img src={urlMap[photo.photo_path]} className={styles.previewThumb} alt="" />
                  : <div className={styles.previewThumbSkeleton} />}
                <button
                  type="button"
                  className={styles.removePhotoBtn}
                  onClick={() => removePhoto.mutate({ photoId: photo.id, momentId: moment.id, photoPath: photo.photo_path })}
                  disabled={removePhoto.isPending}
                  aria-label="Retirer"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            ))}
            {addPhoto.isPending && <div className={[styles.previewThumbWrap, styles.previewThumbSkeleton].join(' ')} />}
            {canAddMore && !addPhoto.isPending && (
              <>
                <button type="button" className={styles.addMoreBtn} onClick={() => cameraRef.current?.click()} aria-label="Photo">
                  <Camera size={18} strokeWidth={2} />
                </button>
                <button type="button" className={styles.addMoreBtn} onClick={() => fileRef.current?.click()} aria-label="Galerie">
                  <ImageIcon size={18} strokeWidth={2} />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className={styles.photoPickerRow}>
            <button type="button" className={styles.photoPickerBtn} onClick={() => cameraRef.current?.click()}>
              <Camera size={16} strokeWidth={2} /> Appareil photo
            </button>
            <button type="button" className={styles.photoPickerBtn} onClick={() => fileRef.current?.click()}>
              <ImageIcon size={16} strokeWidth={2} /> Galerie
            </button>
          </div>
        )}

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoSelect} />
        <input ref={fileRef}   type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoSelect} />

        <button type="submit" className={styles.publishBtn} disabled={editText.isPending}>
          {editText.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </SlideUpModal>
  )
}

// ── MomentCard ────────────────────────────────────────────────────────────────

function MomentCard({ moment, currentMemberId, memberMap, urlMap, onDelete, onEdit, onOpenPhoto }: {
  moment: Moment
  currentMemberId: string
  memberMap: Record<string, string>
  urlMap: Record<string, string>
  onDelete: (m: Moment) => void
  onEdit: (m: Moment) => void
  onOpenPhoto: (urls: string[], index: number) => void
}) {
  const toggleReaction = useToggleReaction()
  const togglePin = useTogglePin()
  const [showComments, setShowComments] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  // Emojis affichés : les 4 rapides + tout emoji déjà utilisé sur ce moment.
  const shownEmojis = useMemo(() => {
    const list: string[] = [...EMOJIS]
    for (const r of moment.reactions) if (!list.includes(r.emoji)) list.push(r.emoji)
    return list
  }, [moment.reactions])
  const isOwn        = moment.member_id === currentMemberId
  const isOptimistic = moment.id.startsWith('optimistic-')
  const name         = moment.member?.display_name ?? '?'

  const photoPaths = useMemo(() => getMomentPhotoPaths(moment), [moment])

  function handlePhotoOpen(index: number) {
    const urls = photoPaths.map(p => urlMap[p]).filter(Boolean)
    if (urls.length > 0) onOpenPhoto(urls, index)
  }

  return (
    <article className={[styles.card, isOptimistic ? styles.cardOptimistic : ''].join(' ')}>
      <div className={styles.cardHeader}>
        <div className={styles.avatar} style={{ background: colorForMember(moment.member_id) }}>
          {name.trim().slice(0, 2).toUpperCase()}
        </div>
        <div className={styles.cardMeta}>
          <span className={styles.memberName}>{name}</span>
          <span className={styles.timestamp}>{relativeTime(moment.created_at)}</span>
        </div>
        {!isOptimistic && (
          <div className={styles.cardActions}>
            <button
              className={styles.actionBtn}
              onClick={() => togglePin.mutate({ id: moment.id, pinned: !moment.pinned })}
              aria-label={moment.pinned ? 'Désépingler' : 'Épingler'}
              aria-pressed={moment.pinned}
            >
              <Pin size={13} strokeWidth={2} style={moment.pinned ? { color: 'var(--accent)', fill: 'currentColor' } : undefined} />
            </button>
            {isOwn && (
              <>
                <button className={styles.actionBtn} onClick={() => onEdit(moment)} aria-label="Modifier">
                  <Pencil size={13} strokeWidth={2} />
                </button>
                <button className={styles.actionBtn} onClick={() => onDelete(moment)} aria-label="Supprimer" style={{ color: 'var(--text-muted)' }}>
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </>
            )}
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
            {shownEmojis.map(emoji => {
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
            <div className={styles.reactionPickerWrap}>
              <button
                className={[styles.reactionAddBtn, showPicker ? styles.reactionBtnActive : ''].join(' ')}
                onClick={() => setShowPicker(p => !p)}
                aria-label="Plus de réactions"
                aria-expanded={showPicker}
              >
                <Plus size={13} strokeWidth={2.5} />
              </button>
              {showPicker && (
                <div className={styles.reactionPicker}>
                  {EMOJI_PICKER.map(emoji => (
                    <button
                      key={emoji}
                      className={styles.reactionPickerItem}
                      onClick={() => { toggleReaction.mutate({ momentId: moment.id, emoji }); setShowPicker(false) }}
                      aria-label={`Réagir avec ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className={[styles.commentToggleBtn, showComments ? styles.commentToggleBtnActive : ''].join(' ')}
              onClick={() => setShowComments(s => !s)}
              aria-label="Commentaires"
            >
              <MessageCircle size={13} strokeWidth={2} />
            </button>
          </div>

          {/* Noms des personnes qui ont réagi */}
          {moment.reactions.length > 0 && (() => {
            const parts = shownEmojis
              .filter(e => moment.reactions.some(r => r.emoji === e))
              .map(e => {
                const names = moment.reactions
                  .filter(r => r.emoji === e)
                  .map(r => r.member_id === currentMemberId ? 'Vous' : (memberMap[r.member_id] ?? '?'))
                return `${e} ${names.join(', ')}`
              })
            return <p className={styles.reactorLine}>{parts.join('  ·  ')}</p>
          })()}

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
const MAX_PHOTOS = 10

export default function MomentsPage() {
  useMomentsRealtime()

  const { data: member }         = useMember()
  const [limit, setLimit]        = useState(PAGE_SIZE)
  const { data: moments = [], isLoading } = useMoments(limit)
  const { data: onThisDay = [] } = useOnThisDay()
  const addMoment    = useAddMoment()
  const deleteMoment = useDeleteMoment()

  const [showCompose, setShowCompose]       = useState(false)
  const [text, setText]                     = useState('')
  const [photos, setPhotos]                 = useState<File[]>([])
  const [previews, setPreviews]             = useState<string[]>([])
  const [confirmDelete, setConfirmDelete]   = useState<Moment | null>(null)
  const [editTargetId, setEditTargetId]     = useState<string | null>(null)
  const [lightbox, setLightbox]             = useState<{ urls: string[]; index: number } | null>(null)
  const [albumShare, setAlbumShare]         = useState<string[] | null>(null)
  const [showLastYear, setShowLastYear]     = useState(true)
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null)
  const [search, setSearch]                 = useState('')
  const [month, setMonth]                   = useState('')
  const searchActive = search.trim().length >= 2 || !!month
  const { data: searchResults = [], isLoading: searchLoading } = useSearchMoments(search, month)

  // live version derived from cache — updates as photos are added/removed
  const editTarget = editTargetId
    ? ([...moments, ...onThisDay, ...searchResults].find(m => m.id === editTargetId) ?? null)
    : null
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const feedAuthors = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of moments) {
      if (m.member) seen.set(m.member.id, m.member.display_name)
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [moments])

  const memberMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const m of [...moments, ...onThisDay, ...searchResults]) {
      if (m.member) map[m.member.id] = m.member.display_name
    }
    return map
  }, [moments, onThisDay, searchResults])

  // « Ce jour-là » regroupé par année (la plus récente d'abord).
  const onThisDayGroups = useMemo(() => {
    const byYear = new Map<number, Moment[]>()
    for (const m of onThisDay) {
      const y = new Date(m.created_at).getFullYear()
      const arr = byYear.get(y) ?? []
      arr.push(m)
      byYear.set(y, arr)
    }
    return [...byYear.entries()].sort((a, b) => b[0] - a[0])
  }, [onThisDay])

  const displayMoments = useMemo(
    () => filterMemberId ? moments.filter(m => m.member_id === filterMemberId) : moments,
    [moments, filterMemberId],
  )
  // Épinglés en section dédiée ; le reste en feed chronologique (sépare proprement
  // les séparateurs de date d'un favori ancien remonté en tête).
  const pinnedMoments = useMemo(() => displayMoments.filter(m => m.pinned), [displayMoments])
  const feedMoments   = useMemo(() => displayMoments.filter(m => !m.pinned), [displayMoments])

  // Signed URLs batchées pour toute la galerie (1 appel au lieu d'un par carte).
  const allPhotoPaths = useMemo(() => {
    const set = new Set<string>()
    for (const m of [...displayMoments, ...onThisDay, ...searchResults]) {
      for (const p of getMomentPhotoPaths(m)) set.add(p)
    }
    return [...set]
  }, [displayMoments, onThisDay, searchResults])
  const { data: urlMap = {} } = useSignedPhotoUrls(allPhotoPaths)

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
    if (fileInputRef.current)   fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() && photos.length === 0) return
    try {
      await addMoment.mutateAsync({ text, photos })
      resetCompose()
      setShowCompose(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
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

  const canPublish = (text.trim().length > 0 || photos.length > 0) && !addMoment.isPending

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

      {/* Filtre par membre */}
      {feedAuthors.length > 1 && (
        <div className={styles.memberFilter}>
          <button
            className={[styles.memberFilterChip, !filterMemberId ? styles.memberFilterChipActive : ''].join(' ')}
            onClick={() => setFilterMemberId(null)}
          >
            Tous
          </button>
          {feedAuthors.map(a => {
            const active = filterMemberId === a.id
            const color  = colorForMember(a.id)
            return (
              <button
                key={a.id}
                className={[styles.memberFilterChip, active ? styles.memberFilterChipActive : ''].join(' ')}
                style={active ? { borderColor: color, background: `${color}18`, color } : {}}
                onClick={() => setFilterMemberId(id => id === a.id ? null : a.id)}
              >
                {a.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Recherche / filtre */}
      <div className={styles.searchRow}>
        <div className={styles.searchInputWrap}>
          <Search size={15} strokeWidth={2} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.searchInput}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher dans les légendes…"
            aria-label="Rechercher"
          />
        </div>
        <input
          type="month"
          className={styles.searchMonth}
          value={month}
          onChange={e => setMonth(e.target.value)}
          aria-label="Filtrer par mois"
        />
        {searchActive && (
          <button className={styles.searchClear} onClick={() => { setSearch(''); setMonth('') }} aria-label="Effacer la recherche">
            <X size={15} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Résultats de recherche (remplacent le feed) */}
      {searchActive ? (
        searchLoading ? (
          <div className={styles.skeletonList}>{[0, 1].map(i => <div key={i} className={styles.skeletonCard} />)}</div>
        ) : searchResults.length === 0 ? (
          <EmptyState emoji="🔎" title="Aucun résultat" description="Essaie d'autres mots ou un autre mois." />
        ) : (
          <div className={styles.feed}>
            {searchResults.map(m => (
              <MomentCard
                key={m.id}
                moment={m}
                currentMemberId={member?.id ?? ''}
                memberMap={memberMap}
                urlMap={urlMap}
                onDelete={setConfirmDelete}
                onEdit={m => setEditTargetId(m.id)}
                onOpenPhoto={(urls, index) => setLightbox({ urls, index })}
              />
            ))}
          </div>
        )
      ) : (<>

      {/* Ce jour-là — souvenirs des années passées (regroupés par année) */}
      {onThisDay.length > 0 && (
        <div className={styles.lastYearBanner}>
          <button
            className={styles.lastYearToggle}
            onClick={() => setShowLastYear(s => !s)}
          >
            <span className={styles.lastYearIcon}>🗓️</span>
            <span className={styles.lastYearTitle}>Ce jour-là</span>
            <span className={styles.lastYearCount}>{onThisDay.length}</span>
          </button>
          {showLastYear && onThisDayGroups.map(([year, items]) => {
            const yearsAgo = new Date().getFullYear() - year
            return (
              <div key={year}>
                <div className={styles.onThisDayYear}>
                  Il y a {yearsAgo} an{yearsAgo > 1 ? 's' : ''} · {year}
                </div>
                <div className={[styles.feed, styles.feedLastYear].join(' ')}>
                  {items.map(m => (
                    <MomentCard
                      key={m.id}
                      moment={m}
                      currentMemberId={member?.id ?? ''}
                      memberMap={memberMap}
                      urlMap={urlMap}
                      onDelete={setConfirmDelete}
                      onEdit={m => setEditTargetId(m.id)}
                      onOpenPhoto={(urls, index) => setLightbox({ urls, index })}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Épinglés */}
      {pinnedMoments.length > 0 && (
        <div className={styles.pinnedSection}>
          <div className={styles.pinnedHeader}>
            <Pin size={13} strokeWidth={2.5} /> Épinglés
          </div>
          <div className={styles.feed}>
            {pinnedMoments.map(m => (
              <MomentCard
                key={m.id}
                moment={m}
                currentMemberId={member?.id ?? ''}
                memberMap={memberMap}
                urlMap={urlMap}
                onDelete={setConfirmDelete}
                onEdit={m => setEditTargetId(m.id)}
                onOpenPhoto={(urls, index) => setLightbox({ urls, index })}
              />
            ))}
          </div>
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
            {feedMoments.map((m, i) => {
              const prevDate = i > 0 ? momentDateStr(feedMoments[i - 1]) : null
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
                    memberMap={memberMap}
                    urlMap={urlMap}
                    onDelete={setConfirmDelete}
                    onEdit={m => setEditTargetId(m.id)}
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
      </>)}

      {/* Lightbox */}
      {lightbox && (
        <Lightbox
          urls={lightbox.urls}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onOpenAlbumShare={urls => setAlbumShare(urls)}
        />
      )}

      {/* Album share */}
      {albumShare && (
        <AlbumShareModal urls={albumShare} onClose={() => setAlbumShare(null)} />
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
              <div className={styles.photoPickerRow}>
                <button type="button" className={styles.photoPickerBtn} onClick={() => cameraInputRef.current?.click()}>
                  <Camera size={16} strokeWidth={2} />
                  Appareil photo
                </button>
                <button type="button" className={styles.photoPickerBtn} onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon size={16} strokeWidth={2} />
                  Galerie
                </button>
              </div>
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
                  <>
                    <button
                      type="button"
                      className={styles.addMoreBtn}
                      onClick={() => cameraInputRef.current?.click()}
                      aria-label="Prendre une photo"
                    >
                      <Camera size={18} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className={styles.addMoreBtn}
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Ajouter depuis la galerie"
                    >
                      <ImageIcon size={18} strokeWidth={2} />
                    </button>
                  </>
                )}
              </div>
            )}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
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

      {/* FAB */}
      {!showCompose && (
        <button
          className={styles.fab}
          onClick={() => setShowCompose(true)}
          aria-label="Nouveau moment"
        >
          <Camera size={22} strokeWidth={2.5} />
        </button>
      )}

      {editTarget && (
        <EditMomentModal
          moment={editTarget}
          onClose={() => setEditTargetId(null)}
        />
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

