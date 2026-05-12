import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import styles from './SlideUpModal.module.css'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

export default function SlideUpModal({ title, onClose, children }: Props) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.dragHandle} />
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
