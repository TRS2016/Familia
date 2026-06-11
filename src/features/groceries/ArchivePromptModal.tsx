import SlideUpModal from '../../components/SlideUpModal'
import { formatPrice } from './groceries.utils'
import styles from './GroceriesPage.module.css'

// Fin de courses : archive la session (historique + pont Kakebo) puis vide
// les articles cochés, ou vide sans enregistrer.
export default function ArchivePromptModal({ checkedCount, total, isPending, addToKakebo, onToggleKakebo, onClose, onSave, onSkip }: {
  checkedCount: number
  total: number
  isPending: boolean
  addToKakebo: boolean
  onToggleKakebo: () => void
  onClose: () => void
  onSave: () => void
  onSkip: () => void
}) {
  return (
    <SlideUpModal title="Courses terminées ?" onClose={onClose}>
      <div className={styles.archivePromptBody}>
        <p className={styles.archivePromptSummary}>
          🛒 <strong>{checkedCount}</strong> article{checkedCount > 1 ? 's' : ''} pris
          {total > 0 && <> · <strong>{formatPrice(total)}</strong></>}
        </p>
        <p className={styles.archivePromptHint}>
          Les articles cochés seront retirés de la liste.
        </p>
        {total > 0 && (
          <label className={styles.kakeboBridgeRow}>
            <input type="checkbox" checked={addToKakebo} onChange={onToggleKakebo} />
            <span>Ajouter {formatPrice(total)} aux dépenses du foyer (Kakebo)</span>
          </label>
        )}
        <button className={styles.archiveBtn} onClick={onSave} disabled={isPending}>
          {isPending ? 'Archivage…' : 'Archiver et terminer'}
        </button>
        <button className={styles.archiveSkipBtn} onClick={onSkip} disabled={isPending}>
          Terminer sans enregistrer
        </button>
      </div>
    </SlideUpModal>
  )
}
