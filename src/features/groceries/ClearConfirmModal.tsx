import SlideUpModal from '../../components/SlideUpModal'
import styles from './GroceriesPage.module.css'

// Confirmation avant suppression définitive des articles cochés.
export default function ClearConfirmModal({ count, isPending, onClose, onConfirm }: {
  count: number
  isPending: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <SlideUpModal title="Effacer les articles cochés ?" onClose={onClose}>
      <div className={styles.archivePromptBody}>
        <p className={styles.archivePromptSummary}>
          🗑 <strong>{count}</strong> article{count > 1 ? 's' : ''} coché{count > 1 ? 's' : ''} seront supprimés définitivement.
        </p>
        <button className={styles.archiveBtn} style={{ background: 'var(--danger)' }} onClick={onConfirm} disabled={isPending}>
          Supprimer
        </button>
        <button className={styles.archiveSkipBtn} onClick={onClose}>Annuler</button>
      </div>
    </SlideUpModal>
  )
}
