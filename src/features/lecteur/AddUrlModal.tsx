import { useState } from 'react'
import type { FormEvent } from 'react'
import SlideUpModal from '../../components/SlideUpModal'
import TagInput from './TagInput'
import { useAddMediaFile } from './useLecteur'
import styles from './LecteurPage.module.css'

// Ajout d'un lien externe (YouTube, Spotify…) à la bibliothèque.
export default function AddUrlModal({ onClose }: { onClose: () => void }) {
  const addFile = useAddMediaFile()
  const [title, setTitle] = useState('')
  const [url,   setUrl]   = useState('')
  const [tags,  setTags]  = useState<string[]>([])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !url.trim()) return
    await addFile.mutateAsync({ title, external_url: url, tags })
    onClose()
  }

  return (
    <SlideUpModal title="Ajouter un lien" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label htmlFor="l-title" className={styles.fieldLabel}>Titre</label>
          <input id="l-title" type="text" value={title} autoFocus required
            onChange={e => setTitle(e.target.value)}
            className={styles.input} placeholder="Ma playlist, Podcast du mois…" />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="l-url" className={styles.fieldLabel}>URL</label>
          <input id="l-url" type="url" value={url} required
            onChange={e => setUrl(e.target.value)}
            className={styles.input} placeholder="https://youtube.com/watch?v=…" />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Tags</label>
          <TagInput tags={tags} onChange={setTags} />
        </div>
        <button type="submit" className={styles.submitBtn} disabled={addFile.isPending || !title.trim() || !url.trim()}>
          {addFile.isPending ? 'Ajout…' : 'Ajouter'}
        </button>
      </form>
    </SlideUpModal>
  )
}
