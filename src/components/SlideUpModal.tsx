import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './SlideUpModal.module.css'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

export default function SlideUpModal({ title, onClose, children }: Props) {
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)

  // Garde une réf. à jour de onClose sans relancer l'effet de montage à chaque
  // render (sinon le focus initial volerait le focus des champs à chaque frappe).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Fermeture clavier (Échap) + verrou du scroll de la page sous la modale.
  // Effet exécuté une seule fois au montage.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Déplace le focus dans la modale pour la navigation clavier / lecteurs d'écran.
    modalRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={modalRef}
        className={styles.modal}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.dragHandle} />
        <div className={styles.modalHeader}>
          <h2 id={titleId} className={styles.modalTitle}>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
