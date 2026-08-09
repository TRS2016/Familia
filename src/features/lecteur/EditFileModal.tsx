import { useState } from 'react'
import type { FormEvent } from 'react'
import SlideUpModal from '../../components/SlideUpModal'
import TagInput from './TagInput'
import { useEditMediaFile } from './useLecteur'
import type { MediaFile } from './useLecteur'
import styles from './LecteurPage.module.css'

// Édition du titre, des tags et de la visibilité en soirée d'un fichier.
export default function EditFileModal({ file, onClose }: { file: MediaFile; onClose: () => void }) {
  const editFile = useEditMediaFile()
  const [title, setTitle] = useState(file.title)
  const [tags,  setTags]  = useState<string[]>(file.tags ?? [])
  const [hidden, setHidden] = useState(file.party_hidden ?? false)

  const unchanged = title.trim() === file.title &&
    JSON.stringify(tags) === JSON.stringify(file.tags ?? []) &&
    hidden === (file.party_hidden ?? false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await editFile.mutateAsync({ id: file.id, title, tags, party_hidden: hidden })
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
        <label className={styles.hideRow}>
          <input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} />
          <span>
            Masquer aux invités de soirée
            <span className={styles.hideHint}> — le lien d'invitation liste toute la bibliothèque</span>
          </span>
        </label>
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
