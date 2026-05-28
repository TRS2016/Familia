import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Check, Copy, ChevronRight, Pencil, X, Share2, Link as LinkIcon, Send } from 'lucide-react'
import { useSavedLists, useSavedListDetail } from './useSavedLists'
import type { SavedItem } from './useSavedLists'
import { useGroceries } from './useGroceries'
import { useShareToken } from './useShareToken'
import { useToast } from '../../components/useToast'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import styles from './SavedListsPage.module.css'
import { supabase } from '../../lib/supabase'

// ── Page index ────────────────────────────────────────────────────────────────

export default function SavedListsPage() {
  const { query, createList, deleteList } = useSavedLists()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newListName, setNewListName] = useState('')

  const lists = query.data ?? []

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    const name = newListName.trim()
    if (!name) return
    createList.mutate({ name }, {
      onSuccess: (list) => {
        setCreating(false)
        setNewListName('')
        setSelectedId(list.id)
      },
    })
  }

  if (selectedId) {
    const list = lists.find(l => l.id === selectedId)
    return (
      <ListDetailView
        listId={selectedId}
        listName={list?.name ?? ''}
        onBack={() => setSelectedId(null)}
      />
    )
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <Link to="/groceries" className={styles.backLink} aria-label="Retour aux courses">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Mes listes</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link
            to="/groceries/catalog"
            style={{
              fontSize: 12, fontWeight: 800, color: 'var(--text-muted)',
              border: '1.5px solid var(--border)', borderRadius: 'var(--radius-pill)',
              padding: '4px 10px', textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            📋 Catalogue
          </Link>
          <button
            className={styles.createBtn}
            onClick={() => setCreating(true)}
            aria-label="Nouvelle liste"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {query.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Spinner size={32} />
        </div>
      )}

      {!query.isLoading && lists.length === 0 && (
        <EmptyState
          emoji="📋"
          title="Aucune liste sauvegardée"
          description="Crée ta première liste modèle avec le bouton + ci-dessus."
        />
      )}

      <ul className={styles.listIndex}>
        {lists.map(list => (
          <li key={list.id} className={styles.listRow}>
            <button className={styles.listRowMain} onClick={() => setSelectedId(list.id)}>
              <div className={styles.listRowInfo}>
                <span className={styles.listName}>{list.name}</span>
                <span className={styles.listMeta}>
                  {list.item_count} article{list.item_count !== 1 ? 's' : ''}
                </span>
              </div>
              <ChevronRight size={16} strokeWidth={2} color="var(--text-muted)" />
            </button>
            <button
              className={styles.listDeleteBtn}
              onClick={() => {
                if (confirm(`Supprimer "${list.name}" ?`)) deleteList.mutate(list.id)
              }}
              aria-label={`Supprimer ${list.name}`}
            >
              <Trash2 size={15} strokeWidth={2} />
            </button>
          </li>
        ))}
      </ul>

      {/* Modal création */}
      {creating && (
        <SlideUpModal title="Nouvelle liste" onClose={() => { setCreating(false); setNewListName('') }}>
          <form onSubmit={handleCreate} className={styles.createForm}>
            <input
              type="text"
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              placeholder="Ex : Courses hebdo, Bio du dimanche…"
              className={styles.nameInput}
              autoFocus
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!newListName.trim() || createList.isPending}
              className={styles.submitBtn}
            >
              {createList.isPending ? 'Création…' : 'Créer et ajouter des articles'}
            </button>
          </form>
        </SlideUpModal>
      )}

    </div>
  )
}

// ── Vue détail / édition d'une liste ─────────────────────────────────────────

