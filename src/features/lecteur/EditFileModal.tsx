import { useState } from 'react'
import type { FormEvent } from 'react'
import SlideUpModal from '../../components/SlideUpModal'
import TagInput from './TagInput'
import { useEditMediaFile } from './useLecteur'
import type { MediaFile } from './useLecteur'
import styles from './LecteurPage.module.css'

// Édition du titre et des tags d'un fichier.
export default function EditFileModal({ file, onClose }: { file: MediaFile; onClose: () => void }) {
  const editFile = useEditMediaFile()
  const [title, setTitle] = useState(file.title)
  const [tags,  setTags]  = useState<string[]>(file.tags ?? [])

  const unchanged = title.trim() === file.title &&
    JSON.stringify(tags) === JSON.stringify(file.tags ?? [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await editFile.mutateAsync({ id: file.id, title, tags })
      onClose()
    } catch { /* onError handles toast */ }
  }

  return (
    <SlideUpModal title="Modifier" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fieldGroup}>
          <label htmlFor="edit-file-title" className={styles.fieldLabel}>Titre</label>
          <input
            id="edit-file-title"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={styles.input}
            autoFocus
            required
            placeholder="Titre du fichier…"
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Tags</label>
          <TagInput tags={tags} onChange={setTags} />
        </div>
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={editFile.isPending || !title.trim() || unchanged}
        >
          {editFile.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </SlideUpModal>
  )
}
