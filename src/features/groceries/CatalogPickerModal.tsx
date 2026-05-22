import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import type { CatalogItem } from './useCatalog'
import { useCatalog } from './useCatalog'
import type { useGroceries } from './useGroceries'
import Spinner from '../../components/Spinner'
import { CATEGORIES, CATEGORY_ORDER } from './groceries.utils'
import styles from './GroceriesPage.module.css'

function groupCatalogByCategory(items: CatalogItem[]) {
  const hasAny = items.some(i => i.category)
  if (!hasAny) return [{ label: null as string | null, emoji: '', items }]

  const map = new Map<string | null, CatalogItem[]>([[null, []]])
  for (const key of CATEGORY_ORDER) map.set(key, [])
  for (const item of items) {
    const k = item.category && CATEGORY_ORDER.includes(item.category as any) ? item.category : null
    map.get(k)!.push(item)
  }
  const groups: { label: string | null; emoji: string; items: CatalogItem[] }[] = []
  const nullItems = map.get(null)!
  if (nullItems.length) groups.push({ label: null, emoji: '', items: nullItems })
  for (const cat of CATEGORIES) {
    const g = map.get(cat.key)!
    if (g.length) groups.push({ label: cat.key, emoji: cat.emoji, items: g })
  }
  return groups
}

export function CatalogPickerModal({
  onClose,
  loadSavedList,
}: {
  onClose: () => void
  loadSavedList: ReturnType<typeof useGroceries>['loadSavedList']
}) {
  const { query } = useCatalog()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const items  = query.data ?? []
  const groups = groupCatalogByCategory(items)

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAdd() {
    const toAdd = items.filter(i => selected.has(i.id))
    loadSavedList.mutate(toAdd, { onSuccess: onClose })
  }

  if (query.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <Spinner size={28} />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={styles.catalogPickerEmpty}>
        <p>Catalogue vide.</p>
        <Link to="/groceries/catalog" onClick={onClose} className={styles.catalogPickerLink}>
          Gérer le catalogue →
        </Link>
      </div>
    )
  }

  return (
    <div className={styles.catalogPicker}>
      <div className={styles.catalogPickerHeader}>
        <span className={styles.catalogPickerHint}>
          {selected.size > 0
            ? `${selected.size} article${selected.size > 1 ? 's' : ''} sélectionné${selected.size > 1 ? 's' : ''}`
            : 'Sélectionne les articles à ajouter'}
        </span>
        <Link to="/groceries/catalog" onClick={onClose} className={styles.catalogManageLink}>
          Gérer
        </Link>
      </div>

      {groups.map(group => (
        <div key={group.label ?? '__none'}>
          {group.label && (
            <div className={styles.catalogPickerCategoryHeader}>
              {group.emoji} {group.label}
            </div>
          )}
          <ul className={styles.catalogPickerList}>
            {group.items.map(item => {
              const isSelected = selected.has(item.id)
              return (
                <li key={item.id}>
                  <button
                    className={[styles.catalogPickerItem, isSelected ? styles.catalogPickerItemSelected : ''].join(' ')}
                    onClick={() => toggle(item.id)}
                  >
                    <div className={[styles.catalogPickerCheck, isSelected ? styles.catalogPickerCheckActive : ''].join(' ')}>
                      {isSelected && <Check size={12} strokeWidth={3} color="#fff" />}
                    </div>
                    <div className={styles.catalogPickerInfo}>
                      <span className={styles.catalogPickerName}>{item.name}</span>
                      {(item.quantity || item.store) && (
                        <span className={styles.catalogPickerMeta}>
                          {item.quantity && `${item.quantity}`}
                          {item.quantity && item.store && ' · '}
                          {item.store}
                        </span>
                      )}
                    </div>
                    {item.price !== null && (
                      <span className={styles.catalogPickerPrice}>
                        {item.price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {selected.size > 0 && (
        <div className={styles.catalogPickerAction}>
          <button
            className={styles.catalogPickerBtn}
            onClick={handleAdd}
            disabled={loadSavedList.isPending}
          >
            {loadSavedList.isPending
              ? 'Ajout…'
              : `Ajouter ${selected.size} article${selected.size > 1 ? 's' : ''} à la liste`}
          </button>
        </div>
      )}
    </div>
  )
}
