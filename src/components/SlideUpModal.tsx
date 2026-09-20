import { useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useDialog } from '../lib/useDialog'
import styles from './SlideUpModal.module.css'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

export default function SlideUpModal({ title, onClose, children }: Props) {
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)

  // Échap, verrou du scroll, focus entrant/sortant et piège de tabulation.
  useDialog(modalRef, onClose)

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
