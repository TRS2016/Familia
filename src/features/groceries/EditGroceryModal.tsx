import { useState } from 'react'
import type { FormEvent } from 'react'
import SlideUpModal from '../../components/SlideUpModal'
import type { Grocery } from './useGroceries'
import { CATEGORIES } from './groceries.utils'
import styles from './GroceriesPage.module.css'

export interface EditSaveData {
  name: string
  quantity?: string
  price: number | null
  category: string | null
  store: string | null
}

// Édition d'un article de la liste active.
export default function EditGroceryModal({ item, storeOptions, isPending, onClose, onSave }: {
  item: Grocery
  storeOptions: string[]
  isPending: boolean
  onClose: () => void
  onSave: (data: EditSaveData) => void
}) {
  const [name, setName]         = useState(item.name)
  const [qty, setQty]           = useState(item.quantity ?? '')
  const [price, setPrice]       = useState(item.price !== null ? String(item.price).replace('.', ',') : '')
  const [store, setStore]       = useState(item.store ?? '')
  const [category, setCategory] = useState<string | null>(item.category)

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return
    const parsedPrice = price.trim() ? parseFloat(price.replace(',', '.')) : null
    onSave({
      name: name.trim(),
      quantity: qty.trim() || undefined,
      price: parsedPrice && parsedPrice > 0 ? parsedPrice : null,
      category,
      store: store.trim() || null,
    })
  }

  return (
    <SlideUpModal title="Modifier l'article" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.editForm}>
        <div className={styles.editField}>
          <label htmlFor="edit-grocery-name" className={styles.editLabel}>Nom</label>
          <input
            id="edit-grocery-name"
            type="text" value={name} onChange={e => setName(e.target.value)}
            className={styles.editInput} placeholder="Ex : Pommes" autoFocus autoComplete="off" required
          />
        </div>
        <div className={styles.editRow}>
          <div className={styles.editField} style={{ flex: 1 }}>
            <label htmlFor="edit-grocery-qty" className={styles.editLabel}>Quantité</label>
            <input
              id="edit-grocery-qty"
              type="text" value={qty} onChange={e => setQty(e.target.value)}
              className={styles.editInput} placeholder="Ex : 1 kg, 3…" autoComplete="off"
            />
          </div>
          <div className={styles.editField} style={{ flex: 1 }}>
            <label htmlFor="edit-grocery-price" className={styles.editLabel}>Prix unitaire (€)</label>
            <input
              id="edit-grocery-price"
              type="text" inputMode="decimal" value={price}
              onChange={e => setPrice(e.target.value)}
              className={styles.editInput} placeholder="Ex : 1,99" autoComplete="off"
            />
          </div>
        </div>
        <div className={styles.editField}>
          <label htmlFor="edit-grocery-store" className={styles.editLabel}>Enseigne</label>
          <input
            id="edit-grocery-store"
            type="text" value={store} onChange={e => setStore(e.target.value)}
            className={styles.editInput} placeholder="Ex : Carrefour, Bio c'bon…" autoComplete="off"
          />
          {storeOptions.length > 0 && (
            <div className={styles.storeChips} style={{ padding: 0, marginTop: 4 }}>
              {storeOptions.map(s => (
                <button key={s} type="button"
                  className={[styles.storeChip, store === s ? styles.storeChipActive : ''].join(' ')}
                  onClick={() => setStore(x => x === s ? '' : s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={styles.editField}>
          <span className={styles.editLabel}>Rayon</span>
          <div className={styles.categoryChips} style={{ padding: 0 }}>
            {CATEGORIES.map(c => (
              <button key={c.key} type="button"
                className={[styles.categoryChip, category === c.key ? styles.categoryChipActive : ''].join(' ')}
                onClick={() => setCategory(f => f === c.key ? null : c.key)}
              >
                {c.emoji} {c.key}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" disabled={!name.trim() || isPending} className={styles.saveBtn}>
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </SlideUpModal>
  )
}
