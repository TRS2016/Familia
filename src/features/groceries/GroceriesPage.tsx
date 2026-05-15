import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Check, Trash2, SlidersHorizontal, ShoppingCart } from 'lucide-react'
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

function parseQtyMultiplier(qty: string | null): number {
  if (!qty) return 1
  const n = Number(qty.trim())
  return Number.isFinite(n) && n > 0 ? n : 1
}

function formatPrice(price: number): string {
  return price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function computeTotal(items: Grocery[]): number {
  return items
    .filter(g => g.price !== null)
    .reduce((sum, g) => sum + (g.price! * parseQtyMultiplier(g.quantity)), 0)
}

export default function GroceriesPage() {
  const { query, addGrocery, updateGrocery, toggleGrocery, deleteGrocery, clearChecked } = useGroceries()
  useGroceriesRealtime()

  // ── Add form ──────────────────────────────────────────────────────────────
  const [newName, setNewName]           = useState('')
  const [newQty, setNewQty]             = useState('')
  const [newPrice, setNewPrice]         = useState('')
  const [formCategory, setFormCategory] = useState<string | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)

  // ── Edit modal ────────────────────────────────────────────────────────────
  const [editingItem, setEditingItem]   = useState<Grocery | null>(null)
  const [editName, setEditName]         = useState('')
  const [editQty, setEditQty]           = useState('')
  const [editPrice, setEditPrice]       = useState('')
  const [editCategory, setEditCategory] = useState<string | null>(null)

  // ── Shopping mode ─────────────────────────────────────────────────────────
  const [shoppingMode, setShoppingMode]   = useState(false)
  const [budget, setBudget]               = useState(() => localStorage.getItem('familia-grocery-budget') ?? '')
  const [editingBudget, setEditingBudget] = useState(false)

  // ── Derived ───────────────────────────────────────────────────────────────
  const allItems     = query.data ?? []
  const unchecked    = groupUnchecked(sortUnchecked(allItems))
  const checked      = sortChecked(allItems)
  const checkedItems = allItems.filter(g => g.checked)
  const uncheckedItems = allItems.filter(g => !g.checked)

  const totalInCart  = computeTotal(checkedItems)
  const totalLeft    = computeTotal(uncheckedItems)
  const hasAnyPrice  = allItems.some(g => g.price !== null)

  const budgetNum      = budget.trim() ? parseFloat(budget.replace(',', '.')) : null
  const budgetProgress = budgetNum && budgetNum > 0 ? Math.min(1, totalInCart / budgetNum) : null
  const overBudget     = budgetNum !== null && totalInCart > budgetNum

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const parsedPrice = newPrice.trim() ? parseFloat(newPrice.replace(',', '.')) : undefined
    addGrocery.mutate({
      name,
      quantity: newQty.trim() || undefined,
      price: parsedPrice && parsedPrice > 0 ? parsedPrice : undefined,
      category: formCategory || undefined,
    })
    setNewName('')
    setNewQty('')
    setNewPrice('')
  }

  function openEdit(item: Grocery) {
    setEditingItem(item)
    setEditName(item.name)
    setEditQty(item.quantity ?? '')
    setEditPrice(item.price !== null ? String(item.price).replace('.', ',') : '')
    setEditCategory(item.category)
  }

  function handleSaveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editingItem || !editName.trim()) return
    const parsedPrice = editPrice.trim() ? parseFloat(editPrice.replace(',', '.')) : null
    updateGrocery.mutate({
      id: editingItem.id,
      name: editName,
      quantity: editQty || undefined,
      price: parsedPrice && parsedPrice > 0 ? parsedPrice : null,
      category: editCategory,
    })
    setEditingItem(null)
  }

  function saveBudget() {
    const trimmed = budget.trim()
    if (trimmed) {
      localStorage.setItem('familia-grocery-budget', trimmed)
    } else {
      localStorage.removeItem('familia-grocery-budget')
    }
    setEditingBudget(false)
  }

  function clearBudget() {
    setBudget('')
    localStorage.removeItem('familia-grocery-budget')
    setEditingBudget(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
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

      {/* Shopping progress bar */}
      {shoppingMode && allItems.length > 0 && (
        <div className={styles.shoppingProgressTrack}>
          <div
            className={styles.shoppingProgressFill}
            style={{ width: `${(checkedItems.length / allItems.length) * 100}%` }}
          />
        </div>
      )}

      {/* Add form — masqué en mode shopping */}
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

      {/* Articles non cochés — groupés par catégorie */}
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

      {/* Espace sous la barre sticky */}
      {hasAnyPrice && <div style={{ height: shoppingMode ? 112 : 64 }} />}

      {/* Barre total / shopping — sticky bas */}
      {hasAnyPrice && (
        <div className={[styles.totalBar, shoppingMode ? styles.totalBarShopping : ''].join(' ')}>

          {shoppingMode ? (
            <div className={styles.shoppingBarInner}>

              <div className={styles.shoppingBarTop}>
                {/* Panier (articles cochés) */}
                <div className={styles.shoppingCartBlock}>
                  <span className={styles.shoppingCartLabel}>Panier</span>
                  <span className={styles.shoppingCartAmount}>{formatPrice(totalInCart)}</span>
                </div>

                {/* Budget ou total restant */}
                {budgetNum ? (
                  <div className={[styles.shoppingBudgetBlock, overBudget ? styles.overBudget : ''].join(' ')}>
                    <span className={styles.shoppingBudgetLabel}>Budget</span>
                    <span className={styles.shoppingBudgetAmount}>{formatPrice(budgetNum)}</span>
                  </div>
                ) : totalLeft > 0 ? (
                  <span className={styles.shoppingRemainder}>≈ {formatPrice(totalLeft)} restant</span>
                ) : null}
              </div>

              {/* Barre de progression budget */}
              {budgetProgress !== null && (
                <div className={styles.budgetTrack}>
                  <div
                    className={styles.budgetFill}
                    style={{
                      width: `${budgetProgress * 100}%`,
                      background: overBudget ? '#c0392b' : '#5B9E8F',
                    }}
                  />
                </div>
              )}

              {/* Ligne budget */}
              <div className={styles.budgetEditRow}>
                {editingBudget ? (
                  <form
                    onSubmit={e => { e.preventDefault(); saveBudget() }}
                    className={styles.budgetForm}
                  >
                    <input
                      type="text"
                      inputMode="decimal"
                      value={budget}
                      onChange={e => setBudget(e.target.value)}
                      placeholder="Budget en €"
                      className={styles.budgetInput}
                      autoFocus
                    />
                    <button type="submit" className={styles.budgetSaveBtn}>OK</button>
                    {budget && (
                      <button type="button" className={styles.budgetClearBtn} onClick={clearBudget}>
                        Supprimer
                      </button>
                    )}
                  </form>
                ) : (
                  <button className={styles.budgetEditBtn} onClick={() => setEditingBudget(true)}>
                    {budget
                      ? `Budget : ${formatPrice(parseFloat(budget.replace(',', '.')))}  ✎`
                      : '+ Définir un budget'}
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
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className={styles.editInput}
                placeholder="Ex : Pommes"
                autoFocus
                autoComplete="off"
                required
              />
            </div>

            <div className={styles.editRow}>
              <div className={styles.editField} style={{ flex: 1 }}>
                <label className={styles.editLabel}>Quantité</label>
                <input
                  type="text"
                  value={editQty}
                  onChange={e => setEditQty(e.target.value)}
                  className={styles.editInput}
                  placeholder="Ex : 1 kg, 3…"
                  autoComplete="off"
                />
              </div>
              <div className={styles.editField} style={{ flex: 1 }}>
                <label className={styles.editLabel}>Prix unitaire (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  className={styles.editInput}
                  placeholder="Ex : 1,99"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className={styles.editField}>
              <span className={styles.editLabel}>Rayon</span>
              <div className={styles.categoryChips} style={{ padding: 0 }}>
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
            </div>

            <button
              type="submit"
              disabled={!editName.trim() || updateGrocery.isPending}
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

function GroceryItem({
  item,
  shoppingMode,
  onToggle,
  onDelete,
  onEdit,
}: {
  item: Grocery
  shoppingMode: boolean
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
        {!shoppingMode && metaParts.length > 0 && (
          <div className={styles.itemMeta}>{metaParts.join(' · ')}</div>
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
