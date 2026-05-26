import { useState, useRef } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Camera, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useMember } from '../../auth/useMember'
import { memberColor } from '../../lib/constants'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import { useMoments, useAddMoment, useDeleteMoment, useSignedPhotoUrl } from './useMoments'
import { useMomentsRealtime } from './useMomentsRealtime'
import type { Moment } from './useMoments'
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

// ── Sub-components ────────────────────────────────────────────────────────────

function MomentPhoto({ path }: { path: string }) {
  const { data: url, isLoading } = useSignedPhotoUrl(path)
  if (isLoading) return <div className={styles.photoSkeleton} />
  if (!url)      return null
  return <img src={url} className={styles.photo} alt="" loading="lazy" />
}

function MomentCard({ moment, currentMemberId, onDelete }: {
  moment: Moment
  currentMemberId: string
  onDelete: (m: Moment) => void
}) {
  const isOwn        = moment.member_id === currentMemberId
  const isOptimistic = moment.id.startsWith('optimistic-')
  const name         = moment.member?.display_name ?? '?'
  const colorIndex   = name.charCodeAt(0) % 4

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
          <button
            className={styles.deleteBtn}
            onClick={() => onDelete(moment)}
            aria-label="Supprimer ce moment"
          >
            <Trash2 size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      {moment.text && (
        <p className={styles.text}>{moment.text}</p>
      )}

      {moment.photo_path && !moment.photo_archived && (
        <MomentPhoto path={moment.photo_path} />
      )}
    </article>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MomentsPage() {
  useMomentsRealtime()

  const { data: member }           = useMember()
  const { data: moments = [], isLoading } = useMoments()
  const addMoment    = useAddMoment()
  const deleteMoment = useDeleteMoment()

  const [showCompose, setShowCompose]       = useState(false)
  const [text, setText]                     = useState('')
  const [photo, setPhoto]                   = useState<File | null>(null)
  const [photoPreview, setPhotoPreview]     = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete]   = useState<Moment | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (!file) return
    setPhoto(file)
    const reader = new FileReader()
    reader.onload = ev => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function resetCompose() {
    setText('')
    setPhoto(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() && !photo) return
    await addMoment.mutateAsync({ text, photo })
    resetCompose()
    setShowCompose(false)
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    await deleteMoment.mutateAsync({ id: confirmDelete.id, photo_path: confirmDelete.photo_path })
    setConfirmDelete(null)
  }

  const canPublish = (text.trim().length > 0 || !!photo) && !addMoment.isPending

  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <Link to="/" className={styles.backLink}>
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Moments</h1>
        <button className={styles.addBtn} onClick={() => setShowCompose(true)}>
          <Plus size={14} strokeWidth={3} />
          Nouveau
        </button>
      </header>

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
        <div className={styles.feed}>
          {moments.map(m => (
            <MomentCard
              key={m.id}
              moment={m}
              currentMemberId={member?.id ?? ''}
              onDelete={setConfirmDelete}
            />
          ))}
        </div>
      )}

      {/* Compose modal */}
      {showCompose && (
        <SlideUpModal
          onClose={() => { setShowCompose(false); resetCompose() }}
          title="Nouveau moment"
        >
          <form onSubmit={handleSubmit} className={styles.composeForm}>
            <textarea
              className={styles.composeTextarea}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Partagez un moment avec la famille…"
              rows={4}
              autoFocus
            />

            {photoPreview ? (
              <div className={styles.photoPreviewWrap}>
                <img src={photoPreview} className={styles.photoPreview} alt="Aperçu" />
                <button
                  type="button"
                  className={styles.removePhotoBtn}
                  onClick={() => {
                    setPhoto(null)
                    setPhotoPreview(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  aria-label="Supprimer la photo"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.photoPickerBtn}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={16} strokeWidth={2} />
                Ajouter une photo
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />

            <button type="submit" className={styles.publishBtn} disabled={!canPublish}>
              {addMoment.isPending ? 'Publication…' : 'Publier'}
            </button>
          </form>
        </SlideUpModal>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <SlideUpModal
          onClose={() => setConfirmDelete(null)}
          title="Supprimer ce moment ?"
        >
          <div className={styles.confirmBody}>
            <p className={styles.confirmText}>
              {confirmDelete.photo_path
                ? 'Ce moment et sa photo seront supprimés définitivement.'
                : 'Ce moment sera supprimé définitivement.'}
            </p>
            <button
              className={styles.confirmDeleteBtn}
              onClick={handleConfirmDelete}
              disabled={deleteMoment.isPending}
            >
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
