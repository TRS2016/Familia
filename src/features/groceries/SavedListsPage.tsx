import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Check, Copy, ChevronRight, Pencil, X } from 'lucide-react'
import { useSavedLists, useSavedListDetail } from './useSavedLists'
import type { SavedItem } from './useSavedLists'
import { useGroceries } from './useGroceries'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import styles from './SavedListsPage.module.css'

// ── Page index ────────────────────────────────────────────────────────────────

export default function SavedListsPage() {
  const { query, createList, deleteList } = useSavedLists()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newListName, setNewListName] = useState('')

  const lists = query.data ?? []

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    const name = newListName.trim()
    if (!name) return
    createList.mutate({ name }, {
      onSuccess: (list) => {
        setCreating(false)
        setNewListName('')
        setSelectedId(list.id)
      },
    })
  }

  if (selectedId) {
    const list = lists.find(l => l.id === selectedId)
    return (
      <ListDetailView
        listId={selectedId}
        listName={list?.name ?? ''}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <Link to="/groceries" className={styles.backLink} aria-label="Retour aux courses">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Mes listes</h1>
        <button
          className={styles.createBtn}
          onClick={() => setCreating(true)}
          aria-label="Nouvelle liste"
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </header>

      {query.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Spinner size={32} />
        </div>
      )}

      {!query.isLoading && lists.length === 0 && (
        <EmptyState
          emoji="📋"
          title="Aucune liste sauvegardée"
          description="Crée ta première liste modèle avec le bouton + ci-dessus."
        />
      )}

      <ul className={styles.listIndex}>
        {lists.map(list => (
          <li key={list.id} className={styles.listRow}>
            <button className={styles.listRowMain} onClick={() => setSelectedId(list.id)}>
              <div className={styles.listRowInfo}>
                <span className={styles.listName}>{list.name}</span>
                <span className={styles.listMeta}>
                  {list.item_count} article{list.item_count !== 1 ? 's' : ''}
                </span>
              </div>
              <ChevronRight size={16} strokeWidth={2} color="var(--text-muted)" />
            </button>
            <button
              className={styles.listDeleteBtn}
              onClick={() => {
                if (confirm(`Supprimer "${list.name}" ?`)) deleteList.mutate(list.id)
              }}
              aria-label={`Supprimer ${list.name}`}
            >
              <Trash2 size={15} strokeWidth={2} />
            </button>
          </li>
        ))}
      </ul>

      {/* Modal création */}
      {creating && (
        <SlideUpModal title="Nouvelle liste" onClose={() => { setCreating(false); setNewListName('') }}>
          <form onSubmit={handleCreate} className={styles.createForm}>
            <input
              type="text"
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              placeholder="Ex : Courses hebdo, Bio du dimanche…"
              className={styles.nameInput}
              autoFocus
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!newListName.trim() || createList.isPending}
              className={styles.submitBtn}
            >
              {createList.isPending ? 'Création…' : 'Créer et ajouter des articles'}
            </button>
          </form>
        </SlideUpModal>
      )}

    </div>
  )
}

// ── Vue détail / édition d'une liste ─────────────────────────────────────────

