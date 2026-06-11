import { useState } from 'react'
import type { FormEvent } from 'react'
import SlideUpModal from '../../components/SlideUpModal'
import styles from './GroceriesPage.module.css'

// Sauvegarde de la liste active comme modèle réutilisable.
export default function SaveListModal({ uncheckedCount, isPending, onClose, onSave }: {
  uncheckedCount: number
  isPending: boolean
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [name, setName] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave(name.trim())
  }

  return (
    <SlideUpModal title="Sauvegarder comme modèle" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.saveModalForm}>
        <p className={styles.saveModalHint}>
          {uncheckedCount} article{uncheckedCount > 1 ? 's' : ''} non coché{uncheckedCount > 1 ? 's' : ''} seront sauvegardés.
        </p>
        <input
          type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Nom de la liste (ex : Courses hebdo)"
          aria-label="Nom de la liste"
          className={styles.saveModalInput} autoFocus autoComplete="off"
        />
        <button type="submit" disabled={!name.trim() || isPending} className={styles.saveModalBtn}>
          {isPending ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </form>
    </SlideUpModal>
  )
}
