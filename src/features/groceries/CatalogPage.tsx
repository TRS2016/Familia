import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Pencil, MapPin } from 'lucide-react'
import { useCatalog } from './useCatalog'
import type { CatalogItem } from './useCatalog'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import styles from './CatalogPage.module.css'

// ── Constantes ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'Fruits & légumes', emoji: '🥦' },
  { key: 'Frais',            emoji: '🧊' },
  { key: 'Épicerie',         emoji: '🥫' },
  { key: 'Boissons',         emoji: '🥤' },
  { key: 'Hygiène',          emoji: '🧴' },
  { key: 'Autre',            emoji: '📦' },
] as const

type CategoryKey = typeof CATEGORIES[number]['key']
const CATEGORY_ORDER = CATEGORIES.map(c => c.key)

function getCategoryEmoji(key: string | null): string {
  if (!key) return ''
  return CATEGORIES.find(c => c.key === key)?.emoji ?? ''
}

function formatPrice(price: number): string {
  return price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

// ── Groupage par catégorie ────────────────────────────────────────────────────

type Group = { label: string | null; emoji: string; items: CatalogItem[] }

function groupByCategory(items: CatalogItem[]): Group[] {
  const hasAny = items.some(i => i.category)
  if (!hasAny) return [{ label: null, emoji: '', items }]

  const map = new Map<string | null, CatalogItem[]>([[null, []]])
  for (const key of CATEGORY_ORDER) map.set(key, [])

  for (const item of items) {
    const k = item.category && CATEGORY_ORDER.includes(item.category as CategoryKey)
      ? item.category : null
    map.get(k)!.push(item)
  }

  const groups: Group[] = []
  const nullItems = map.get(null)!
  if (nullItems.length) groups.push({ label: null, emoji: '', items: nullItems })
  for (const key of CATEGORY_ORDER) {
    const g = map.get(key)!
    if (g.length) groups.push({ label: key, emoji: getCategoryEmoji(key), items: g })
  }
  return groups
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function CatalogPage() {
  const { query, addItem, updateItem, deleteItem } = useCatalog()

  const [showAddModal, setShowAddModal]   = useState(false)
  const [editingItem, setEditingItem]     = useState<CatalogItem | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Champs formulaire ajout
  const [addName, setAddName]         = useState('')
  const [addPrice, setAddPrice]       = useState('')
  const [addQty, setAddQty]           = useState('')
  const [addStore, setAddStore]       = useState('')
  const [addCategory, setAddCategory] = useState<string | null>(null)

  // Champs formulaire édition
  const [editName, setEditName]         = useState('')
  const [editPrice, setEditPrice]       = useState('')
  const [editQty, setEditQty]           = useState('')
  const [editStore, setEditStore]       = useState('')
  const [editCategory, setEditCategory] = useState<string | null>(null)

  const items  = query.data ?? []
  const groups = groupByCategory(items)

  function resetAddForm() {
    setAddName(''); setAddPrice(''); setAddQty(''); setAddStore(''); setAddCategory(null)
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const name = addName.trim()
    if (!name) return
    const price = addPrice.trim() ? parseFloat(addPrice.replace(',', '.')) : null
    addItem.mutate({
      name,
      price: price && price > 0 ? price : null,
      quantity: addQty.trim() || null,
      category: addCategory || null,
      store: addStore.trim() || null,
    }, {
      onSuccess: () => { setShowAddModal(false); resetAddForm() },
    })
  }

  function openEdit(item: CatalogItem) {
    setEditingItem(item)
    setEditName(item.name)
    setEditPrice(item.price !== null ? String(item.price).replace('.', ',') : '')
    setEditQty(item.quantity ?? '')
    setEditStore(item.store ?? '')
    setEditCategory(item.category)
  }

  function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingItem || !editName.trim()) return
    const price = editPrice.trim() ? parseFloat(editPrice.replace(',', '.')) : null
    updateItem.mutate({
      id: editingItem.id,
      name: editName,
      price: price && price > 0 ? price : null,
      quantity: editQty.trim() || null,
      category: editCategory,
      store: editStore.trim() || null,
    }, {
      onSuccess: () => setEditingItem(null),
    })
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <Link to="/groceries/saved" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Catalogue</h1>
        <button
          className={styles.addBtn}
          onClick={() => setShowAddModal(true)}
          aria-label="Ajouter un article"
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </header>

      {query.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Spinner size={32} />
        </div>
      )}

      {!query.isLoading && items.length === 0 && (
        <EmptyState
          emoji="📋"
          title="Catalogue vide"
          description="Ajoute tes articles habituels avec leur prix pour les retrouver facilement."
        />
      )}

      {groups.map(group => (
        <div key={group.label ?? '__none'}>
          {group.label && (
            <div className={styles.categoryHeader}>
              {group.emoji} {group.label}
            </div>
          )}
          <ul className={styles.list}>
            {group.items.map(item => (
              <li key={item.id} className={styles.item}>
                <button className={styles.itemBody} onClick={() => openEdit(item)}>
                  <div className={styles.itemMain}>
                    <span className={styles.itemName}>{item.name}</span>
                    {item.quantity && (
                      <span className={styles.itemQty}>{item.quantity}</span>
                    )}
                  </div>
                  <div className={styles.itemMeta}>
                    {item.store && (
                      <span className={styles.itemStore}>
                        <MapPin size={9} strokeWidth={2.5} />
                        {item.store}
                      </span>
                    )}
                  </div>
                </button>

                <div className={styles.itemRight}>
                  {item.price !== null && (
                    <span className={styles.priceBadge}>{formatPrice(item.price)}</span>
                  )}
                  <button
                    className={styles.editBtn}
                    onClick={() => openEdit(item)}
                    aria-label={`Modifier ${item.name}`}
                  >
                    <Pencil size={14} strokeWidth={2} />
                  </button>
                  {deleteConfirm === item.id ? (
                    <button
                      className={styles.deleteConfirmBtn}
                      onClick={() => { deleteItem.mutate(item.id); setDeleteConfirm(null) }}
                    >
                      Supprimer ?
                    </button>
                  ) : (
                    <button
                      className={styles.deleteBtn}
                      onClick={() => setDeleteConfirm(item.id)}
                      aria-label={`Supprimer ${item.name}`}
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Modal — Ajouter un article */}
      {showAddModal && (
        <SlideUpModal
          title="Nouvel article"
          onClose={() => { setShowAddModal(false); resetAddForm() }}
        >
          <form onSubmit={handleAdd} className={styles.modalForm}>
            <div className={styles.field}>
              <label htmlFor="catalog-add-name" className={styles.fieldLabel}>Nom *</label>
              <input
                id="catalog-add-name"
                type="text" value={addName} onChange={e => setAddName(e.target.value)}
                className={styles.input} placeholder="Ex : Lait entier" autoFocus autoComplete="off" required
              />
            </div>

            <div className={styles.row}>
              <div className={styles.field} style={{ flex: 1 }}>
                <label htmlFor="catalog-add-price" className={styles.fieldLabel}>Prix (€)</label>
                <input
                  id="catalog-add-price"
                  type="text" inputMode="decimal" value={addPrice}
                  onChange={e => setAddPrice(e.target.value)}
                  className={styles.input} placeholder="Ex : 1,99" autoComplete="off"
                />
              </div>
              <div className={styles.field} style={{ flex: 1 }}>
                <label htmlFor="catalog-add-qty" className={styles.fieldLabel}>Quantité par défaut</label>
                <input
                  id="catalog-add-qty"
                  type="text" value={addQty} onChange={e => setAddQty(e.target.value)}
                  className={styles.input} placeholder="Ex : 1 kg, 6…" autoComplete="off"
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="catalog-add-store" className={styles.fieldLabel}>Enseigne habituelle</label>
              <input
                id="catalog-add-store"
                type="text" value={addStore} onChange={e => setAddStore(e.target.value)}
                className={styles.input} placeholder="Ex : Carrefour, Bio c'bon…" autoComplete="off"
              />
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Rayon</span>
              <div className={styles.categoryChips}>
                {CATEGORIES.map(c => (
                  <button
                    key={c.key} type="button"
                    className={[styles.chip, addCategory === c.key ? styles.chipActive : ''].join(' ')}
                    onClick={() => setAddCategory(f => f === c.key ? null : c.key)}
                  >
                    {c.emoji} {c.key}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!addName.trim() || addItem.isPending}
              className={styles.submitBtn}
            >
              {addItem.isPending ? 'Ajout…' : 'Ajouter au catalogue'}
            </button>
          </form>
        </SlideUpModal>
      )}

      {/* Modal — Éditer un article */}
      {editingItem && (
        <SlideUpModal title="Modifier l'article" onClose={() => setEditingItem(null)}>
          <form onSubmit={handleSaveEdit} className={styles.modalForm}>
            <div className={styles.field}>
              <label htmlFor="catalog-edit-name" className={styles.fieldLabel}>Nom *</label>
              <input
                id="catalog-edit-name"
                type="text" value={editName} onChange={e => setEditName(e.target.value)}
                className={styles.input} placeholder="Ex : Lait entier" autoFocus autoComplete="off" required
              />
            </div>

            <div className={styles.row}>
              <div className={styles.field} style={{ flex: 1 }}>
                <label htmlFor="catalog-edit-price" className={styles.fieldLabel}>Prix (€)</label>
                <input
                  id="catalog-edit-price"
                  type="text" inputMode="decimal" value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  className={styles.input} placeholder="Ex : 1,99" autoComplete="off"
                />
              </div>
              <div className={styles.field} style={{ flex: 1 }}>
                <label htmlFor="catalog-edit-qty" className={styles.fieldLabel}>Quantité par défaut</label>
                <input
                  id="catalog-edit-qty"
                  type="text" value={editQty} onChange={e => setEditQty(e.target.value)}
                  className={styles.input} placeholder="Ex : 1 kg, 6…" autoComplete="off"
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="catalog-edit-store" className={styles.fieldLabel}>Enseigne habituelle</label>
              <input
                id="catalog-edit-store"
                type="text" value={editStore} onChange={e => setEditStore(e.target.value)}
                className={styles.input} placeholder="Ex : Carrefour, Bio c'bon…" autoComplete="off"
              />
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Rayon</span>
              <div className={styles.categoryChips}>
                {CATEGORIES.map(c => (
                  <button
                    key={c.key} type="button"
                    className={[styles.chip, editCategory === c.key ? styles.chipActive : ''].join(' ')}
                    onClick={() => setEditCategory(f => f === c.key ? null : c.key)}
                  >
                    {c.emoji} {c.key}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!editName.trim() || updateItem.isPending}
              className={styles.submitBtn}
            >
              {updateItem.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        </SlideUpModal>
      )}

    </div>
  )
}
