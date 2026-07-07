import { useState, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus, Upload, X } from 'lucide-react'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import { useToast } from '../../components/useToast'
import {
  useRecipes, useRecipesRealtime, useImportRecipes, useDeleteRecipe,
  MEAL_TYPES, mealMeta,
} from './useRecipes'
import { useFavoriteRecipes } from './useFavoriteRecipes'
import RecipeDetailModal from './RecipeDetailModal'
import RecipeFormModal from './RecipeFormModal'
import WeekPlanner from './WeekPlanner'
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

  const { showToast } = useToast()
  const [filter, setFilter] = useState<string | null>(null)
  const [detail, setDetail] = useState<Recipe | null>(null)
  const [confirmDel, setConfirmDel] = useState<Recipe | null>(null)
  // false = fermé ; null = création ; Recipe = édition
  const [form, setForm] = useState<Recipe | null | false>(false)
  const [view, setView] = useState<'carnet' | 'semaine'>('carnet')
  const fileRef = useRef<HTMLInputElement>(null)

  const { favorites, toggleFavorite } = useFavoriteRecipes()

  const countByMeal = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of recipes) m[r.meal_type] = (m[r.meal_type] ?? 0) + 1
    return m
  }, [recipes])

  // Favoris d'abord, puis l'ordre d'origine (plus récentes en premier).
  const shown = useMemo(() => {
    const base = filter ? recipes.filter(r => r.meal_type === filter) : recipes
    return [...base].sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)))
  }, [recipes, filter, favorites])

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > 32 * 1024 * 1024) {
      // garde-fou local : la limite Claude est ~32 Mo de requête
      showToast({ type: 'error', message: 'PDF trop volumineux (max 32 Mo). Découpe-le en sections.' })
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
          className={styles.newBtn}
          onClick={() => setForm(null)}
          aria-label="Nouvelle recette"
        >
          <Plus size={18} strokeWidth={2.5} />
        </button>
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

      <div className={styles.segmented} role="tablist" aria-label="Vue recettes">
        <button
          role="tab"
          aria-selected={view === 'carnet'}
          className={[styles.segBtn, view === 'carnet' ? styles.segActive : ''].join(' ')}
          onClick={() => setView('carnet')}
        >
          📖 Carnet
        </button>
        <button
          role="tab"
          aria-selected={view === 'semaine'}
          className={[styles.segBtn, view === 'semaine' ? styles.segActive : ''].join(' ')}
          onClick={() => setView('semaine')}
        >
          📅 Semaine
        </button>
      </div>

      {view === 'semaine' && <WeekPlanner recipes={recipes} onShowRecipe={setDetail} />}

      {view === 'carnet' && recipes.length > 0 && (
        <div className={styles.filterRow}>
          <button
            className={[styles.chip, !filter ? styles.chipActive : ''].join(' ')}
            onClick={() => setFilter(null)}
          >
            Toutes · {recipes.length}
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

      {view === 'carnet' && (isLoading ? (
        <div className={styles.spinnerWrap}><Spinner size={32} /></div>
      ) : recipes.length === 0 ? (
        <EmptyState
          emoji="🍳"
          title="Aucune recette"
          description="Importe ton ebook de recettes en PDF : l'IA en extrait les recettes automatiquement."
          action={{ label: 'Importer un PDF', onClick: () => fileRef.current?.click() }}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          emoji={mealMeta(filter ?? '').emoji}
          title="Rien dans cette catégorie"
          description="Aucune recette de ce type dans le carnet pour l'instant."
        />
      ) : (
        <ul className={styles.grid}>
          {shown.map(r => {
            const meta = mealMeta(r.meal_type)
            const fav = favorites.has(r.id)
            return (
              <li key={r.id} className={styles.cardWrap}>
                <button className={styles.card} onClick={() => setDetail(r)}>
                  <span className={[styles.cardTile, styles[`tile_${r.meal_type}`] ?? ''].join(' ')} aria-hidden="true">
                    {meta.emoji}
                  </span>
                  <span className={styles.cardName}>{r.title}</span>
                  <span className={styles.cardFoot}>
                    <span className={[styles.cardBadge, styles[`badge_${r.meal_type}`] ?? ''].join(' ')}>{meta.label}</span>
                    <span className={styles.cardMeta}>
                      🥕 {r.ingredients.length} · 🏆 {r.points} pts
                    </span>
                  </span>
                </button>
                <button
                  className={styles.cardFav}
                  onClick={e => { e.stopPropagation(); toggleFavorite(r.id) }}
                  aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  aria-pressed={fav}
                >
                  {fav ? '❤️' : '🤍'}
                </button>
              </li>
            )
          })}
        </ul>
      ))}

      {detail && (
        <RecipeDetailModal
          recipe={detail}
          onClose={() => setDetail(null)}
          onEdit={r => { setDetail(null); setForm(r) }}
          onDelete={r => { setDetail(null); setConfirmDel(r) }}
        />
      )}

      {form !== false && <RecipeFormModal recipe={form} onClose={() => setForm(false)} />}

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
