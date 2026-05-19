import { useState, useMemo, useRef } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft, Plus, Check, Trash2, SlidersHorizontal, ShoppingCart,
  MapPin, Bookmark, FolderOpen, Share2, AlignJustify, LayoutList,
} from 'lucide-react'
import { useGroceries } from './useGroceries'
import { useGroceriesRealtime } from './useGroceriesRealtime'
import type { Grocery } from './useGroceries'
import { useSavedLists, useSavedListDetail } from './useSavedLists'
import { useCatalog } from './useCatalog'
import type { CatalogItem } from './useCatalog'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import { useToast } from '../../components/Toast'
import styles from './GroceriesPage.module.css'

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

const STORES_STORAGE_KEY = 'familia-grocery-stores'
const NAMES_STORAGE_KEY  = 'familia-grocery-names'

// ── Utilitaires ───────────────────────────────────────────────────────────────

function getCategoryEmoji(key: string | null): string {
  if (!key) return ''
  return CATEGORIES.find(c => c.key === key)?.emoji ?? ''
}

function parseQtyMultiplier(qty: string | null): number {
  if (!qty) return 1
  const n = Number(qty.trim())
  return Number.isFinite(n) && n > 0 ? n : 1
}

function formatPrice(price: number): string {
  return price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function computeTotal(items: Grocery[]): number {
  return items
    .filter(g => g.price !== null)
    .reduce((sum, g) => sum + (g.price! * parseQtyMultiplier(g.quantity)), 0)
}

function getStoredStores(): string[] {
  try { return JSON.parse(localStorage.getItem(STORES_STORAGE_KEY) ?? '[]') }
  catch { return [] }
}

function persistStore(name: string) {
  const existing = getStoredStores()
  if (!existing.includes(name)) {
    localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify([...existing, name].slice(-30)))
  }
}

function getStoredNames(): string[] {
  try { return JSON.parse(localStorage.getItem(NAMES_STORAGE_KEY) ?? '[]') }
  catch { return [] }
}

function persistName(name: string) {
  const existing = getStoredNames()
  const updated = [name, ...existing.filter(n => n !== name)].slice(0, 50)
  localStorage.setItem(NAMES_STORAGE_KEY, JSON.stringify(updated))
}

// ── Tri ───────────────────────────────────────────────────────────────────────

