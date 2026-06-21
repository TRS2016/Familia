import { useRef, useState } from 'react'
import { Camera, Images, Check, Loader2 } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import { useToast } from '../../components/useToast'
import { useCatalog } from './useCatalog'
import type { CatalogItem } from './useCatalog'
import { useParseReceipt } from './useParseReceipt'
import type { ParsedReceiptItem } from './useParseReceipt'
import { CATEGORIES } from './groceries.utils'
import styles from './CatalogPage.module.css'

// Scan d'un ticket → extraction IA → écran de confirmation éditable → ajout au
// catalogue. On n'écrit jamais en aveugle : l'utilisateur coche/édite/valide.

interface Row extends ParsedReceiptItem { checked: boolean; dup: boolean }

const norm = (s: string) => s.trim().toLowerCase()

export default function ReceiptScanModal({ existing, onClose }: {
  existing: CatalogItem[]
  onClose: () => void
}) {
  const parse = useParseReceipt()
  const { addItem } = useCatalog()
  const { showToast } = useToast()
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [store, setStore] = useState('')
  const [saving, setSaving] = useState(false)

  const existingNames = new Set(existing.map(i => norm(i.name)))

  async function handleFile(file: File) {
    try {
      const res = await parse.mutateAsync(file)
      setStore(res.store || '')
      setRows(res.items.map(it => {
        const dup = existingNames.has(norm(it.name))
        return { ...it, dup, checked: !dup } // les doublons sont décochés par défaut
      }))
    } catch { /* toast géré par le hook */ }
  }

  function patch(i: number, p: Partial<Row>) {
    setRows(rs => rs ? rs.map((r, j) => j === i ? { ...r, ...p } : r) : rs)
  }

  async function save() {
    if (!rows) return
    const chosen = rows.filter(r => r.checked && r.name.trim())
    if (chosen.length === 0) { onClose(); return }
    setSaving(true)
    try {
      for (const r of chosen) {
        const price = parseFloat(r.price.replace(',', '.'))
        await addItem.mutateAsync({
          name: r.name,
          price: Number.isFinite(price) ? price : null,
          quantity: r.quantity || null,
          category: r.category || null,
          store: store.trim() || null,
        })
      }
      showToast({
        type: 'success',
        message: `${chosen.length} article${chosen.length > 1 ? 's' : ''} ajouté${chosen.length > 1 ? 's' : ''} au catalogue.`,
      })
      onClose()
    } catch { /* toast par addItem */ } finally {
      setSaving(false)
    }
  }

  const checkedCount = rows?.filter(r => r.checked).length ?? 0

  return (
    <SlideUpModal title="Scanner un ticket" onClose={onClose}>
      <div className={styles.receiptBody}>
        {!rows && !parse.isPending && (
          <>
            <p className={styles.receiptHint}>
              Prends ton ticket de caisse en photo : les articles seront extraits et proposés.
              Tu valides la liste avant l'ajout au catalogue.
            </p>
            <div className={styles.receiptBtnRow}>
              <button type="button" className={styles.receiptUploadBtn} onClick={() => cameraRef.current?.click()}>
                <Camera size={16} strokeWidth={2} /> Caméra
              </button>
              <button type="button" className={styles.receiptUploadBtn} onClick={() => galleryRef.current?.click()}>
                <Images size={16} strokeWidth={2} /> Galerie
              </button>
            </div>
          </>
        )}

        {parse.isPending && (
          <div className={styles.receiptLoading}>
            <Loader2 size={28} className={styles.receiptSpin} />
            <span>Lecture du ticket…</span>
          </div>
        )}

        {rows && !parse.isPending && (
          rows.length === 0 ? (
            <p className={styles.receiptHint}>
              Aucun article détecté. Réessaie avec une photo plus nette et bien cadrée.
            </p>
          ) : (
            <>
              <input
                className={styles.receiptStore}
                value={store}
                onChange={e => setStore(e.target.value)}
                placeholder="Enseigne (optionnel)"
                aria-label="Enseigne"
              />
              <ul className={styles.receiptList}>
                {rows.map((r, i) => (
                  <li key={i} className={styles.receiptRow}>
                    <button
                      type="button"
                      className={[styles.receiptCheck, r.checked ? styles.receiptCheckOn : ''].join(' ')}
                      onClick={() => patch(i, { checked: !r.checked })}
                      aria-label={r.checked ? 'Ne pas ajouter' : 'Ajouter'}
                      aria-pressed={r.checked}
                    >
                      {r.checked && <Check size={14} strokeWidth={3} />}
                    </button>
                    <div className={styles.receiptFields}>
                      <input
                        className={styles.receiptName}
                        value={r.name}
                        onChange={e => patch(i, { name: e.target.value })}
                        placeholder="Article"
                        aria-label="Nom de l'article"
                      />
                      <div className={styles.receiptSub}>
                        <select
                          className={styles.receiptSelect}
                          value={r.category}
                          onChange={e => patch(i, { category: e.target.value })}
                          aria-label="Rayon"
                        >
                          <option value="">Rayon…</option>
                          {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.key}</option>)}
                        </select>
                        <input
                          className={styles.receiptPrice}
                          value={r.price}
                          onChange={e => patch(i, { price: e.target.value })}
                          placeholder="€"
                          inputMode="decimal"
                          aria-label="Prix"
                        />
                      </div>
                      {r.dup && <span className={styles.receiptDup}>Déjà au catalogue</span>}
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" className={styles.receiptAddBtn} onClick={save} disabled={saving || checkedCount === 0}>
                {saving ? 'Ajout…' : `Ajouter au catalogue (${checkedCount})`}
              </button>
            </>
          )
        )}

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
      </div>
    </SlideUpModal>
  )
}
