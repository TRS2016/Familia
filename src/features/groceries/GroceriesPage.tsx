import { useState, useMemo, useRef } from 'react'
import { useSessionState } from '../../lib/useSessionState'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft, Plus, SlidersHorizontal, ShoppingCart,
  MapPin, Bookmark, AlignJustify, LayoutList,
  Search, X, Clock, Send, ClipboardList,
} from 'lucide-react'
import { useGroceries } from './useGroceries'
import { useGroceriesRealtime } from './useGroceriesRealtime'
import { HOUSEHOLD_ID } from '../../lib/config'
import type { Grocery } from './useGroceries'
import {
  CATEGORIES, getCategoryEmoji, formatPrice,
  computeTotal, getStoredNames, getStoredStores, persistName, persistStore,
  applyOrder, sortChecked, groupByCategory, groupByStore,
} from './groceries.utils'
import { GroceryItem } from './GroceryItem'
import { useGroceryDragOrder } from './useGroceryDragOrder'
import ShoppingBudgetBar from './ShoppingBudgetBar'
import { CatalogPickerModal } from './CatalogPickerModal'
import { useCatalog } from './useCatalog'
import { useShoppingHistory, useSaveSession, useSessionSuggestions, useAddGroceryExpense } from './useShoppingHistory'
import type { SessionItem } from './useShoppingHistory'
import EditGroceryModal from './EditGroceryModal'
import SaveListModal from './SaveListModal'
import ArchivePromptModal from './ArchivePromptModal'
import ClearConfirmModal from './ClearConfirmModal'
import HistoryModal from './HistoryModal'
import NotifyListModal from './NotifyListModal'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import { useToast } from '../../components/useToast'
import styles from './GroceriesPage.module.css'

// ── Composant principal ───────────────────────────────────────────────────────

type GroupMode = 'category' | 'store'

