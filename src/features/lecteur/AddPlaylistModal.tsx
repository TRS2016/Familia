import { useState } from 'react'
import type { FormEvent } from 'react'
import SlideUpModal from '../../components/SlideUpModal'
import { useAddLecteurPlaylist } from './useLecteur'
import styles from './LecteurPage.module.css'

// Création d'une liste de lecture manuelle.
export default function AddPlaylistModal({ onClose }: { onClose: () => void }) {
  const addPlaylist = useAddLecteurPlaylist()
  const [name, setName] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await addPlaylist.mutateAsync({ name, type: 'manual' })
    onClose()
  }

  return (
    <SlideUpModal title="Nouvelle liste" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label htmlFor="pl-name" className={styles.fieldLabel}>Nom de la liste</label>
          <input id="pl-name" type="text" value={name} autoFocus required
            onChange={e => setName(e.target.value)}
            className={styles.input} placeholder="Musique du soir, Podcasts…" />
        </div>
        <button type="submit" className={styles.submitBtn} disabled={addPlaylist.isPending || !name.trim()}>
          {addPlaylist.isPending ? 'Création…' : 'Créer'}
        </button>
      </form>
    </SlideUpModal>
  )
}
