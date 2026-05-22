import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useSavedLists, useSavedListDetail } from './useSavedLists'
import type { useGroceries } from './useGroceries'
import Spinner from '../../components/Spinner'
import styles from './GroceriesPage.module.css'

export function LoadListModal({
  currentItemCount,
  onClose,
  replaceWithList,
}: {
  currentItemCount: number
  onClose: () => void
  replaceWithList: ReturnType<typeof useGroceries>['replaceWithList']
}) {
  const { query: listsQuery } = useSavedLists()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { query: itemsQuery } = useSavedListDetail(selectedId ?? '')
  const lists = listsQuery.data ?? []

  function handleLoad() {
    if (!selectedId || !itemsQuery.data) return
    replaceWithList.mutate(itemsQuery.data, { onSuccess: onClose })
  }

  return (
    <div className={styles.loadModal}>
      {/* Option : continuer avec la liste déjà en cours */}
      {currentItemCount > 0 && (
        <button className={styles.loadModalCurrentList} onClick={onClose}>
          <div>
            <span className={styles.loadModalCurrentTitle}>Continuer avec la liste actuelle</span>
            <span className={styles.loadModalCurrentCount}>
              {currentItemCount} article{currentItemCount > 1 ? 's' : ''} déjà dans la liste
            </span>
          </div>
          <Check size={16} strokeWidth={2.5} color="var(--accent)" />
        </button>
      )}

      {listsQuery.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spinner size={28} />
        </div>
      )}
      {!listsQuery.isLoading && lists.length === 0 && (
        <p className={styles.loadModalEmpty}>
          Aucune liste sauvegardée.{' '}
          <Link to="/groceries/saved" onClick={onClose} className={styles.loadModalLink}>
            Créer une liste →
          </Link>
        </p>
      )}
      {lists.length > 0 && (
        <p className={styles.loadModalSubtitle}>
          Ou démarrer avec une liste sauvegardée — remplace la liste actuelle :
        </p>
      )}
      <ul className={styles.loadModalList}>
        {lists.map(list => (
          <li key={list.id}>
            <button
              className={[styles.loadModalItem, selectedId === list.id ? styles.loadModalItemActive : ''].join(' ')}
              onClick={() => setSelectedId(id => id === list.id ? null : list.id)}
            >
              <div>
                <span className={styles.loadModalName}>{list.name}</span>
                <span className={styles.loadModalCount}>{list.item_count} article{list.item_count !== 1 ? 's' : ''}</span>
              </div>
              <div className={[styles.loadModalCheck, selectedId === list.id ? styles.loadModalCheckActive : ''].join(' ')}>
                {selectedId === list.id && <Check size={12} strokeWidth={3} color="#fff" />}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {selectedId && (
        <div className={styles.loadModalAction}>
          <button
            className={styles.loadModalBtn}
            onClick={handleLoad}
            disabled={replaceWithList.isPending || itemsQuery.isLoading}
          >
            {replaceWithList.isPending ? 'Chargement…' : 'Démarrer avec cette liste'}
          </button>
        </div>
      )}
    </div>
  )
}
