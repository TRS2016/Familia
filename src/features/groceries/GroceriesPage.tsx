import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useGroceries } from './useGroceries'
import { useGroceriesRealtime } from './useGroceriesRealtime'
import type { Grocery } from './useGroceries'

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

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    addGrocery.mutate(name)
    setNewName('')
  }

  return (
    <div>
      <p><Link to="/">← Accueil</Link></p>
      <h1>Courses</h1>

      <form onSubmit={handleAdd}>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Ajouter un article..."
          disabled={addGrocery.isPending}
        />
        {' '}
        <button type="submit" disabled={addGrocery.isPending || !newName.trim()}>
          +
        </button>
      </form>

      {query.isLoading && <p>Chargement...</p>}

      {!query.isLoading && sorted.length === 0 && (
        <p>La liste est vide. Ajoute un premier article !</p>
      )}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {sorted.map(item => {
          const isOptimistic = item.id.startsWith('optimistic-')
          return (
            <li key={item.id} style={{ opacity: isOptimistic ? 0.5 : 1, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() =>
                  toggleGrocery.mutate({ id: item.id, checked: !item.checked })
                }
                disabled={isOptimistic}
              />
              {' '}
              <span style={{ textDecoration: item.checked ? 'line-through' : 'none' }}>
                {item.name}
              </span>
              {' '}
              <small style={{ color: '#888' }}>
                {item.created_by_member
                  ? `ajouté par ${item.created_by_member.display_name}`
                  : ''}
                {item.checked && item.checked_by_member
                  ? ` · coché par ${item.checked_by_member.display_name}`
                  : ''}
              </small>
              {' '}
              <button
                onClick={() => deleteGrocery.mutate(item.id)}
                disabled={isOptimistic}
                aria-label={`Supprimer ${item.name}`}
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
