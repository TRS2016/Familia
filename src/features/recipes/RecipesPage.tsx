import { useState, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Upload, Trash2, X } from 'lucide-react'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import {
  useRecipes, useRecipesRealtime, useImportRecipes, useDeleteRecipe,
  MEAL_TYPES, mealMeta,
} from './useRecipes'
import type { Recipe } from './useRecipes'
import styles from './RecipesPage.module.css'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'))
    reader.readAsDataURL(file)
  })
}

export default function RecipesPage() {
  useRecipesRealtime()
  const { data: recipes = [], isLoading } = useRecipes()
  const importRecipes = useImportRecipes()
  const deleteRecipe = useDeleteRecipe()

  const [filter, setFilter] = useState<string | null>(null)
  const [detail, setDetail] = useState<Recipe | null>(null)
  const [confirmDel, setConfirmDel] = useState<Recipe | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const countByMeal = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of recipes) m[r.meal_type] = (m[r.meal_type] ?? 0) + 1
    return m
  }, [recipes])

  const shown = filter ? recipes.filter(r => r.meal_type === filter) : recipes

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > 32 * 1024 * 1024) {
      // garde-fou local : la limite Claude est ~32 Mo de requête
      alert('PDF trop volumineux (max 32 Mo). Découpe-le en sections.')
      return
    }
    try {
      const b64 = await fileToBase64(file)
      importRecipes.mutate(b64)
    } catch { /* toast géré ailleurs */ }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backLink} aria-label="Retour">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </Link>
        <h1 className={styles.pageTitle}>Recettes</h1>
        <button
          className={styles.importBtn}
          onClick={() => fileRef.current?.click()}
          disabled={importRecipes.isPending}
        >
          {importRecipes.isPending
            ? <><Spinner size={14} /> Lecture…</>
            : <><Upload size={15} strokeWidth={2} /> Importer un PDF</>}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0])}
        />
      </header>

      {recipes.length > 0 && (
        <div className={styles.filterRow}>
          <button
            className={[styles.chip, !filter ? styles.chipActive : ''].join(' ')}
            onClick={() => setFilter(null)}
          >
            Tout · {recipes.length}
          </button>
          {MEAL_TYPES.map(t => {
            const meta = mealMeta(t)
            const n = countByMeal[t] ?? 0
            if (n === 0) return null
            return (
              <button
                key={t}
                className={[styles.chip, filter === t ? styles.chipActive : ''].join(' ')}
                onClick={() => setFilter(f => f === t ? null : t)}
              >
                {meta.emoji} {meta.label} · {n}
              </button>
            )
          })}
        </div>
      )}

      {isLoading ? (
        <div className={styles.spinnerWrap}><Spinner size={32} /></div>
      ) : recipes.length === 0 ? (
        <EmptyState
          emoji="🍳"
          title="Aucune recette"
          description="Importe ton ebook de recettes en PDF : l'IA en extrait les recettes automatiquement."
          action={{ label: 'Importer un PDF', onClick: () => fileRef.current?.click() }}
        />
      ) : (
        <ul className={styles.list}>
          {shown.map(r => {
            const meta = mealMeta(r.meal_type)
            return (
              <li key={r.id} className={styles.row} onClick={() => setDetail(r)}>
                <span className={styles.rowEmoji}>{meta.emoji}</span>
                <div className={styles.rowBody}>
                  <span className={styles.rowTitle}>{r.title}</span>
                  <span className={styles.rowSub}>
                    {meta.label} · {r.ingredients.length} ingrédient{r.ingredients.length > 1 ? 's' : ''} · 🏆 {r.points} pts
                  </span>
                </div>
                <button
                  className={styles.rowDelete}
                  onClick={e => { e.stopPropagation(); setConfirmDel(r) }}
                  aria-label="Supprimer"
                >
                  <Trash2 size={15} strokeWidth={2} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {detail && (
        <SlideUpModal title={detail.title} onClose={() => setDetail(null)}>
          <div className={styles.detail}>
            <span className={styles.detailMeal}>{mealMeta(detail.meal_type).emoji} {mealMeta(detail.meal_type).label}</span>

            {detail.ingredients.length > 0 && (
              <section className={styles.detailSection}>
                <h3 className={styles.detailH}>Ingrédients</h3>
                <ul className={styles.ingList}>
                  {detail.ingredients.map((i, idx) => (
                    <li key={idx} className={styles.ingItem}>
                      <span>{i.name}</span>
                      {i.quantity && <span className={styles.ingQty}>{i.quantity}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detail.steps.length > 0 && (
              <section className={styles.detailSection}>
                <h3 className={styles.detailH}>Préparation</h3>
                <ol className={styles.stepList}>
                  {detail.steps.map((s, idx) => <li key={idx} className={styles.stepItem}>{s}</li>)}
                </ol>
              </section>
            )}
          </div>
        </SlideUpModal>
      )}

      {confirmDel && (
        <div className={styles.overlay} onClick={() => setConfirmDel(null)}>
          <div className={styles.confirmSheet} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className={styles.confirmClose} onClick={() => setConfirmDel(null)} aria-label="Fermer"><X size={18} /></button>
            <p className={styles.confirmTitle}>Supprimer « {confirmDel.title} » ?</p>
            <p className={styles.confirmText}>Cette action est définitive.</p>
            <button
              className={styles.confirmDelBtn}
              onClick={() => { deleteRecipe.mutate(confirmDel.id); setConfirmDel(null) }}
            >
              Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
