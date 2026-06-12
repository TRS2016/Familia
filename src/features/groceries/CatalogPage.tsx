import { useState, useRef } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Pencil, MapPin, Download, Upload } from 'lucide-react'
import { useCatalog } from './useCatalog'
import type { CatalogItem } from './useCatalog'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import { parseCatalogCsv, downloadBlob, type CatalogCsvRow } from './catalogCsv'
import { catalogToXlsxBlob, parseCatalogXlsx } from './catalogXlsx'
import { format } from 'date-fns'
import { CATEGORIES, CATEGORY_ORDER, getCategoryEmoji, formatPrice } from './groceries.utils'
import type { CategoryKey } from './groceries.utils'
import styles from './CatalogPage.module.css'

// ── Groupage par catégorie ────────────────────────────────────────────────────

type Group = { label: string | null; emoji: string; items: CatalogItem[] }

function groupByCategory(items: CatalogItem[]): Group[] {
  const hasAny = items.some(i => i.category)
  if (!hasAny) return [{ label: null, emoji: '', items }]

  const map = new Map<string | null, CatalogItem[]>([[null, []]])
  for (const key of CATEGORY_ORDER) map.set(key, [])

  for (const item of items) {
    const k = item.category && CATEGORY_ORDER.includes(item.category as CategoryKey)
      ? item.category : null
    map.get(k)!.push(item)
  }

  const groups: Group[] = []
  const nullItems = map.get(null)!
  if (nullItems.length) groups.push({ label: null, emoji: '', items: nullItems })
  for (const key of CATEGORY_ORDER) {
    const g = map.get(key)!
    if (g.length) groups.push({ label: key, emoji: getCategoryEmoji(key), items: g })
  }
  return groups
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function CatalogPage() {
  const { query, addItem, updateItem, deleteItem, replaceCatalog } = useCatalog()

  // ── Import / export CSV ──
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<CatalogCsvRow[] | null>(null)

  const [showAddModal, setShowAddModal]   = useState(false)
  const [editingItem, setEditingItem]     = useState<CatalogItem | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Champs formulaire ajout
  const [addName, setAddName]         = useState('')
  const [addPrice, setAddPrice]       = useState('')
  const [addQty, setAddQty]           = useState('')
  const [addStore, setAddStore]       = useState('')
  const [addCategory, setAddCategory] = useState<string | null>(null)

  // Champs formulaire édition
  const [editName, setEditName]         = useState('')
  const [editPrice, setEditPrice]       = useState('')
  const [editQty, setEditQty]           = useState('')
  const [editStore, setEditStore]       = useState('')
  const [editCategory, setEditCategory] = useState<string | null>(null)

  const items  = query.data ?? []
  const groups = groupByCategory(items)

  function resetAddForm() {
    setAddName(''); setAddPrice(''); setAddQty(''); setAddStore(''); setAddCategory(null)
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const name = addName.trim()
    if (!name) return
    const price = addPrice.trim() ? parseFloat(addPrice.replace(',', '.')) : null
    addItem.mutate({
      name,
      price: price && price > 0 ? price : null,
      quantity: addQty.trim() || null,
      category: addCategory || null,
      store: addStore.trim() || null,
    }, {
      onSuccess: () => { setShowAddModal(false); resetAddForm() },
    })
  }

  function openEdit(item: CatalogItem) {
    setEditingItem(item)
    setEditName(item.name)
    setEditPrice(item.price !== null ? String(item.price).replace('.', ',') : '')
    setEditQty(item.quantity ?? '')
    setEditStore(item.store ?? '')
    setEditCategory(item.category)
  }

  function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingItem || !editName.trim()) return
    const price = editPrice.trim() ? parseFloat(editPrice.replace(',', '.')) : null
    updateItem.mutate({
      id: editingItem.id,
      name: editName,
      price: price && price > 0 ? price : null,
      quantity: editQty.trim() || null,
      category: editCategory,
      store: editStore.trim() || null,
    }, {
      onSuccess: () => setEditingItem(null),
    })
  }

  async function handleExport() {
    if (items.length === 0) return
    const blob = await catalogToXlsxBlob(items)
    downloadBlob(`catalogue-courses-${format(new Date(), 'yyyy-MM-dd')}.xlsx`, blob)
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de re-sélectionner le même fichier
    if (!file) return
    try {
      const rows = file.name.toLowerCase().endsWith('.xlsx')
        ? await parseCatalogXlsx(await file.arrayBuffer())
        : parseCatalogCsv(await file.text())
      setPendingImport(rows)
    } catch {
      setPendingImport([])
    }
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <Link to="/groceries/saved" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Catalogue</h1>
        <div className={styles.headerActions}>
          <button
            className={styles.headerIconBtn}
            onClick={handleExport}
            disabled={items.length === 0}
            aria-label="Exporter le catalogue en Excel"
            title="Exporter en Excel (.xlsx)"
          >
            <Download size={17} strokeWidth={2.5} />
          </button>
          <button
            className={styles.headerIconBtn}
            onClick={() => fileRef.current?.click()}
            aria-label="Importer un catalogue Excel ou CSV"
            title="Importer un fichier Excel ou CSV"
          >
            <Upload size={17} strokeWidth={2.5} />
          </button>
          <button
            className={styles.addBtn}
            onClick={() => setShowAddModal(true)}
            aria-label="Ajouter un article"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        style={{ display: 'none' }}
        onChange={handleFile}
      />

      {query.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Spinner size={32} />
        </div>
      )}

      {!query.isLoading && items.length === 0 && (
        <EmptyState
          emoji="📋"
          title="Catalogue vide"
          description="Ajoute tes articles habituels avec leur prix pour les retrouver facilement."
        />
      )}

      {groups.map(group => (
        <div key={group.label ?? '__none'}>
          {group.label && (
            <div className={styles.categoryHeader}>
              {group.emoji} {group.label}
            </div>
          )}
          <ul className={styles.list}>
            {group.items.map(item => (
              <li key={item.id} className={styles.item}>
                <button className={styles.itemBody} onClick={() => openEdit(item)}>
                  <div className={styles.itemMain}>
                    <span className={styles.itemName}>{item.name}</span>
                    {item.quantity && (
                      <span className={styles.itemQty}>{item.quantity}</span>
                    )}
                  </div>
                  <div className={styles.itemMeta}>
                    {item.store && (
                      <span className={styles.itemStore}>
                        <MapPin size={9} strokeWidth={2.5} />
                        {item.store}
                      </span>
                    )}
                  </div>
                </button>

                <div className={styles.itemRight}>
                  {item.price !== null && (
                    <span className={styles.priceBadge}>{formatPrice(item.price)}</span>
                  )}
                  <button
                    className={styles.editBtn}
                    onClick={() => openEdit(item)}
                    aria-label={`Modifier ${item.name}`}
                  >
                    <Pencil size={14} strokeWidth={2} />
                  </button>
                  {deleteConfirm === item.id ? (
                    <button
                      className={styles.deleteConfirmBtn}
                      onClick={() => { deleteItem.mutate(item.id); setDeleteConfirm(null) }}
                    >
                      Supprimer ?
                    </button>
                  ) : (
                    <button
                      className={styles.deleteBtn}
                      onClick={() => setDeleteConfirm(item.id)}
                      aria-label={`Supprimer ${item.name}`}
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Modal — Ajouter un article */}
      {showAddModal && (
        <SlideUpModal
          title="Nouvel article"
          onClose={() => { setShowAddModal(false); resetAddForm() }}
        >
          <form onSubmit={handleAdd} className={styles.modalForm}>
            <div className={styles.field}>
              <label htmlFor="catalog-add-name" className={styles.fieldLabel}>Nom *</label>
              <input
                id="catalog-add-name"
                type="text" value={addName} onChange={e => setAddName(e.target.value)}
                className={styles.input} placeholder="Ex : Lait entier" autoFocus autoComplete="off" required
              />
            </div>

            <div className={styles.row}>
              <div className={styles.field} style={{ flex: 1 }}>
                <label htmlFor="catalog-add-price" className={styles.fieldLabel}>Prix (€)</label>
                <input
                  id="catalog-add-price"
                  type="text" inputMode="decimal" value={addPrice}
                  onChange={e => setAddPrice(e.target.value)}
                  className={styles.input} placeholder="Ex : 1,99" autoComplete="off"
                />
              </div>
              <div className={styles.field} style={{ flex: 1 }}>
                <label htmlFor="catalog-add-qty" className={styles.fieldLabel}>Quantité par défaut</label>
                <input
                  id="catalog-add-qty"
                  type="text" value={addQty} onChange={e => setAddQty(e.target.value)}
                  className={styles.input} placeholder="Ex : 1 kg, 6…" autoComplete="off"
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="catalog-add-store" className={styles.fieldLabel}>Enseigne habituelle</label>
              <input
                id="catalog-add-store"
                type="text" value={addStore} onChange={e => setAddStore(e.target.value)}
                className={styles.input} placeholder="Ex : Carrefour, Bio c'bon…" autoComplete="off"
              />
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Rayon</span>
              <div className={styles.categoryChips}>
                {CATEGORIES.map(c => (
                  <button
                    key={c.key} type="button"
                    className={[styles.chip, addCategory === c.key ? styles.chipActive : ''].join(' ')}
                    onClick={() => setAddCategory(f => f === c.key ? null : c.key)}
                  >
                    {c.emoji} {c.key}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!addName.trim() || addItem.isPending}
              className={styles.submitBtn}
            >
              {addItem.isPending ? 'Ajout…' : 'Ajouter au catalogue'}
            </button>
          </form>
        </SlideUpModal>
      )}

      {/* Modal — Éditer un article */}
      {editingItem && (
        <SlideUpModal title="Modifier l'article" onClose={() => setEditingItem(null)}>
          <form onSubmit={handleSaveEdit} className={styles.modalForm}>
            <div className={styles.field}>
              <label htmlFor="catalog-edit-name" className={styles.fieldLabel}>Nom *</label>
              <input
                id="catalog-edit-name"
                type="text" value={editName} onChange={e => setEditName(e.target.value)}
                className={styles.input} placeholder="Ex : Lait entier" autoFocus autoComplete="off" required
              />
            </div>

            <div className={styles.row}>
              <div className={styles.field} style={{ flex: 1 }}>
                <label htmlFor="catalog-edit-price" className={styles.fieldLabel}>Prix (€)</label>
                <input
                  id="catalog-edit-price"
                  type="text" inputMode="decimal" value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  className={styles.input} placeholder="Ex : 1,99" autoComplete="off"
                />
              </div>
              <div className={styles.field} style={{ flex: 1 }}>
                <label htmlFor="catalog-edit-qty" className={styles.fieldLabel}>Quantité par défaut</label>
                <input
                  id="catalog-edit-qty"
                  type="text" value={editQty} onChange={e => setEditQty(e.target.value)}
                  className={styles.input} placeholder="Ex : 1 kg, 6…" autoComplete="off"
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="catalog-edit-store" className={styles.fieldLabel}>Enseigne habituelle</label>
              <input
                id="catalog-edit-store"
                type="text" value={editStore} onChange={e => setEditStore(e.target.value)}
                className={styles.input} placeholder="Ex : Carrefour, Bio c'bon…" autoComplete="off"
              />
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Rayon</span>
              <div className={styles.categoryChips}>
                {CATEGORIES.map(c => (
                  <button
                    key={c.key} type="button"
                    className={[styles.chip, editCategory === c.key ? styles.chipActive : ''].join(' ')}
                    onClick={() => setEditCategory(f => f === c.key ? null : c.key)}
                  >
                    {c.emoji} {c.key}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!editName.trim() || updateItem.isPending}
              className={styles.submitBtn}
            >
              {updateItem.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        </SlideUpModal>
      )}

      {/* Modal — Confirmer l'import CSV (remplace tout le catalogue) */}
      {pendingImport !== null && (
        <SlideUpModal title="Importer le catalogue" onClose={() => setPendingImport(null)}>
          <div className={styles.importBody}>
            {pendingImport.length === 0 ? (
              <p className={styles.importWarn}>
                Aucune ligne valide trouvée. Vérifie le format : fichier Excel (.xlsx) ou CSV, colonnes
                <strong> nom ; prix ; quantité ; catégorie ; magasin</strong> (la 1re ligne d'en-tête est ignorée).
              </p>
            ) : (
              <>
                <p className={styles.importSummary}>
                  <strong>{pendingImport.length}</strong> article{pendingImport.length > 1 ? 's' : ''} dans le fichier.
                  {items.length > 0 && (
                    <> Cela <strong>remplacera</strong> les {items.length} article{items.length > 1 ? 's' : ''} actuels.</>
                  )}
                </p>
                <ul className={styles.importPreview}>
                  {pendingImport.slice(0, 6).map((r, i) => (
                    <li key={i}>
                      <span>{r.name}</span>
                      {r.price != null && <span className={styles.importPrice}>{formatPrice(r.price)}</span>}
                    </li>
                  ))}
                  {pendingImport.length > 6 && (
                    <li className={styles.importMore}>+{pendingImport.length - 6} autres…</li>
                  )}
                </ul>
                <button
                  className={styles.submitBtn}
                  disabled={replaceCatalog.isPending}
                  onClick={() => replaceCatalog.mutate(pendingImport, { onSuccess: () => setPendingImport(null) })}
                >
                  {replaceCatalog.isPending
                    ? 'Import…'
                    : `Remplacer par ces ${pendingImport.length} article${pendingImport.length > 1 ? 's' : ''}`}
                </button>
              </>
            )}
            <button className={styles.importCancel} onClick={() => setPendingImport(null)}>
              Annuler
            </button>
          </div>
        </SlideUpModal>
      )}

    </div>
  )
}