function ListDetailView({
  listId, listName, onBack,
}: {
  listId: string
  listName: string
  onBack: () => void
}) {
  const { renameList, duplicateList, query: listsQuery } = useSavedLists()
  const { query, addItem, updateItem, deleteItem, moveItem } = useSavedListDetail(listId)
  const otherLists = (listsQuery.data ?? []).filter(l => l.id !== listId)
  const { loadSavedList } = useGroceries()
  const shareToken = useShareToken(listId)
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [name, setName] = useState(listName)
  const [editingName, setEditingName] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showNotifyModal, setShowNotifyModal] = useState(false)
  const [notifyMessage, setNotifyMessage] = useState('')
  const [notifying, setNotifying] = useState(false)

  const [newItemName, setNewItemName] = useState('')
  const [editingItem, setEditingItem] = useState<SavedItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editQty, setEditQty] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editStore, setEditStore] = useState('')

  const items = query.data ?? []

  function handleRename(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    renameList.mutate({ id: listId, name: trimmed }, { onSuccess: () => setEditingName(false) })
  }

  function handleAddItem(e: FormEvent) {
    e.preventDefault()
    const n = newItemName.trim()
    if (!n) return
    addItem.mutate({ name: n, quantity: null, price: null, category: null, store: null }, {
      onSuccess: () => setNewItemName(''),
    })
  }

  function openEdit(item: SavedItem) {
    setEditingItem(item)
    setEditName(item.name)
    setEditQty(item.quantity ?? '')
    setEditPrice(item.price !== null ? String(item.price).replace('.', ',') : '')
    setEditCategory(item.category ?? '')
    setEditStore(item.store ?? '')
  }

  function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingItem || !editName.trim()) return
    const parsedPrice = editPrice.trim() ? parseFloat(editPrice.replace(',', '.')) : null
    updateItem.mutate({
      id: editingItem.id,
      name: editName.trim(),
      quantity: editQty.trim() || null,
      price: parsedPrice && parsedPrice > 0 ? parsedPrice : null,
      category: editCategory.trim() || null,
      store: editStore.trim() || null,
    }, { onSuccess: () => setEditingItem(null) })
  }

  function handleLoad() {
    loadSavedList.mutate(items, {
      onSuccess: () => navigate('/groceries'),
    })
  }

  async function handleCreateShareLink() {
    const result = await shareToken.create.mutateAsync()
    const url = `${window.location.origin}/share/${result.token}`
    if (navigator.share) {
      navigator.share({ url, title: name }).catch(() => {
        navigator.clipboard.writeText(url)
        showToast({ type: 'success', message: 'Lien copié !' })
      })
    } else {
      navigator.clipboard.writeText(url)
      showToast({ type: 'success', message: 'Lien copié !' })
    }
  }

  async function handleNotifyList(message: string) {
    if (items.length === 0 || notifying) return
    setNotifying(true)
    try {
      const names = items.slice(0, 3).map(i => i.name)
      const extra = items.length > 3 ? ` +${items.length - 3}` : ''
      const articleStr = names.join(', ') + extra
      const body = message.trim() ? `${message.trim()} — ${articleStr}` : articleStr
      await supabase.functions.invoke('notify-household', {
        body: { title: name, body, module: 'groceries' },
      })
      showToast({ type: 'success', message: 'Notification envoyée.' })
    } finally {
      setNotifying(false)
    }
  }

  function handleDuplicate() {
    duplicateList.mutate(
      { id: listId, name: `${name} (copie)` },
      { onSuccess: () => onBack() },
    )
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <button className={styles.backLink} onClick={onBack} aria-label="Retour aux listes">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </button>

        {editingName ? (
          <form onSubmit={handleRename} className={styles.renameForm}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className={styles.renameInput}
              autoFocus
              onBlur={() => { setEditingName(false); setName(listName) }}
            />
            <button type="submit" className={styles.renameOk}>
              <Check size={16} strokeWidth={3} />
            </button>
          </form>
        ) : (
          <button className={styles.titleBtn} onClick={() => setEditingName(true)}>
            <h1 className={styles.pageTitle}>{name}</h1>
            <Pencil size={13} strokeWidth={2.5} color="var(--text-muted)" />
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: items.length === 0 ? 'var(--text-disabled, #ccc)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
            onClick={() => setShowNotifyModal(true)}
            disabled={items.length === 0}
            aria-label="Envoyer la liste par notification"
          >
            <Send size={17} strokeWidth={2.5} />
          </button>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
            onClick={() => setShowShareModal(true)}
            aria-label="Partager la liste"
          >
            <Share2 size={18} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* Formulaire ajout rapide */}
      <form onSubmit={handleAddItem} className={styles.addForm}>
        <div className={styles.addRow}>
          <input
            type="text"
            value={newItemName}
            onChange={e => setNewItemName(e.target.value)}
            placeholder="Ajouter un article…"
            className={styles.addInput}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!newItemName.trim() || addItem.isPending}
            className={styles.addBtn}
            aria-label="Ajouter"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </form>

      {query.isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
          <Spinner size={28} />
        </div>
      )}

      {!query.isLoading && items.length === 0 && (
        <EmptyState
          emoji="🛒"
          title="Liste vide"
          description="Ajoute des articles pour construire ce modèle."
        />
      )}

      <ul className={styles.itemList}>
        {items.map(item => (
          <li key={item.id} className={styles.itemRow}>
            <button className={styles.itemMain} onClick={() => openEdit(item)}>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{item.name}</span>
                <div className={styles.itemMeta}>
                  {item.quantity && <span>{item.quantity}</span>}
                  {item.price !== null && (
                    <span>{item.price.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span>
                  )}
                  {item.store && <span>📍 {item.store}</span>}
                  {item.category && <span>{item.category}</span>}
                </div>
              </div>
              <Pencil size={13} strokeWidth={2} color="var(--text-muted)" />
            </button>
            <button
              className={styles.itemDeleteBtn}
              onClick={() => deleteItem.mutate(item.id)}
              aria-label={`Supprimer ${item.name}`}
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </li>
        ))}
      </ul>

      {/* Actions */}
      <div className={styles.actions}>
        <button
          className={styles.actionLoad}
          onClick={handleLoad}
          disabled={items.length === 0 || loadSavedList.isPending}
        >
          {loadSavedList.isPending ? 'Chargement…' : `Ajouter à la liste active (${items.length} articles)`}
        </button>
        <button className={styles.actionDuplicate} onClick={handleDuplicate} disabled={duplicateList.isPending}>
          <Copy size={14} strokeWidth={2.5} />
          Dupliquer cette liste
        </button>
      </div>

      {/* Modal — Envoyer la liste par notification */}
      {showNotifyModal && (
        <SlideUpModal
          title="Envoyer la liste"
          onClose={() => { setShowNotifyModal(false); setNotifyMessage('') }}
        >
          <div className={styles.notifyForm}>
            <p className={styles.notifyArticles}>
              {items.slice(0, 3).map(i => i.name).join(', ')}
              {items.length > 3 && ` +${items.length - 3} article${items.length - 3 > 1 ? 's' : ''}`}
            </p>
            <textarea
              className={styles.notifyTextarea}
              value={notifyMessage}
              onChange={e => setNotifyMessage(e.target.value)}
              placeholder="Ajouter un message… ex : tu peux t'occuper de ça ?"
              rows={3}
              autoFocus
            />
            <button
              className={styles.notifySendBtn}
              disabled={notifying}
              onClick={async () => {
                await handleNotifyList(notifyMessage)
                setShowNotifyModal(false)
                setNotifyMessage('')
              }}
            >
              {notifying ? 'Envoi…' : 'Envoyer la notification'}
            </button>
          </div>
        </SlideUpModal>
      )}

      {/* Modal partage */}
      {showShareModal && (() => {
        const shareUrl = shareToken.query.data
          ? `${window.location.origin}/share/${shareToken.query.data.token}`
          : null
        return (
          <SlideUpModal title="Partager la liste" onClose={() => setShowShareModal(false)}>
            <div style={{ padding: '0 20px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                Génère un lien valable 7 jours pour partager « {name} » en lecture seule, sans compte requis.
              </p>
              {shareUrl ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', border: '1px solid var(--border)' }}>
                    <LinkIcon size={13} strokeWidth={2.5} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text)', wordBreak: 'break-all', flex: 1 }}>{shareUrl}</span>
                  </div>
                  <button
                    className={styles.saveBtn}
                    onClick={() => { navigator.clipboard.writeText(shareUrl); showToast({ type: 'success', message: 'Lien copié !' }) }}
                  >
                    Copier le lien
                  </button>
                  <button
                    className={styles.actionDuplicate}
                    onClick={() => handleCreateShareLink()}
                    disabled={shareToken.create.isPending}
                  >
                    Regénérer le lien
                  </button>
                  <button
                    className={styles.deleteItemBtn}
                    onClick={() => { shareToken.revoke.mutate(); setShowShareModal(false) }}
                    disabled={shareToken.revoke.isPending}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Trash2 size={13} strokeWidth={2.5} />
                    Révoquer l'accès
                  </button>
                </>
              ) : (
                <button
                  className={styles.saveBtn}
                  onClick={() => handleCreateShareLink()}
                  disabled={shareToken.create.isPending}
                >
                  {shareToken.create.isPending ? 'Création…' : 'Créer le lien'}
                </button>
              )}
            </div>
          </SlideUpModal>
        )
      })()}

      {/* Modal édition article */}
      {editingItem && (
        <SlideUpModal title="Modifier l'article" onClose={() => setEditingItem(null)}>
          <form onSubmit={handleSaveEdit} className={styles.editForm}>

            <div className={styles.editField}>
              <label className={styles.editLabel}>Nom</label>
              <input
                type="text" value={editName} onChange={e => setEditName(e.target.value)}
                className={styles.editInput} placeholder="Ex : Pommes" autoFocus required
              />
            </div>

            <div className={styles.editRow}>
              <div className={styles.editField} style={{ flex: 1 }}>
                <label className={styles.editLabel}>Quantité</label>
                <input
                  type="text" value={editQty} onChange={e => setEditQty(e.target.value)}
                  className={styles.editInput} placeholder="Ex : 1 kg, 3…"
                />
              </div>
              <div className={styles.editField} style={{ flex: 1 }}>
                <label className={styles.editLabel}>Prix unitaire (€)</label>
                <input
                  type="text" inputMode="decimal" value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  className={styles.editInput} placeholder="Ex : 1,99"
                />
              </div>
            </div>

            <div className={styles.editRow}>
              <div className={styles.editField} style={{ flex: 1 }}>
                <label className={styles.editLabel}>Enseigne</label>
                <input
                  type="text" value={editStore} onChange={e => setEditStore(e.target.value)}
                  className={styles.editInput} placeholder="Ex : Carrefour"
                />
              </div>
              <div className={styles.editField} style={{ flex: 1 }}>
                <label className={styles.editLabel}>Rayon</label>
                <input
                  type="text" value={editCategory} onChange={e => setEditCategory(e.target.value)}
                  className={styles.editInput} placeholder="Ex : Frais"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!editName.trim() || updateItem.isPending}
              className={styles.saveBtn}
            >
              {updateItem.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>

            <button
              type="button"
              className={styles.deleteItemBtn}
              onClick={() => { deleteItem.mutate(editingItem.id); setEditingItem(null) }}
            >
              Supprimer cet article
            </button>

            {otherLists.length > 0 && (
              <div className={styles.moveSection}>
                <span className={styles.moveSectionLabel}>Déplacer vers</span>
                <div className={styles.moveChips}>
                  {otherLists.map(list => (
                    <button
                      key={list.id}
                      type="button"
                      className={styles.moveChip}
                      disabled={moveItem.isPending}
                      onClick={() => moveItem.mutate(
                        { item: editingItem, toListId: list.id },
                        { onSuccess: () => setEditingItem(null) },
                      )}
                    >
                      {list.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

          </form>
        </SlideUpModal>
      )}


    </div>
  )
}