function ListDetailView({
  listId, listName, onBack,
}: {
  listId: string
  listName: string
  onBack: () => void
}) {
  const { renameList, duplicateList } = useSavedLists()
  const { query, addItem, updateItem, deleteItem } = useSavedListDetail(listId)
  const { loadSavedList } = useGroceries()
  const navigate = useNavigate()

  const [name, setName] = useState(listName)
  const [editingName, setEditingName] = useState(false)

  const [newItemName, setNewItemName] = useState('')
  const [editingItem, setEditingItem] = useState<SavedItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editQty, setEditQty] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editStore, setEditStore] = useState('')

  const items = query.data ?? []

  function handleRename(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    renameList.mutate({ id: listId, name: trimmed }, { onSuccess: () => setEditingName(false) })
  }

  function handleAddItem(e: FormEvent) {
    e.preventDefault()
    const n = newItemName.trim()
    if (!n) return
    addItem.mutate({ name: n, quantity: null, price: null, category: null, store: null }, {
      onSuccess: () => setNewItemName(''),
    })
  }

  function openEdit(item: SavedItem) {
    setEditingItem(item)
    setEditName(item.name)
    setEditQty(item.quantity ?? '')
    setEditPrice(item.price !== null ? String(item.price).replace('.', ',') : '')
    setEditCategory(item.category ?? '')
    setEditStore(item.store ?? '')
  }

  function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingItem || !editName.trim()) return
    const parsedPrice = editPrice.trim() ? parseFloat(editPrice.replace(',', '.')) : null
    updateItem.mutate({
      id: editingItem.id,
      name: editName.trim(),
      quantity: editQty.trim() || null,
      price: parsedPrice && parsedPrice > 0 ? parsedPrice : null,
      category: editCategory.trim() || null,
      store: editStore.trim() || null,
    }, { onSuccess: () => setEditingItem(null) })
  }

  function handleLoad() {
    loadSavedList.mutate(items, {
      onSuccess: () => navigate('/groceries'),
    })
  }

  function handleDuplicate() {
    duplicateList.mutate(
      { id: listId, name: `${name} (copie)` },
      { onSuccess: () => onBack() },
    )
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <button className={styles.backLink} onClick={onBack} aria-label="Retour aux listes">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </button>

        {editingName ? (
          <form onSubmit={handleRename} className={styles.renameForm}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className={styles.renameInput}
              autoFocus
              onBlur={() => { setEditingName(false); setName(listName) }}
            />
            <button type="submit" className={styles.renameOk}>
              <Check size={16} strokeWidth={3} />
            </button>
          </form>
        ) : (
          <button className={styles.titleBtn} onClick={() => setEditingName(true)}>
            <h1 className={styles.pageTitle}>{name}</h1>
            <Pencil size={13} strokeWidth={2.5} color="var(--text-muted)" />
          </button>
        )}

        <div style={{ width: 32 }} />
      </header>

      {/* Formulaire ajout rapide */}
      <form onSubmit={handleAddItem} className={styles.addForm}>
        <div className={styles.addRow}>
          <input
            type="text"
            value={newItemName}
            onChange={e => setNewItemName(e.target.value)}
            placeholder="Ajouter un article…"
            className={styles.addInput}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!newItemName.trim() || addItem.isPending}
            className={styles.addBtn}
            aria-label="Ajouter"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </form>

      {query.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
          <Spinner size={28} />
        </div>
      )}

      {!query.isLoading && items.length === 0 && (
        <EmptyState
          emoji="🛒"
          title="Liste vide"
          description="Ajoute des articles pour construire ce modèle."
        />
      )}

      <ul className={styles.itemList}>
        {items.map(item => (
          <li key={item.id} className={styles.itemRow}>
            <button className={styles.itemMain} onClick={() => openEdit(item)}>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{item.name}</span>
                <div className={styles.itemMeta}>
                  {item.quantity && <span>{item.quantity}</span>}
                  {item.price !== null && (
                    <span>{item.price.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span>
                  )}
                  {item.store && <span>📍 {item.store}</span>}
                  {item.category && <span>{item.category}</span>}
                </div>
              </div>
              <Pencil size={13} strokeWidth={2} color="var(--text-muted)" />
            </button>
            <button
              className={styles.itemDeleteBtn}
              onClick={() => deleteItem.mutate(item.id)}
              aria-label={`Supprimer ${item.name}`}
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </li>
        ))}
      </ul>

      {/* Actions */}
      <div className={styles.actions}>
        <button
          className={styles.actionLoad}
          onClick={handleLoad}
          disabled={items.length === 0 || loadSavedList.isPending}
        >
          {loadSavedList.isPending ? 'Chargement…' : `Ajouter à la liste active (${items.length} articles)`}
        </button>
        <button className={styles.actionDuplicate} onClick={handleDuplicate} disabled={duplicateList.isPending}>
          <Copy size={14} strokeWidth={2.5} />
          Dupliquer cette liste
        </button>
      </div>

      {/* Modal édition article */}
      {editingItem && (
        <SlideUpModal title="Modifier l'article" onClose={() => setEditingItem(null)}>
          <form onSubmit={handleSaveEdit} className={styles.editForm}>

            <div className={styles.editField}>
              <label className={styles.editLabel}>Nom</label>
              <input
                type="text" value={editName} onChange={e => setEditName(e.target.value)}
                className={styles.editInput} placeholder="Ex : Pommes" autoFocus required
              />
            </div>

            <div className={styles.editRow}>
              <div className={styles.editField} style={{ flex: 1 }}>
                <label className={styles.editLabel}>Quantité</label>
                <input
                  type="text" value={editQty} onChange={e => setEditQty(e.target.value)}
                  className={styles.editInput} placeholder="Ex : 1 kg, 3…"
                />
              </div>
              <div className={styles.editField} style={{ flex: 1 }}>
                <label className={styles.editLabel}>Prix unitaire (€)</label>
                <input
                  type="text" inputMode="decimal" value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  className={styles.editInput} placeholder="Ex : 1,99"
                />
              </div>
            </div>

            <div className={styles.editRow}>
              <div className={styles.editField} style={{ flex: 1 }}>
                <label className={styles.editLabel}>Enseigne</label>
                <input
                  type="text" value={editStore} onChange={e => setEditStore(e.target.value)}
                  className={styles.editInput} placeholder="Ex : Carrefour"
                />
              </div>
              <div className={styles.editField} style={{ flex: 1 }}>
                <label className={styles.editLabel}>Rayon</label>
                <input
                  type="text" value={editCategory} onChange={e => setEditCategory(e.target.value)}
                  className={styles.editInput} placeholder="Ex : Frais"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!editName.trim() || updateItem.isPending}
              className={styles.saveBtn}
            >
              {updateItem.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>

            <button
              type="button"
              className={styles.deleteItemBtn}
              onClick={() => { deleteItem.mutate(editingItem.id); setEditingItem(null) }}
            >
              Supprimer cet article
            </button>

          </form>
        </SlideUpModal>
      )}


    </div>
  )
}
