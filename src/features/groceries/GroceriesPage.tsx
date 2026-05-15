import { useState, useMemo } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Check, Trash2, SlidersHorizontal, ShoppingCart, MapPin } from 'lucide-react'
import { useGroceries } from './useGroceries'
import { useGroceriesRealtime } from './useGroceriesRealtime'
import type { Grocery } from './useGroceries'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
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

// ── Utilitaires ───────────────────────────────────────────────────────────────

function getCategoryEmoji(key: string): string {
  return CATEGORIES.find(c => c.key === key)?.emoji ?? '📦'
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

// ── Tri ───────────────────────────────────────────────────────────────────────

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
  const { query, addGrocery, updateGrocery, toggleGrocery, deleteGrocery, clearChecked } = useGroceries()
  useGroceriesRealtime()

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

  // ── Groupage ────────────────────────────────────────────────────────────────
  const [groupMode, setGroupMode] = useState<GroupMode>('category')

  // ── Données dérivées ────────────────────────────────────────────────────────
  const allItems     = query.data ?? []
  const checked      = sortChecked(allItems)
  const checkedItems = allItems.filter(g => g.checked)
  const uncheckedItems = allItems.filter(g => !g.checked)

  const uncheckedGroups = groupMode === 'category'
    ? groupByCategory(sortUnchecked(allItems))
    : groupByStore(sortUnchecked(allItems))

  const hasAnyStore = allItems.some(g => g.store)
  const hasAnyPrice = allItems.some(g => g.price !== null)

  const totalInCart = computeTotal(checkedItems)
  const totalLeft   = computeTotal(uncheckedItems)
  const budgetNum   = budget.trim() ? parseFloat(budget.replace(',', '.')) : null
  const budgetProgress = budgetNum && budgetNum > 0 ? Math.min(1, totalInCart / budgetNum) : null
  const overBudget  = budgetNum !== null && totalInCart > budgetNum

  // Suggestions d'enseignes : union des valeurs courantes + localStorage
  const storeOptions = useMemo(() => {
    const fromQuery = allItems.map(g => g.store).filter((s): s is string => !!s)
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
    if (storeName) persistStore(storeName)
    setNewName('')
    setNewQty('')
    setNewPrice('')
    // Garde store + catégorie pour ajouts en série dans le même magasin
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

        <button
          className={[styles.shoppingToggle, shoppingMode ? styles.shoppingToggleActive : ''].join(' ')}
          onClick={() => { setShoppingMode(m => !m); setEditingBudget(false) }}
          aria-label={shoppingMode ? 'Retour à la liste' : 'Mode shopping'}
        >
          <ShoppingCart size={14} strokeWidth={2.5} />
          <span>{shoppingMode ? 'Liste' : 'Shop'}</span>
        </button>
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

      {/* Formulaire d'ajout — masqué en mode shopping */}
      {!shoppingMode && (
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

      {/* Toggle Rayon / Enseigne — affiché dès qu'il y a au moins une enseigne */}
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
        <EmptyState
          emoji="🛒"
          title="La liste est vide"
          description="Ajoute le premier article avec le champ ci-dessus."
        />
      )}

      {/* Articles non cochés */}
      {uncheckedGroups.map(group => (
        <div key={group.label ?? '__none'}>
          {group.label && (
            <div className={[styles.categoryHeader, groupMode === 'store' ? styles.storeHeader : ''].join(' ')}>
              {groupMode === 'store'
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
                onToggle={() => toggleGrocery.mutate({ id: item.id, checked: false })}
                onDelete={() => deleteGrocery.mutate(item.id)}
                onEdit={() => openEdit(item)}
              />
            ))}
          </ul>
        </>
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

// ── GroceryItem ───────────────────────────────────────────────────────────────

function GroceryItem({
  item, shoppingMode, onToggle, onDelete, onEdit,
}: {
  item: Grocery
  shoppingMode: boolean
  onToggle: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const isOptimistic = item.id.startsWith('optimistic-')

  const metaParts: string[] = []
  if (!shoppingMode && item.created_by_member)
    metaParts.push(`Ajouté par ${item.created_by_member.display_name}`)
  if (item.checked && item.checked_by_member)
    metaParts.push(`coché par ${item.checked_by_member.display_name}`)

  return (
    <li className={[
      styles.item,
      shoppingMode ? styles.itemShopping : '',
      item.checked ? styles.itemChecked : '',
      isOptimistic ? styles.itemOptimistic : '',
    ].join(' ')}>

      <button
        className={[
          styles.checkbox,
          shoppingMode ? styles.checkboxShopping : '',
          item.checked ? styles.checkboxChecked : '',
        ].join(' ')}
        onClick={onToggle}
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
          <span className={[
            styles.itemName,
            shoppingMode ? styles.itemNameShopping : '',
            item.checked ? styles.itemNameChecked : '',
          ].join(' ')}>
            {item.name}
          </span>
        </div>

        {/* Enseigne + meta */}
        {(item.store || metaParts.length > 0) && (
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
