import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Check, Trash2 } from 'lucide-react'
import { useGroceries } from './useGroceries'
import { useGroceriesRealtime } from './useGroceriesRealtime'
import type { Grocery } from './useGroceries'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import styles from './GroceriesPage.module.css'

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

function getCategoryEmoji(key: string): string {
  return CATEGORIES.find(c => c.key === key)?.emoji ?? '📦'
}

function sortUnchecked(items: Grocery[]): Grocery[] {
  return items
    .filter(g => !g.checked)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

function sortChecked(items: Grocery[]): Grocery[] {
  return items
    .filter(g => g.checked)
    .sort((a, b) =>
      new Date(b.checked_at ?? b.created_at).getTime() -
      new Date(a.checked_at ?? a.created_at).getTime()
    )
}

type CategoryGroup = { category: string | null; items: Grocery[] }

function groupUnchecked(items: Grocery[]): CategoryGroup[] {
  const hasAny = items.some(g => g.category)
  if (!hasAny) return [{ category: null, items }]

  const map = new Map<string | null, Grocery[]>([[null, []]])
  for (const key of CATEGORY_ORDER) map.set(key, [])

  for (const item of items) {
    const k = item.category && CATEGORY_ORDER.includes(item.category as CategoryKey)
      ? item.category
      : null
    map.get(k)!.push(item)
  }

  const groups: CategoryGroup[] = []
  const nullItems = map.get(null)!
  if (nullItems.length) groups.push({ category: null, items: nullItems })
  for (const key of CATEGORY_ORDER) {
    const g = map.get(key)!
    if (g.length) groups.push({ category: key, items: g })
  }
  return groups
}

export default function GroceriesPage() {
  const { query, addGrocery, updateGrocery, toggleGrocery, deleteGrocery, clearChecked } = useGroceries()
  useGroceriesRealtime()
  const [newName, setNewName]           = useState('')
  const [newQty, setNewQty]             = useState('')
  const [formCategory, setFormCategory] = useState<string | null>(null)

  const [editingItem, setEditingItem]       = useState<Grocery | null>(null)
  const [editName, setEditName]             = useState('')
  const [editQty, setEditQty]               = useState('')
  const [editCategory, setEditCategory]     = useState<string | null>(null)

  const allItems  = query.data ?? []
  const unchecked = groupUnchecked(sortUnchecked(allItems))
  const checked   = sortChecked(allItems)

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    addGrocery.mutate({ name, quantity: newQty.trim() || undefined, category: formCategory || undefined })
    setNewName('')
    setNewQty('')
  }

  function openEdit(item: Grocery) {
    setEditingItem(item)
    setEditName(item.name)
    setEditQty(item.quantity ?? '')
    setEditCategory(item.category)
  }

  function handleSaveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingItem || !editName.trim()) return
    updateGrocery.mutate({
      id: editingItem.id,
      name: editName,
      quantity: editQty || undefined,
      category: editCategory,
    })
    setEditingItem(null)
  }

  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour à l'accueil">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Courses</h1>
      </header>

      {/* Add form — sticky */}
      <form onSubmit={handleAdd} className={styles.addForm}>
        <div className={styles.addRow}>
          <input
            type="text"
            value={newQty}
            onChange={e => setNewQty(e.target.value)}
            placeholder="qté"
            disabled={addGrocery.isPending}
            className={styles.qtyInput}
            autoComplete="off"
          />
          <span className={styles.addDivider} />
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Ajouter un article..."
            disabled={addGrocery.isPending}
            className={styles.addInput}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={addGrocery.isPending || !newName.trim()}
            className={styles.addBtn}
            aria-label="Ajouter"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
        <div className={styles.categoryChips}>
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              type="button"
              className={[styles.categoryChip, formCategory === c.key ? styles.categoryChipActive : ''].join(' ')}
              onClick={() => setFormCategory(f => f === c.key ? null : c.key)}
            >
              {c.emoji} {c.key}
            </button>
          ))}
        </div>
      </form>

      {query.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Spinner size={32} />
        </div>
      )}

      {!query.isLoading && allItems.length === 0 && (
        <EmptyState
          emoji="🛒"
          title="La liste est vide"
          description="Ajoute le premier article avec le champ ci-dessus."
        />
      )}

      {/* Unchecked items — grouped by category */}
      {unchecked.map(group => (
        <div key={group.category ?? '__none'}>
          {group.category && (
            <div className={styles.categoryHeader}>
              {getCategoryEmoji(group.category)} {group.category}
            </div>
          )}
          <ul className={styles.list}>
            {group.items.map(item => (
              <GroceryItem
                key={item.id}
                item={item}
                onToggle={() => toggleGrocery.mutate({ id: item.id, checked: true })}
                onDelete={() => deleteGrocery.mutate(item.id)}
                onEdit={() => openEdit(item)}
              />
            ))}
          </ul>
        </div>
      ))}

      {/* Checked items */}
      {checked.length > 0 && (
        <>
          <div className={styles.separator}>
            <span className={styles.separatorLine} />
            <span className={styles.separatorLabel}>Déjà pris</span>
            <span className={styles.separatorLine} />
            <button
              className={styles.clearBtn}
              onClick={() => clearChecked.mutate()}
              disabled={clearChecked.isPending}
            >
              Tout effacer
            </button>
          </div>
          <ul className={styles.list}>
            {checked.map(item => (
              <GroceryItem
                key={item.id}
                item={item}
                onToggle={() => toggleGrocery.mutate({ id: item.id, checked: false })}
                onDelete={() => deleteGrocery.mutate(item.id)}
                onEdit={() => openEdit(item)}
              />
            ))}
          </ul>
        </>
      )}

      {/* Edit modal */}
      {editingItem && (
        <SlideUpModal title="Modifier l'article" onClose={() => setEditingItem(null)}>
          <form onSubmit={handleSaveEdit} className={styles.editForm}>
            <div className={styles.editRow}>
              <input
                type="text"
                value={editQty}
                onChange={e => setEditQty(e.target.value)}
                placeholder="qté"
                className={styles.qtyInput}
                autoComplete="off"
              />
              <span className={styles.addDivider} />
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Nom de l'article"
                className={styles.addInput}
                autoFocus
                autoComplete="off"
                required
              />
            </div>
            <div className={styles.categoryChips}>
              {CATEGORIES.map(c => (
                <button
                  key={c.key}
                  type="button"
                  className={[styles.categoryChip, editCategory === c.key ? styles.categoryChipActive : ''].join(' ')}
                  onClick={() => setEditCategory(f => f === c.key ? null : c.key)}
                >
                  {c.emoji} {c.key}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={!editName.trim() || updateGrocery.isPending}
              className={styles.saveBtn}
            >
              Enregistrer
            </button>
          </form>
        </SlideUpModal>
      )}

    </div>
  )
}

function GroceryItem({
  item,
  onToggle,
  onDelete,
  onEdit,
}: {
  item: Grocery
  onToggle: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const isOptimistic = item.id.startsWith('optimistic-')

  const metaParts: string[] = []
  if (item.created_by_member) metaParts.push(`Ajouté par ${item.created_by_member.display_name}`)
  if (item.checked && item.checked_by_member) metaParts.push(`coché par ${item.checked_by_member.display_name}`)

  return (
    <li className={[
      styles.item,
      item.checked ? styles.itemChecked : '',
      isOptimistic ? styles.itemOptimistic : '',
    ].join(' ')}>

      {/* Checkbox */}
      <button
        className={[styles.checkbox, item.checked ? styles.checkboxChecked : ''].join(' ')}
        onClick={onToggle}
        disabled={isOptimistic}
        aria-label={item.checked ? `Décocher ${item.name}` : `Cocher ${item.name}`}
      >
        {item.checked && <Check size={13} strokeWidth={3} color="#fff" />}
      </button>

      {/* Name + meta */}
      <div className={styles.itemBody} onClick={onEdit} style={{ cursor: 'pointer' }}>
        <div className={styles.itemNameRow}>
          {item.quantity && (
            <span className={[styles.qtyBadge, item.checked ? styles.qtyBadgeChecked : ''].join(' ')}>
              {item.quantity}
            </span>
          )}
          <span className={[styles.itemName, item.checked ? styles.itemNameChecked : ''].join(' ')}>
            {item.name}
          </span>
        </div>
        {metaParts.length > 0 && (
          <div className={styles.itemMeta}>{metaParts.join(' · ')}</div>
        )}
      </div>

      {/* Delete */}
      <button
        className={styles.deleteBtn}
        onClick={onDelete}
        disabled={isOptimistic}
        aria-label={`Supprimer ${item.name}`}
      >
        <Trash2 size={15} strokeWidth={2} />
      </button>

    </li>
  )
}
