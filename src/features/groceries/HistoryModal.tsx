import SlideUpModal from '../../components/SlideUpModal'
import { formatPrice, formatSessionDate } from './groceries.utils'
import styles from './GroceriesPage.module.css'

export type SessionStats = {
  thisMonthCount: number
  totalThisMonth: number
  avg: number | null
  top3: string[]
}

// Historique des sessions archivées + stats budget.
export default function HistoryModal({ sessions, isLoading, stats, onClose }: {
  sessions: { id: string; created_at: string; total: number | null; item_count: number; done_by_member: { display_name: string } | null }[]
  isLoading: boolean
  stats: SessionStats | null
  onClose: () => void
}) {
  return (
    <SlideUpModal title="Historique des courses" onClose={onClose}>
      <div className={styles.historyBody}>
        {isLoading ? (
          <p className={styles.historyEmpty}>Chargement…</p>
        ) : sessions.length === 0 ? (
          <p className={styles.historyEmpty}>Aucune session archivée pour l'instant.</p>
        ) : (
          <>
            {stats && (
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{stats.thisMonthCount}</span>
                  <span className={styles.statLabel}>sessions ce mois</span>
                </div>
                {stats.totalThisMonth > 0 && (
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>{formatPrice(stats.totalThisMonth)}</span>
                    <span className={styles.statLabel}>dépensés ce mois</span>
                  </div>
                )}
                {stats.avg !== null && (
                  <div className={styles.statCard}>
                    <span className={styles.statValue}>{formatPrice(stats.avg)}</span>
                    <span className={styles.statLabel}>moy. / session</span>
                  </div>
                )}
                {stats.top3.length > 0 && (
                  <div className={[styles.statCard, styles.statCardWide].join(' ')}>
                    <span className={styles.statLabel}>Articles fréquents</span>
                    <span className={styles.statTopItems}>{stats.top3.join(' · ')}</span>
                  </div>
                )}
              </div>
            )}
            <ul className={styles.historyList}>
              {sessions.map(s => (
                <li key={s.id} className={styles.historyItem}>
                  <div className={styles.historyItemLeft}>
                    <span className={styles.historyDate}>{formatSessionDate(s.created_at)}</span>
                    {s.done_by_member && (
                      <span className={styles.historyMember}>{s.done_by_member.display_name}</span>
                    )}
                  </div>
                  <div className={styles.historyItemRight}>
                    <span className={styles.historyCount}>{s.item_count} art.</span>
                    {s.total !== null && (
                      <span className={styles.historyTotal}>{formatPrice(s.total)}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </SlideUpModal>
  )
}