function sortUnchecked(items: Grocery[], filterMemberId: string | null = null): Grocery[] {
  const src = filterMemberId ? items.filter(g => g.created_by === filterMemberId) : items
  return src
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

// ── Groupage ──────────────────────────────────────────────────────────────────

type Group = { label: string | null; items: Grocery[] }

function groupByCategory(items: Grocery[]): Group[] {
  const hasAny = items.some(g => g.category)
  if (!hasAny) return [{ label: null, items }]

  const map = new Map<string | null, Grocery[]>([[null, []]])
  for (const key of CATEGORY_ORDER) map.set(key, [])

  for (const item of items) {
    const k = item.category && CATEGORY_ORDER.includes(item.category as CategoryKey)
      ? item.category : null
    map.get(k)!.push(item)
  }

  const groups: Group[] = []
  const nullItems = map.get(null)!
  if (nullItems.length) groups.push({ label: null, items: nullItems })
  for (const key of CATEGORY_ORDER) {
    const g = map.get(key)!
    if (g.length) groups.push({ label: key, items: g })
  }
  return groups
}

function groupByStore(items: Grocery[]): Group[] {
  const hasAny = items.some(g => g.store)
  if (!hasAny) return [{ label: null, items }]

  const map = new Map<string | null, Grocery[]>([[null, []]])
  for (const item of items) {
    const k = item.store || null
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }

  const groups: Group[] = []
  const nullItems = map.get(null)!
  if (nullItems.length) groups.push({ label: null, items: nullItems })

  const names = [...map.keys()].filter((k): k is string => k !== null).sort()
  for (const name of names) groups.push({ label: name, items: map.get(name)! })
  return groups
}

// ── Composant principal ───────────────────────────────────────────────────────

type GroupMode = 'category' | 'store'

export default function GroceriesPage() {
  const {
    query, addGrocery, updateGrocery, toggleGrocery, deleteGrocery,
    clearChecked, saveCurrentList, loadSavedList, replaceWithList,
  } = useGroceries()
  useGroceriesRealtime()
  const catalog = useCatalog()
  const { showToast } = useToast()

  const [showCatalogPicker, setShowCatalogPicker] = useState(false)

  // ── Add form ────────────────────────────────────────────────────────────────
  const [newName, setNewName]           = useState('')
  const [newQty, setNewQty]             = useState('')
  const [newPrice, setNewPrice]         = useState('')
  const [newStore, setNewStore]         = useState('')
  const [formCategory, setFormCategory] = useState<string | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)

  // ── Edit modal ──────────────────────────────────────────────────────────────
  const [editingItem, setEditingItem]   = useState<Grocery | null>(null)
  const [editName, setEditName]         = useState('')
  const [editQty, setEditQty]           = useState('')
  const [editPrice, setEditPrice]       = useState('')
  const [editStore, setEditStore]       = useState('')
  const [editCategory, setEditCategory] = useState<string | null>(null)

  // ── Mode shopping ───────────────────────────────────────────────────────────
  const [shoppingMode, setShoppingMode]   = useState(false)
  const [budget, setBudget]               = useState(() => localStorage.getItem('familia-grocery-budget') ?? '')
  const [editingBudget, setEditingBudget] = useState(false)
  const [showLoadModal, setShowLoadModal] = useState(false)

  // ── Sauvegarder liste actuelle ───────────────────────────────────────────────
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveListName, setSaveListName]   = useState('')

  // ── Affichage ────────────────────────────────────────────────────────────────
  const [groupMode, setGroupMode]           = useState<GroupMode>('category')
  const [compactMode, setCompactMode]       = useState(false)
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null)

  // ── Données dérivées ────────────────────────────────────────────────────────
  const allItems       = query.data ?? []
  const checked        = sortChecked(allItems)
  const checkedItems   = allItems.filter(g => g.checked)
  const uncheckedItems = allItems.filter(g => !g.checked)

  // En mode shopping : tri auto par enseigne + filtre membre désactivé
  const effectiveGroupMode: GroupMode = shoppingMode ? 'store' : groupMode
  const uncheckedFiltered = sortUnchecked(allItems, shoppingMode ? null : filterMemberId)
  const uncheckedGroups = effectiveGroupMode === 'category'
    ? groupByCategory(uncheckedFiltered)
    : groupByStore(uncheckedFiltered)

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

  // Suggestions noms : catalogue + localStorage
  const nameOptions = useMemo(() => {
    const fromCatalog = catalog.query.data?.map(c => c.name) ?? []
    return [...new Set([...fromCatalog, ...getStoredNames()])]
  }, [catalog.query.data])

  // Suggestions enseignes : articles courants + localStorage
  const storeOptions = useMemo(() => {
    const fromQuery   = allItems.map(g => g.store).filter((s): s is string => !!s)
    const fromStorage = getStoredStores()
    return [...new Set([...fromQuery, ...fromStorage])].sort()
  }, [allItems])

  // ── Handlers ────────────────────────────────────────────────────────────────
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
    setEditName(item.name)
    setEditQty(item.quantity ?? '')
    setEditPrice(item.price !== null ? String(item.price).replace('.', ',') : '')
    setEditStore(item.store ?? '')
    setEditCategory(item.category)
  }

  function handleSaveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingItem || !editName.trim()) return
    const parsedPrice = editPrice.trim() ? parseFloat(editPrice.replace(',', '.')) : null
    const storeName = editStore.trim()
    updateGrocery.mutate({
      id: editingItem.id,
      name: editName,
      quantity: editQty || undefined,
      price: parsedPrice && parsedPrice > 0 ? parsedPrice : null,
      category: editCategory,
      store: storeName || null,
    })
    if (storeName) persistStore(storeName)
    setEditingItem(null)
  }

  function handleSaveCurrentList(e: FormEvent) {
    e.preventDefault()
    const name = saveListName.trim()
    if (!name) return
    saveCurrentList.mutate({
      name,
      items: uncheckedItems.map(g => ({
        name: g.name,
        quantity: g.quantity,
        price: g.price,
        category: g.category,
        store: g.store,
      })),
    }, {
      onSuccess: () => { setShowSaveModal(false); setSaveListName('') },
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

  function handleShoppingToggle() {
    if (!shoppingMode) {
      setShoppingMode(true)
      setShowLoadModal(true)
      setEditingBudget(false)
    } else {
      setShoppingMode(false)
    }
  }

  function handleShare() {
    const lines = uncheckedItems.map(g => {
      let line = `• ${g.name}`
      if (g.quantity) line += ` ×${g.quantity}`
      if (g.store) line += ` (${g.store})`
      return line
    })
    const text = `Liste de courses :\n${lines.join('\n')}`
    if (navigator.share) {
      navigator.share({ text }).catch(() => {/* annulé par l'utilisateur */})
    } else {
      navigator.clipboard.writeText(text).then(() => {
        showToast({ type: 'success', message: 'Liste copiée !' })
      })
    }
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
              {uncheckedItems.length > 0 && (
                <button
                  className={styles.headerIconBtn}
                  onClick={handleShare}
                  aria-label="Partager la liste"
                >
                  <Share2 size={15} strokeWidth={2.5} />
                </button>
              )}
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
              <Link to="/groceries/saved" className={styles.savedListsLink} aria-label="Mes listes">
                <Bookmark size={14} strokeWidth={2.5} />
                <span>Listes</span>
              </Link>
            </>
          )}
          {shoppingMode && (
            <button
              className={styles.loadListBtn}
              onClick={() => setShowLoadModal(true)}
              aria-label="Changer de liste"
            >
              <FolderOpen size={14} strokeWidth={2.5} />
            </button>
          )}
          <button
            className={[styles.shoppingToggle, shoppingMode ? styles.shoppingToggleActive : ''].join(' ')}
            onClick={handleShoppingToggle}
            aria-label={shoppingMode ? 'Mode édition' : 'Mode shopping'}
          >
            <ShoppingCart size={14} strokeWidth={2.5} />
            <span>{shoppingMode ? 'Éditer' : 'Shop'}</span>
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

      {/* Formulaire d'ajout — mode édition uniquement */}
      {!shoppingMode && (
        <form onSubmit={handleAdd} className={styles.addForm}>
          <div className={styles.addRow}>
            <input
              list="grocery-names-list"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Ajouter un article..."
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
              aria-label="Détails"
              tabIndex={-1}
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
                  <button type="button" className={styles.storeClear} onClick={() => setNewStore('')}>
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
      )}

      {/* Lien catalogue — mode édition */}
      {!shoppingMode && (
        <div className={styles.catalogLink}>
          <button className={styles.catalogLinkBtn} onClick={() => setShowCatalogPicker(true)}>
            📋 Depuis le catalogue
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

      {/* Toggle Rayon / Enseigne — mode édition, seulement si des enseignes existent */}
      {hasAnyStore && !shoppingMode && (
        <div className={styles.groupToggle}>
          <button
            className={[styles.groupBtn, groupMode === 'category' ? styles.groupBtnActive : ''].join(' ')}
            onClick={() => setGroupMode('category')}
          >
            Par rayon
          </button>
          <button
            className={[styles.groupBtn, groupMode === 'store' ? styles.groupBtnActive : ''].join(' ')}
            onClick={() => setGroupMode('store')}
          >
            <MapPin size={11} strokeWidth={2.5} />
            Par enseigne
          </button>
        </div>
      )}

      {query.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Spinner size={32} />
        </div>
      )}

      {!query.isLoading && allItems.length === 0 && (
        <>
          <EmptyState
            emoji="🛒"
            title={shoppingMode ? 'Aucune liste chargée' : 'La liste est vide'}
            description={shoppingMode
              ? 'Charge une liste pour commencer les courses.'
              : 'Ajoute le premier article avec le champ ci-dessus.'}
          />
          {shoppingMode && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0 16px 24px' }}>
              <button className={styles.loadListBtnLarge} onClick={() => setShowLoadModal(true)}>
                <FolderOpen size={15} strokeWidth={2.5} />
                Choisir une liste
              </button>
            </div>
          )}
        </>
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
                onToggle={() => toggleGrocery.mutate({ id: item.id, checked: true })}
                onDelete={() => deleteGrocery.mutate(item.id)}
                onEdit={() => openEdit(item)}
              />
            ))}
          </ul>
        </div>
      ))}

      {/* Articles cochés */}
      {checked.length > 0 && (
        <>
          <div className={styles.separator}>
            <span className={styles.separatorLine} />
            <span className={styles.separatorLabel}>Déjà pris</span>
            <span className={styles.separatorLine} />
            {!shoppingMode && (
              <button
                className={styles.clearBtn}
                onClick={() => clearChecked.mutate()}
                disabled={clearChecked.isPending}
              >
                Tout effacer
              </button>
            )}
          </div>
          <ul className={styles.list}>
            {checked.map(item => (
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

      {hasAnyPrice && <div style={{ height: shoppingMode ? 112 : 64 }} />}

      {/* Barre total sticky */}
      {hasAnyPrice && (
        <div className={[styles.totalBar, shoppingMode ? styles.totalBarShopping : ''].join(' ')}>
          {shoppingMode ? (
            <div className={styles.shoppingBarInner}>
              <div className={styles.shoppingBarTop}>
                <div className={styles.shoppingCartBlock}>
                  <span className={styles.shoppingCartLabel}>Panier</span>
                  <span className={styles.shoppingCartAmount}>{formatPrice(totalInCart)}</span>
                </div>
                {budgetNum ? (
                  <div className={[styles.shoppingBudgetBlock, overBudget ? styles.overBudget : ''].join(' ')}>
                    <span className={styles.shoppingBudgetLabel}>Budget</span>
                    <span className={styles.shoppingBudgetAmount}>{formatPrice(budgetNum)}</span>
                  </div>
                ) : totalLeft > 0 ? (
                  <span className={styles.shoppingRemainder}>≈ {formatPrice(totalLeft)} restant</span>
                ) : null}
              </div>
              {budgetProgress !== null && (
                <div className={styles.budgetTrack}>
                  <div
                    className={styles.budgetFill}
                    style={{ width: `${budgetProgress * 100}%`, background: overBudget ? '#c0392b' : '#5B9E8F' }}
                  />
                </div>
              )}
              <div className={styles.budgetEditRow}>
                {editingBudget ? (
                  <form onSubmit={e => { e.preventDefault(); saveBudget() }} className={styles.budgetForm}>
                    <input
                      type="text" inputMode="decimal" value={budget}
                      onChange={e => setBudget(e.target.value)}
                      placeholder="Budget en €" className={styles.budgetInput} autoFocus
                    />
                    <button type="submit" className={styles.budgetSaveBtn}>OK</button>
                    {budget && (
                      <button type="button" className={styles.budgetClearBtn} onClick={clearBudget}>Supprimer</button>
                    )}
                  </form>
                ) : (
                  <button className={styles.budgetEditBtn} onClick={() => setEditingBudget(true)}>
                    {budget ? `Budget : ${formatPrice(parseFloat(budget.replace(',', '.')))}  ✎` : '+ Définir un budget'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <span className={styles.totalLabel}>Total estimé</span>
              <span className={styles.totalAmount}>{formatPrice(totalLeft)}</span>
            </>
          )}
        </div>
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
        <SlideUpModal title="Sauvegarder comme modèle" onClose={() => { setShowSaveModal(false); setSaveListName('') }}>
          <form onSubmit={handleSaveCurrentList} className={styles.saveModalForm}>
            <p className={styles.saveModalHint}>
              {uncheckedItems.length} article{uncheckedItems.length > 1 ? 's' : ''} non coché{uncheckedItems.length > 1 ? 's' : ''} seront sauvegardés.
            </p>
            <input
              type="text"
              value={saveListName}
              onChange={e => setSaveListName(e.target.value)}
              placeholder="Nom de la liste (ex : Courses hebdo)"
              className={styles.saveModalInput}
              autoFocus
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!saveListName.trim() || saveCurrentList.isPending}
              className={styles.saveModalBtn}
            >
              {saveCurrentList.isPending ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </form>
        </SlideUpModal>
      )}

      {/* Modal — Choisir une liste (shopping) */}
      {showLoadModal && (
        <SlideUpModal title="Choisir une liste" onClose={() => setShowLoadModal(false)}>
          <LoadListModal
            currentItemCount={uncheckedItems.length}
            onClose={() => setShowLoadModal(false)}
            replaceWithList={replaceWithList}
          />
        </SlideUpModal>
      )}

      {/* Modal d'édition */}
      {editingItem && (
        <SlideUpModal title="Modifier l'article" onClose={() => setEditingItem(null)}>
          <form onSubmit={handleSaveEdit} className={styles.editForm}>

            <div className={styles.editField}>
              <label className={styles.editLabel}>Nom</label>
              <input
                type="text" value={editName} onChange={e => setEditName(e.target.value)}
                className={styles.editInput} placeholder="Ex : Pommes" autoFocus autoComplete="off" required
              />
            </div>

            <div className={styles.editRow}>
              <div className={styles.editField} style={{ flex: 1 }}>
                <label className={styles.editLabel}>Quantité</label>
                <input
                  type="text" value={editQty} onChange={e => setEditQty(e.target.value)}
                  className={styles.editInput} placeholder="Ex : 1 kg, 3…" autoComplete="off"
                />
              </div>
              <div className={styles.editField} style={{ flex: 1 }}>
                <label className={styles.editLabel}>Prix unitaire (€)</label>
                <input
                  type="text" inputMode="decimal" value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  className={styles.editInput} placeholder="Ex : 1,99" autoComplete="off"
                />
              </div>
            </div>

            <div className={styles.editField}>
              <label className={styles.editLabel}>Enseigne</label>
              <input
                type="text" value={editStore} onChange={e => setEditStore(e.target.value)}
                className={styles.editInput} placeholder="Ex : Carrefour, Bio c'bon…" autoComplete="off"
              />
              {storeOptions.length > 0 && (
                <div className={styles.storeChips} style={{ padding: 0, marginTop: 4 }}>
                  {storeOptions.map(s => (
                    <button
                      key={s} type="button"
                      className={[styles.storeChip, editStore === s ? styles.storeChipActive : ''].join(' ')}
                      onClick={() => setEditStore(x => x === s ? '' : s)}
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
                  <button
                    key={c.key} type="button"
                    className={[styles.categoryChip, editCategory === c.key ? styles.categoryChipActive : ''].join(' ')}
                    onClick={() => setEditCategory(f => f === c.key ? null : c.key)}
                  >
                    {c.emoji} {c.key}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit" disabled={!editName.trim() || updateGrocery.isPending}
              className={styles.saveBtn}
            >
              {updateGrocery.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>

          </form>
        </SlideUpModal>
      )}

    </div>
  )
}

// ── CatalogPickerModal ────────────────────────────────────────────────────────

const CATALOG_CATEGORIES = [
  { key: 'Fruits & légumes', emoji: '🥦' },
  { key: 'Frais',            emoji: '🧊' },
  { key: 'Épicerie',         emoji: '🥫' },
  { key: 'Boissons',         emoji: '🥤' },
  { key: 'Hygiène',          emoji: '🧴' },
  { key: 'Autre',            emoji: '📦' },
] as const
const CATALOG_CATEGORY_ORDER = CATALOG_CATEGORIES.map(c => c.key)

function groupCatalogByCategory(items: CatalogItem[]) {
  const hasAny = items.some(i => i.category)
  if (!hasAny) return [{ label: null as string | null, emoji: '', items }]

  const map = new Map<string | null, CatalogItem[]>([[null, []]])
  for (const key of CATALOG_CATEGORY_ORDER) map.set(key, [])
  for (const item of items) {
    const k = item.category && CATALOG_CATEGORY_ORDER.includes(item.category as any) ? item.category : null
    map.get(k)!.push(item)
  }
  const groups: { label: string | null; emoji: string; items: CatalogItem[] }[] = []
  const nullItems = map.get(null)!
  if (nullItems.length) groups.push({ label: null, emoji: '', items: nullItems })
  for (const cat of CATALOG_CATEGORIES) {
    const g = map.get(cat.key)!
    if (g.length) groups.push({ label: cat.key, emoji: cat.emoji, items: g })
  }
  return groups
}

function CatalogPickerModal({
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

// ── LoadListModal ─────────────────────────────────────────────────────────────

function LoadListModal({
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

// ── GroceryItem ───────────────────────────────────────────────────────────────

function GroceryItem({
  item, shoppingMode, compact, onToggle, onDelete, onEdit,
}: {
  item: Grocery
  shoppingMode: boolean
  compact: boolean
  onToggle: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const isOptimistic = item.id.startsWith('optimistic-')

  // Swipe vers la droite pour cocher (mode shopping uniquement)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  function handleTouchStart(e: React.TouchEvent) {
    if (!shoppingMode || item.checked) return
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!shoppingMode || !touchStartRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStartRef.current.x
    const dy = t.clientY - touchStartRef.current.y
    touchStartRef.current = null
    if (dx > 60 && dx > Math.abs(dy) * 1.5) {
      navigator.vibrate?.(50)
      onToggle()
    }
  }

  const metaParts: string[] = []
  if (!shoppingMode && item.created_by_member)
    metaParts.push(`Ajouté par ${item.created_by_member.display_name}`)
  if (item.checked && item.checked_by_member)
    metaParts.push(`coché par ${item.checked_by_member.display_name}`)

  const categoryEmoji = getCategoryEmoji(item.category)

  return (
    <li
      className={[
        styles.item,
        shoppingMode ? styles.itemShopping : '',
        compact ? styles.itemCompact : '',
        item.checked ? styles.itemChecked : '',
        isOptimistic ? styles.itemOptimistic : '',
      ].join(' ')}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >

      <button
        className={[
          styles.checkbox,
          shoppingMode ? styles.checkboxShopping : '',
          item.checked ? styles.checkboxChecked : '',
        ].join(' ')}
        onClick={() => {
          if (!item.checked) navigator.vibrate?.(50)
          onToggle()
        }}
        disabled={isOptimistic}
        aria-label={item.checked ? `Décocher ${item.name}` : `Cocher ${item.name}`}
      >
        {item.checked && <Check size={shoppingMode ? 16 : 13} strokeWidth={3} color="#fff" />}
      </button>

      <div
        className={styles.itemBody}
        onClick={shoppingMode ? undefined : onEdit}
        style={shoppingMode ? undefined : { cursor: 'pointer' }}
      >
        <div className={styles.itemNameRow}>
          {item.quantity && (
            <span className={[styles.qtyBadge, item.checked ? styles.qtyBadgeChecked : ''].join(' ')}>
              {item.quantity}
            </span>
          )}
          {categoryEmoji && (
            <span className={styles.categoryEmoji} aria-hidden="true">{categoryEmoji}</span>
          )}
          <span className={[
            styles.itemName,
            shoppingMode ? styles.itemNameShopping : '',
            item.checked ? styles.itemNameChecked : '',
          ].join(' ')}>
            {item.name}
          </span>
        </div>

        {/* Méta — masquée en mode compact */}
        {!compact && (item.store || metaParts.length > 0) && (
          <div className={styles.itemMeta}>
            {item.store && (
              <span className={[styles.storeMeta, item.checked ? styles.storeMetaChecked : ''].join(' ')}>
                <MapPin size={9} strokeWidth={2.5} />
                {item.store}
              </span>
            )}
            {item.store && metaParts.length > 0 && <span> · </span>}
            {metaParts.join(' · ')}
          </div>
        )}
      </div>

      {item.price !== null && (
        <span className={[
          styles.priceBadge,
          shoppingMode ? styles.priceBadgeShopping : '',
          item.checked ? styles.priceBadgeChecked : '',
        ].join(' ')}>
          {formatPrice(item.price)}
        </span>
      )}

      {!shoppingMode && (
        <button
          className={styles.deleteBtn}
          onClick={onDelete}
          disabled={isOptimistic}
          aria-label={`Supprimer ${item.name}`}
        >
          <Trash2 size={15} strokeWidth={2} />
        </button>
      )}

    </li>
  )
}
