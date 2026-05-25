import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import styles from './UpdatePrompt.module.css'

export function UpdatePrompt() {
  const [visible, setVisible] = useState(false)

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {
      setVisible(true)
    },
  })

  if (!needRefresh || !visible) return null

  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>Nouvelle version disponible</span>
      <div className={styles.actions}>
        <button className={styles.btnLater} onClick={() => setVisible(false)}>
          Plus tard
        </button>
        <button className={styles.btnReload} onClick={() => void updateServiceWorker(true)}>
          Recharger
        </button>
      </div>
    </div>
  )
}
