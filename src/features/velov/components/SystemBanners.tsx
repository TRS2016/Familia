import styles from './SystemBanners.module.css'

// Familia gère déjà hors-ligne (OfflineBanner), installation PWA et mise à jour SW
// (UpdatePrompt) au niveau app. Ne reste que l'info spécifique à la feature :
// les données GBFS affichées proviennent du cache.
export interface SystemBannersProps {
  isFromCache: boolean
}

export function SystemBanners({ isFromCache }: SystemBannersProps) {
  if (!isFromCache) return null
  return (
    <div role="status" className={styles.cache}>
      Données en cache — rechargement en cours...
    </div>
  )
}