export default function GroceriesPage() {
  const {
    query, addGrocery, updateGrocery, toggleGrocery, deleteGrocery,
    clearChecked, saveCurrentList, loadSavedList,
  } = useGroceries()
  useGroceriesRealtime()
  const catalog = useCatalog()
  const { showToast } = useToast()
  const saveSession = useSaveSession()
  const addGroceryExpense = useAddGroceryExpense()
  const [addToKakebo, setAddToKakebo] = useState(true)

  const [showCatalogPicker, setShowCatalogPicker] = useState(false)

  // ── Add form ────────────────────────────────────────────────────────────────
  const [newName, setNewName]           = useState('')
  const [newQty, setNewQty]             = useState('')
  const [newPrice, setNewPrice]         = useState('')
  const [newStore, setNewStore]         = useState('')
  const [formCategory, setFormCategory] = useState<string | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)

  // ── Edit modal ──────────────────────────────────────────────────────────────
  const [editingItem, setEditingItem] = useState<Grocery | null>(null)

  // ── Mode shopping (persisté en sessionStorage — survit aux reloads, pas aux fermetures d'onglet)
  // Mode shopping = simple VUE « en magasin » sur la même liste partagée
  // (plus de copie locale : le check écrit en base → temps réel / co-shopping).
  const [shoppingMode, setShoppingMode]       = useSessionState<boolean>(`familia-shopping-mode-${HOUSEHOLD_ID}`, false)
  const [shoppingGroupMode, setShoppingGroupMode] = useSessionState<GroupMode>(`familia-shopping-group-${HOUSEHOLD_ID}`, 'category')
  const [budget, setBudget]               = useState(() => localStorage.getItem('familia-grocery-budget') ?? '')
  const [editingBudget, setEditingBudget] = useState(false)

  // ── Sauvegarder liste actuelle ───────────────────────────────────────────────
  const [showSaveModal, setShowSaveModal] = useState(false)

  // ── Affichage ────────────────────────────────────────────────────────────────
  const [groupMode, setGroupMode]           = useState<GroupMode>('category')
  const [compactMode, setCompactMode]       = useState(false)
  const [filterMemberId, setFilterMemberId]     = useState<string | null>(null)
  const [filterText, setFilterText]             = useState('')
  const [showArchivePrompt, setShowArchivePrompt] = useState(false)
  const [showHistory, setShowHistory]             = useState(false)
  const [showClearConfirm, setShowClearConfirm]   = useState(false)
  const [showNotifyModal, setShowNotifyModal]     = useState(false)

  const { data: sessions = [], isLoading: sessionsLoading } = useShoppingHistory({ enabled: showHistory })
  const { data: sessionSuggestions = [] } = useSessionSuggestions()

  // ── Ordre drag & drop (état, persistance et pointer events extraits) ──────────
  const { orderedIds, draggingId, dragOverId, startDrag } = useGroceryDragOrder(query.data)

  // ── Données dérivées ────────────────────────────────────────────────────────
  // Source unique : la liste partagée Supabase (les deux vues l'utilisent).
  const allItems = useMemo(() => query.data ?? [], [query.data])
  const checkedItems   = allItems.filter(g => g.checked)
  const uncheckedItems = allItems.filter(g => !g.checked)
  const checkedDisplay = useMemo(() => {
    const all = sortChecked(allItems)
    const q = filterText.trim().toLowerCase()
    return q ? all.filter(g => g.name.toLowerCase().includes(q)) : all
  }, [allItems, filterText])

  // En mode shopping : groupMode propre (défaut catégorie). En édition : groupMode normal.
  const effectiveGroupMode: GroupMode = shoppingMode ? shoppingGroupMode : groupMode

  // Ordre drag & drop (orderedIds) appliqué dans les deux vues.
  const uncheckedFiltered = useMemo(() => {
    const unchecked = allItems.filter(g => !g.checked)
    const memberFiltered = !shoppingMode && filterMemberId
      ? unchecked.filter(g => g.created_by === filterMemberId)
      : unchecked
    const q = filterText.trim().toLowerCase()
    const textFiltered = q ? memberFiltered.filter(g => g.name.toLowerCase().includes(q)) : memberFiltered
    return applyOrder(textFiltered, orderedIds)
  }, [allItems, orderedIds, filterMemberId, shoppingMode, filterText])

  const uncheckedGroups = useMemo(
    () => effectiveGroupMode === 'category' ? groupByCategory(uncheckedFiltered) : groupByStore(uncheckedFiltered),
    [uncheckedFiltered, effectiveGroupMode],
  )

  const hasAnyStore    = allItems.some(g => g.store)
  const hasAnyPrice    = allItems.some(g => g.price !== null)

  const totalInCart    = computeTotal(checkedItems)
  const totalLeft      = computeTotal(uncheckedItems)
  const budgetNum      = budget.trim() ? parseFloat(budget.replace(',', '.')) : null
  const budgetProgress = budgetNum && budgetNum > 0 ? Math.min(1, totalInCart / budgetNum) : null
  const overBudget     = budgetNum !== null && totalInCart > budgetNum

  // Options membres dérivées des articles existants (pas de requête supplémentaire)
  const memberOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of allItems) {
      if (g.created_by && g.created_by_member) {
        map.set(g.created_by, g.created_by_member.display_name)
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [allItems])

  // Suggestions noms : catalogue → historique sessions → localStorage
  const nameOptions = useMemo(() => {
    const fromCatalog  = catalog.query.data?.map(c => c.name) ?? []
    const fromSessions = sessionSuggestions.map(s => s.name)
    return [...new Set([...fromCatalog, ...fromSessions, ...getStoredNames()])]
  }, [catalog.query.data, sessionSuggestions])

  // Suggestions enseignes : articles courants + localStorage
  const storeOptions = useMemo(() => {
    const fromQuery   = allItems.map(g => g.store).filter((s): s is string => !!s)
    const fromStorage = getStoredStores()
    return [...new Set([...fromQuery, ...fromStorage])].sort()
  }, [allItems])

  // ── Handlers ────────────────────────────────────────────────────────────────
  // ── Stats sessions (Lot 6) ───────────────────────────────────────────────
  const sessionStats = useMemo(() => {
    if (!sessions.length) return null
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const thisMonth = sessions.filter(s => s.created_at >= monthStart)
    const totalThisMonth = thisMonth.reduce((sum, s) => sum + (s.total ?? 0), 0)
    const withTotal = sessions.filter(s => s.total !== null)
    const avg = withTotal.length ? withTotal.reduce((sum, s) => sum + (s.total ?? 0), 0) / withTotal.length : null
    const freq = new Map<string, number>()
    for (const s of sessions) {
      for (const item of (s.items as unknown as SessionItem[]) ?? []) {
        if (item.name) freq.set(item.name, (freq.get(item.name) ?? 0) + 1)
      }
    }
    const top3 = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name)
    return { thisMonthCount: thisMonth.length, totalThisMonth, avg, top3 }
  }, [sessions])

  function handleNameChange(val: string) {
    setNewName(val)
    const lower = val.toLowerCase()
    // Ne pré-remplit que les champs encore vides : ne pas écraser une saisie manuelle.
    const catalogMatch = catalog.query.data?.find(c => c.name.toLowerCase() === lower)
    if (catalogMatch) {
      if (catalogMatch.price !== null && !newPrice.trim()) setNewPrice(String(catalogMatch.price).replace('.', ','))
      if (catalogMatch.category && !formCategory) setFormCategory(catalogMatch.category)
      if (catalogMatch.store && !newStore.trim()) setNewStore(catalogMatch.store)
      setFormExpanded(true)
      return
    }
    const historyMatch = sessionSuggestions.find(s => s.name.toLowerCase() === lower)
    if (historyMatch) {
      if (historyMatch.price !== null && !newPrice.trim()) setNewPrice(String(historyMatch.price).replace('.', ','))
      if (historyMatch.store && !newStore.trim()) setNewStore(historyMatch.store)
      setFormExpanded(true)
    }
  }

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const parsedPrice = newPrice.trim() ? parseFloat(newPrice.replace(',', '.')) : undefined
    const storeName = newStore.trim()
    addGrocery.mutate({
      name,
      quantity: newQty.trim() || undefined,
      price: parsedPrice && parsedPrice > 0 ? parsedPrice : undefined,
      category: formCategory || undefined,
      store: storeName || undefined,
    })
    persistName(name)
    if (storeName) persistStore(storeName)
    setNewName('')
    setNewQty('')
    setNewPrice('')
    // Garde store + catégorie pour ajouts en série dans le même rayon/magasin
  }

  function openEdit(item: Grocery) {
    setEditingItem(item)
  }

  function handleSaveCurrentList(name: string) {
    if (!name.trim()) return
    saveCurrentList.mutate({
      name: name.trim(),
      items: uncheckedItems.map(g => ({
        name: g.name,
        quantity: g.quantity,
        price: g.price,
        category: g.category,
        store: g.store,
      })),
    }, {
      onSuccess: () => setShowSaveModal(false),
    })
  }

  function saveBudget() {
    const trimmed = budget.trim()
    if (trimmed) localStorage.setItem('familia-grocery-budget', trimmed)
    else localStorage.removeItem('familia-grocery-budget')
    setEditingBudget(false)
  }

  function clearBudget() {
    setBudget('')
    localStorage.removeItem('familia-grocery-budget')
    setEditingBudget(false)
  }

  // Bascule simple Liste ⇄ En magasin (même liste partagée, juste une autre vue).
  function handleShoppingToggle() {
    setFilterText('')
    setEditingBudget(false)
    setShoppingMode(m => !m)
  }

  // Fin des courses : archive la session (historique + Kakebo) puis vide les
  // articles cochés de la liste partagée. « Sans archiver » vide sans enregistrer.
  // Chaque étape est idempotente (refs) : si une étape échoue, on garde la modale
  // ouverte et un nouvel essai ne refait QUE les étapes restantes — pas de session
  // ni de dépense Kakebo en double.
  const sessionSavedRef = useRef(false)
  const kakeboAddedRef  = useRef(false)
  async function handleArchiveDecision(save: boolean) {
    const done = allItems.filter(g => g.checked)
    if (save && done.length > 0) {
      const items: SessionItem[] = done.map(g => ({
        name: g.name, qty: g.quantity, price: g.price, store: g.store,
      }))
      const total = computeTotal(done)
      try {
        if (!sessionSavedRef.current) {
          await saveSession.mutateAsync({ items, total: total > 0 ? total : null })
          sessionSavedRef.current = true
        }
        if (addToKakebo && total > 0 && !kakeboAddedRef.current) {
          await addGroceryExpense.mutateAsync({ amount: total, itemCount: done.length })
          kakeboAddedRef.current = true
        }
        showToast({ type: 'success', message: 'Session de courses archivée !' })
      } catch {
        // Étape échouée (toast déjà affiché) : on garde les cochés et la modale
        // ouverte. Les refs empêchent de ré-enregistrer ce qui a déjà réussi.
        return
      }
    }
    if (done.length > 0) {
      try { await clearChecked.mutateAsync() }
      catch { return } // session déjà sauvée : on réessaiera juste le vidage
    }
    sessionSavedRef.current = false
    kakeboAddedRef.current  = false
    setShowArchivePrompt(false)
    setShoppingMode(false)
  }

  // ── Rendu ────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour à l'accueil">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>

        <div className={styles.headerCenter}>
          <h1 className={styles.pageTitle}>Courses</h1>
          {shoppingMode && allItems.length > 0 && (
            <span className={styles.progressChip}>
              {checkedItems.length}/{allItems.length}
            </span>
          )}
        </div>

        <div className={styles.headerActions}>
          {!shoppingMode && (
            <>
              <button
                className={styles.headerIconBtn}
                onClick={() => setShowNotifyModal(true)}
                disabled={uncheckedItems.length === 0}
                aria-label="Envoyer la liste par notification"
              >
                <Send size={15} strokeWidth={2.5} />
              </button>
              <button
                className={[styles.headerIconBtn, compactMode ? styles.headerIconBtnActive : ''].join(' ')}
                onClick={() => setCompactMode(m => !m)}
                aria-label={compactMode ? 'Vue normale' : 'Vue compacte'}
              >
                {compactMode
                  ? <LayoutList size={15} strokeWidth={2.5} />
                  : <AlignJustify size={15} strokeWidth={2.5} />
                }
              </button>
              <button
                className={styles.headerIconBtn}
                onClick={() => setShowHistory(true)}
                aria-label="Historique des courses"
              >
                <Clock size={15} strokeWidth={2.5} />
              </button>
              <Link to="/groceries/saved" className={styles.savedListsLink} aria-label="Mes listes">
                <Bookmark size={14} strokeWidth={2.5} />
                <span>Listes</span>
              </Link>
            </>
          )}
          <button
            className={[styles.shoppingToggle, shoppingMode ? styles.shoppingToggleActive : ''].join(' ')}
            onClick={handleShoppingToggle}
            aria-label={shoppingMode ? 'Revenir à la liste' : 'Passer en mode magasin'}
          >
            <ShoppingCart size={14} strokeWidth={2.5} />
            <span>{shoppingMode ? 'Liste' : 'En magasin'}</span>
          </button>
        </div>
      </header>

      {/* Barre de progression shopping */}
      {shoppingMode && allItems.length > 0 && (
        <div className={styles.shoppingProgressTrack}>
          <div
            className={styles.shoppingProgressFill}
            style={{ width: `${(checkedItems.length / allItems.length) * 100}%` }}
          />
        </div>
      )}

      {/* Formulaire d'ajout — disponible aussi en magasin (ex. « oups, le lait ») */}
      <form onSubmit={handleAdd} className={styles.addForm}>
          <div className={styles.addRow}>
            <input
              list="grocery-names-list"
              type="text"
              value={newName}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Ajouter un article..."
              aria-label="Nom de l'article à ajouter"
              disabled={addGrocery.isPending}
              className={styles.addInput}
              autoComplete="off"
            />
            <datalist id="grocery-names-list">
              {nameOptions.map(n => <option key={n} value={n} />)}
            </datalist>
            <button
              type="button"
              className={[styles.expandBtn, formExpanded ? styles.expandBtnActive : ''].join(' ')}
              onClick={() => setFormExpanded(x => !x)}
              aria-label="Détails (quantité, prix, enseigne, rayon)"
              aria-expanded={formExpanded}
            >
              <SlidersHorizontal size={15} strokeWidth={2.5} />
            </button>
            <button
              type="submit"
              disabled={addGrocery.isPending || !newName.trim()}
              className={styles.addBtn}
              aria-label="Ajouter"
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>
          </div>

          {formExpanded && (
            <>
              {/* Qté + Prix */}
              <div className={styles.detailsRow}>
                <input
                  type="text"
                  value={newQty}
                  onChange={e => setNewQty(e.target.value)}
                  placeholder="Quantité (ex : 3, 1 kg)"
                  disabled={addGrocery.isPending}
                  className={styles.detailInput}
                  autoComplete="off"
                />
                <span className={styles.detailSep} />
                <input
                  type="text"
                  inputMode="decimal"
                  value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  placeholder="Prix unitaire"
                  disabled={addGrocery.isPending}
                  className={styles.detailInput}
                  autoComplete="off"
                />
                <span className={styles.priceUnit}>€</span>
              </div>

              {/* Enseigne */}
              <div className={styles.storeRow}>
                <MapPin size={13} color="var(--text-muted)" strokeWidth={2.5} className={styles.storeIcon} />
                <input
                  type="text"
                  value={newStore}
                  onChange={e => setNewStore(e.target.value)}
                  placeholder="Enseigne (ex : Carrefour, Bio c'bon…)"
                  disabled={addGrocery.isPending}
                  className={styles.storeInput}
                  autoComplete="off"
                />
                {newStore && (
                  <button type="button" className={styles.storeClear} onClick={() => setNewStore('')} aria-label="Effacer l'enseigne">
                    ×
                  </button>
                )}
              </div>
              {storeOptions.length > 0 && (
                <div className={styles.storeChips}>
                  {storeOptions.map(s => (
                    <button
                      key={s}
                      type="button"
                      className={[styles.storeChip, newStore === s ? styles.storeChipActive : ''].join(' ')}
                      onClick={() => setNewStore(x => x === s ? '' : s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Rayon */}
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
            </>
          )}
        </form>

      {/* Total estimé — mode édition, si des articles ont un prix */}
      {!shoppingMode && totalLeft > 0 && (
        <div className={styles.totalBar}>
          <span className={styles.totalBarLabel}>
            {uncheckedItems.filter(g => g.price !== null).length} article{uncheckedItems.filter(g => g.price !== null).length > 1 ? 's' : ''} estimé{uncheckedItems.filter(g => g.price !== null).length > 1 ? 's' : ''}
          </span>
          <span className={styles.totalBarAmount}>{formatPrice(totalLeft)}</span>
        </div>
      )}

      {/* Lien catalogue — mode édition */}
      {!shoppingMode && (
        <div className={styles.catalogLink}>
          <button className={styles.catalogLinkBtn} onClick={() => setShowCatalogPicker(true)}>
            <ClipboardList size={14} strokeWidth={2.5} aria-hidden="true" />
            Depuis le catalogue
          </button>
        </div>
      )}

      {/* Filtre par membre — mode édition, seulement si plusieurs membres ont contribué */}
      {!shoppingMode && memberOptions.length > 1 && (
        <div className={styles.memberFilter}>
          <button
            className={[styles.memberFilterChip, filterMemberId === null ? styles.memberFilterChipActive : ''].join(' ')}
            onClick={() => setFilterMemberId(null)}
          >
            Tous
          </button>
          {memberOptions.map(m => (
            <button
              key={m.id}
              className={[styles.memberFilterChip, filterMemberId === m.id ? styles.memberFilterChipActive : ''].join(' ')}
              onClick={() => setFilterMemberId(id => id === m.id ? null : m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {/* Toggle Rayon / Enseigne — les deux modes dès qu'il existe des enseignes */}
      {hasAnyStore && (
        <div className={styles.groupToggle}>
          <button
            className={[styles.groupBtn, effectiveGroupMode === 'category' ? styles.groupBtnActive : ''].join(' ')}
            onClick={() => shoppingMode ? setShoppingGroupMode('category') : setGroupMode('category')}
          >
            Par rayon
          </button>
          <button
            className={[styles.groupBtn, effectiveGroupMode === 'store' ? styles.groupBtnActive : ''].join(' ')}
            onClick={() => shoppingMode ? setShoppingGroupMode('store') : setGroupMode('store')}
          >
            <MapPin size={11} strokeWidth={2.5} />
            Par enseigne
          </button>
        </div>
      )}

      {/* Barre de recherche — visible dans les deux modes dès qu'il y a des articles */}
      {allItems.length > 0 && (
        <div className={styles.searchBar}>
          <Search size={14} strokeWidth={2.5} className={styles.searchIcon} />
          <input
            type="search"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder={shoppingMode ? 'Rechercher…' : 'Filtrer la liste…'}
            aria-label={shoppingMode ? 'Rechercher un article' : 'Filtrer la liste'}
            className={styles.searchInput}
          />
          {filterText && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setFilterText('')}
              aria-label="Effacer la recherche"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}

      {query.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Spinner size={32} />
        </div>
      )}

      {!query.isLoading && allItems.length === 0 && (
        <EmptyState
          emoji="🛒"
          title="La liste est vide"
          description={shoppingMode
            ? 'Ajoute des articles, puis coche-les au fur et à mesure en magasin.'
            : 'Ajoute le premier article avec le champ ci-dessus.'}
        />
      )}

      {/* Articles non cochés */}
      {uncheckedGroups.map(group => (
        <div key={group.label ?? '__none'}>
          {group.label && (
            <div className={[styles.categoryHeader, effectiveGroupMode === 'store' ? styles.storeHeader : ''].join(' ')}>
              {effectiveGroupMode === 'store'
                ? <><MapPin size={11} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />{group.label}</>
                : <>{getCategoryEmoji(group.label)} {group.label}</>
              }
            </div>
          )}
          <ul className={styles.list}>
            {group.items.map(item => (
              <GroceryItem
                key={item.id}
                item={item}
                shoppingMode={shoppingMode}
                compact={compactMode}
                onToggle={() => { navigator.vibrate?.(50); toggleGrocery.mutate({ id: item.id, checked: true }) }}
                onDelete={() => deleteGrocery.mutate(item.id)}
                onEdit={() => openEdit(item)}
                isDragging={draggingId === item.id}
                isDragOver={dragOverId === item.id}
                onDragStart={(e: React.PointerEvent<HTMLLIElement>) => startDrag(item.id, e)}
              />
            ))}
          </ul>
        </div>
      ))}

      {/* Articles cochés */}
      {checkedDisplay.length > 0 && (
        <>
          <div className={styles.separator}>
            <span className={styles.separatorLine} />
            <span className={styles.separatorLabel}>Déjà pris</span>
            <span className={styles.separatorLine} />
            {!shoppingMode && (
              <button
                className={styles.clearBtn}
                onClick={() => setShowClearConfirm(true)}
                disabled={clearChecked.isPending}
              >
                Tout effacer
              </button>
            )}
          </div>
          <ul className={styles.list}>
            {checkedDisplay.map(item => (
              <GroceryItem
                key={item.id}
                item={item}
                shoppingMode={shoppingMode}
                compact={compactMode}
                onToggle={() => toggleGrocery.mutate({ id: item.id, checked: false })}
                onDelete={() => deleteGrocery.mutate(item.id)}
                onEdit={() => openEdit(item)}
              />
            ))}
          </ul>
        </>
      )}

      {/* Bouton sauvegarder liste — mode édition */}
      {!shoppingMode && uncheckedItems.length > 0 && (
        <div className={styles.saveListRow}>
          <button className={styles.saveListBtn} onClick={() => setShowSaveModal(true)}>
            <Bookmark size={13} strokeWidth={2.5} />
            Sauvegarder comme modèle
          </button>
        </div>
      )}

      {(shoppingMode || hasAnyPrice) && <div style={{ height: shoppingMode ? 150 : 64 }} />}

      {/* Barre sticky : budget + « Terminer » en magasin, total estimé en liste */}
      {(shoppingMode || hasAnyPrice) && (
        <ShoppingBudgetBar
          shoppingMode={shoppingMode}
          hasAnyPrice={hasAnyPrice}
          totalInCart={totalInCart}
          totalLeft={totalLeft}
          budget={budget}
          setBudget={setBudget}
          budgetNum={budgetNum}
          overBudget={overBudget}
          budgetProgress={budgetProgress}
          editingBudget={editingBudget}
          setEditingBudget={setEditingBudget}
          saveBudget={saveBudget}
          clearBudget={clearBudget}
          checkedCount={checkedItems.length}
          onFinish={() => setShowArchivePrompt(true)}
        />
      )}

      {/* Modal — Catalogue (picker) */}
      {showCatalogPicker && (
        <SlideUpModal title="Depuis le catalogue" onClose={() => setShowCatalogPicker(false)}>
          <CatalogPickerModal
            onClose={() => setShowCatalogPicker(false)}
            loadSavedList={loadSavedList}
          />
        </SlideUpModal>
      )}

      {/* Modal — Sauvegarder la liste actuelle */}
      {showSaveModal && (
        <SaveListModal
          uncheckedCount={uncheckedItems.length}
          isPending={saveCurrentList.isPending}
          onClose={() => setShowSaveModal(false)}
          onSave={name => handleSaveCurrentList(name)}
        />
      )}

      {/* Modal — Terminer / archiver la session de courses */}
      {showArchivePrompt && (
        <ArchivePromptModal
          checkedCount={checkedItems.length}
          total={computeTotal(checkedItems)}
          isPending={saveSession.isPending || addGroceryExpense.isPending || clearChecked.isPending}
          addToKakebo={addToKakebo}
          onToggleKakebo={() => setAddToKakebo(v => !v)}
          onClose={() => setShowArchivePrompt(false)}
          onSave={() => handleArchiveDecision(true)}
          onSkip={() => handleArchiveDecision(false)}
        />
      )}

      {/* Modal — Historique des courses + stats budget (Lot 6) */}
      {showHistory && (
        <HistoryModal
          sessions={sessions}
          isLoading={sessionsLoading}
          stats={sessionStats}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Modal — Envoyer la liste par notification */}
      {showNotifyModal && (
        <NotifyListModal
          title="Liste de courses"
          itemNames={uncheckedItems.map(g => g.name)}
          onClose={() => setShowNotifyModal(false)}
        />
      )}

      {/* Modal — Confirmer la suppression des articles cochés (Lot 3) */}
      {showClearConfirm && (
        <ClearConfirmModal
          count={checkedItems.length}
          isPending={clearChecked.isPending}
          onClose={() => setShowClearConfirm(false)}
          onConfirm={() => { clearChecked.mutate(); setShowClearConfirm(false) }}
        />
      )}

      {/* Modal d'édition */}
      {editingItem && (
        <EditGroceryModal
          item={editingItem}
          storeOptions={storeOptions}
          isPending={updateGrocery.isPending}
          onClose={() => setEditingItem(null)}
          onSave={data => {
            updateGrocery.mutate({ id: editingItem.id, ...data })
            if (data.store) persistStore(data.store)
            setEditingItem(null)
          }}
        />
      )}

    </div>
  )
}

