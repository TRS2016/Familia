import { Plus } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import { useAddToLecteurPlaylist } from './useLecteur'
import type { LecteurPlaylist } from './useLecteur'
import styles from './LecteurPage.module.css'

// Choix d'une liste manuelle à laquelle ajouter un fichier.
export default function AddToPlaylistModal({ mediaFileId, playlists, onClose }: {
  mediaFileId: string
  playlists: LecteurPlaylist[]
  onClose: () => void
}) {
  const addTo = useAddToLecteurPlaylist()

  async function handleAdd(playlistId: string) {
    await addTo.mutateAsync({ playlistId, mediaFileId })
    onClose()
  }

  return (
    <SlideUpModal title="Ajouter à une liste" onClose={onClose}>
      <div className={styles.form}>
        {playlists.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
            Créez d'abord une liste manuelle.
          </p>
        ) : (
          <ul className={styles.playlistPickerList}>
            {playlists.map(pl => (
              <li key={pl.id}>
                <button className={styles.playlistPickerRow}
                  onClick={() => handleAdd(pl.id)} disabled={addTo.isPending}>
                  <span>🎵</span>
                  <span className={styles.playlistPickerName}>{pl.name}</span>
                  <Plus size={14} strokeWidth={2.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SlideUpModal>
  )
}
