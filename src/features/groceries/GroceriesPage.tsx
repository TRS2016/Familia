import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Check, Trash2 } from 'lucide-react'
import { useGroceries } from './useGroceries'
import { useGroceriesRealtime } from './useGroceriesRealtime'
import type { Grocery } from './useGroceries'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import styles from './GroceriesPage.module.css'

function sortGroceries(items: Grocery[]): Grocery[] {
  const unchecked = items
    .filter(g => !g.checked)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const checked = items
    .filter(g => g.checked)
    .sort((a, b) =>
      new Date(b.checked_at ?? b.created_at).getTime() -
      new Date(a.checked_at ?? a.created_at).getTime()
    )
  return [...unchecked, ...checked]
}

export default function GroceriesPage() {
  const { query, addGrocery, toggleGrocery, deleteGrocery } = useGroceries()
  useGroceriesRealtime()
  const [newName, setNewName] = useState('')

  const sorted = sortGroceries(query.data ?? [])
  const unchecked = sorted.filter(g => !g.checked)
  const checked = sorted.filter(g => g.checked)

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    addGrocery.mutate(name)
    setNewName('')
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
      </form>

      {query.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Spinner size={32} />
        </div>
      )}

      {!query.isLoading && sorted.length === 0 && (
        <EmptyState
          emoji="🛒"
          title="La liste est vide"
          description="Ajoute le premier article avec le champ ci-dessus."
        />
      )}

      {/* Unchecked items */}
      {unchecked.length > 0 && (
        <ul className={styles.list}>
          {unchecked.map(item => (
            <GroceryItem
              key={item.id}
              item={item}
              onToggle={() => toggleGrocery.mutate({ id: item.id, checked: true })}
              onDelete={() => deleteGrocery.mutate(item.id)}
            />
          ))}
        </ul>
      )}

      {/* Checked items */}
      {checked.length > 0 && (
        <>
          <div className={styles.separator}>
            <span className={styles.separatorLine} />
            <span className={styles.separatorLabel}>Déjà pris</span>
            <span className={styles.separatorLine} />
          </div>
          <ul className={styles.list}>
            {checked.map(item => (
              <GroceryItem
                key={item.id}
                item={item}
                onToggle={() => toggleGrocery.mutate({ id: item.id, checked: false })}
                onDelete={() => deleteGrocery.mutate(item.id)}
              />
            ))}
          </ul>
        </>
      )}

    </div>
  )
}

function GroceryItem({
  item,
  onToggle,
  onDelete,
}: {
  item: Grocery
  onToggle: () => void
  onDelete: () => void
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
      <div className={styles.itemBody}>
        <div className={[styles.itemName, item.checked ? styles.itemNameChecked : ''].join(' ')}>
          {item.name}
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
