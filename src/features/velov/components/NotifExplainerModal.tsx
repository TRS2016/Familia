import ui from './velovUi.module.css'
import styles from './NotifExplainerModal.module.css'

export interface NotifExplainerModalProps {
  onConfirm: () => void
  onDismiss: () => void
}

export function NotifExplainerModal({ onConfirm, onDismiss }: NotifExplainerModalProps) {
  return (
    <div className={styles.overlay} onClick={onDismiss}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <p className={styles.emoji}>🔔</p>
        <h3 className={styles.title}>Activer les notifications ?</h3>
        <p className={styles.body}>
          Recevez une alerte quand vous approchez de votre destination, quand un vélo se libère,
          ou quand votre station préférée se vide.
        </p>
        <div className={styles.actions}>
          <button onClick={onDismiss} className={ui.btnGhost}>Plus tard</button>
          <button onClick={onConfirm} className={ui.btnPrimary}>Activer</button>
        </div>
      </div>
    </div>
  )
}
