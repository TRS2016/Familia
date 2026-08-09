import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import { catColor, catGlyph, isSpendType, CAT_META } from './kakebo.utils'
import {
  useKakeboObjectif, useKakeboMemberBudgets, useUpdateCategoryBudget, useUpdateMemberBudget,
  useUpdateMemberObjectif, useRenameCategory, useCreateCategory, useDeleteCategory,
  type KakeboCategory, type KakeboMember,
} from './useKakebo'
import styles from './KakeboPage.module.css'

const NEW_CAT_COLORS = ['#E07B54', '#5B9E8F', '#9B7AC4', '#C89A5B', '#3D80B8', '#E8B84B', '#B85C5C', '#7A9B4C']
const CAT_TYPES: KakeboCategory['type'][] = ['fixed', 'variable', 'leisure', 'extra', 'income', 'saving', 'allowance']
const TYPE_LABELS: Record<KakeboCategory['type'], string> = {
  fixed: 'Survie', variable: 'Culture', leisure: 'Loisirs',
  extra: 'Extras', income: 'Revenus', saving: 'Épargne', allowance: 'Argent de poche',
}

/**
 * Paramètres Kakebo : objectif d'épargne, budgets mensuels par catégorie, et
 * — en vue Foyer seulement — gestion des catégories (renommage, création,
 * suppression). En vue membre, seuls l'objectif perso et les budgets perso
 * sont modifiables : les catégories sont communes au foyer.
 */
export default function BudgetSettings({
  selectedMemberId, selectedMember, categories, displayCategories, effectiveObjectif, onClose,
}: {
  selectedMemberId: string | null
  selectedMember: KakeboMember | null
  /** Catégories du foyer (budgets communs). */
  categories: KakeboCategory[]
  /** Catégories avec le budget du périmètre courant (foyer ou membre). */
  displayCategories: KakeboCategory[]
  effectiveObjectif: number
  onClose: () => void
}) {
  const { update: updateObjectif } = useKakeboObjectif()
  const { data: memberBudgets = [] } = useKakeboMemberBudgets(selectedMemberId)
  const updateCategoryBudget = useUpdateCategoryBudget()
  const updateMemberBudget = useUpdateMemberBudget()
  const updateMemberObjectif = useUpdateMemberObjectif()
  const renameCategory = useRenameCategory()
  const createCategory = useCreateCategory()
  const deleteCategory = useDeleteCategory()

  const budgetCats = displayCategories.filter(c => isSpendType(c.type))

  const [objectifDraft, setObjectifDraft] = useState(String(effectiveObjectif))
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(budgetCats.map(c => [c.id, c.monthly_budget != null ? String(c.monthly_budget) : ''])),
  )
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map(c => [c.id, c.name])),
  )

  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<KakeboCategory['type']>('variable')
  const [newColor, setNewColor] = useState(NEW_CAT_COLORS[0])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  /** '' ou valeur non positive => pas de limite. */
  function parseBudget(raw: string): number | null {
    if (raw.trim() === '') return null
    const n = parseFloat(raw)
    return isNaN(n) || n <= 0 ? null : n
  }

  async function save() {
    try {
      const objectif = parseFloat(objectifDraft)
      const objectifVal = isNaN(objectif) || objectif < 0 ? 0 : objectif

      if (selectedMemberId) {
        await updateMemberObjectif.mutateAsync({ memberId: selectedMemberId, objectif: objectifVal || null })
        for (const [categoryId, raw] of Object.entries(budgetDrafts)) {
          const monthly_budget = parseBudget(raw)
          const current = memberBudgets.find(b => b.category_id === categoryId)?.monthly_budget ?? null
          if (current !== monthly_budget) {
            updateMemberBudget.mutate({ memberId: selectedMemberId, categoryId, monthly_budget })
          }
        }
      } else {
        await updateObjectif.mutateAsync(objectifVal)
        for (const [id, raw] of Object.entries(budgetDrafts)) {
          const monthly_budget = parseBudget(raw)
          const cat = categories.find(c => c.id === id)
          if (cat && cat.monthly_budget !== monthly_budget) updateCategoryBudget.mutate({ id, monthly_budget })
        }
        // Renommage : porte sur toutes les catégories, y compris Revenus et Épargne.
        for (const cat of categories) {
          const newLabel = (nameDrafts[cat.id] ?? '').trim()
          if (newLabel && newLabel !== cat.name) renameCategory.mutate({ id: cat.id, name: newLabel })
        }
      }
      onClose()
    } catch { /* les onError des mutations affichent le toast */ }
  }

  function handleCreate() {
    if (!newName.trim()) return
    createCategory.mutate(
      { name: newName, type: newType, color: newColor },
      {
        onSuccess: () => {
          setNewName(''); setShowNew(false)
          setNewColor(NEW_CAT_COLORS[(NEW_CAT_COLORS.indexOf(newColor) + 1) % NEW_CAT_COLORS.length])
        },
      },
    )
  }

  const saving = updateObjectif.isPending || updateMemberObjectif.isPending

  return (
    <SlideUpModal
      title={selectedMember ? `Budget — ${selectedMember.display_name}` : 'Paramètres Kakebo'}
      onClose={onClose}
    >
      <div className={styles.form}>
        <div className={styles.fieldGroup}>
          <label htmlFor="k-objectif" className={styles.fieldLabel}>Objectif d'épargne (€)</label>
          <input
            id="k-objectif"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={objectifDraft}
            onChange={e => setObjectifDraft(e.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.budgetSeparator}>
          <span className={styles.fieldLabel}>Budgets mensuels par catégorie</span>
        </div>

        {budgetCats.map(cat => (
          <div key={cat.id} className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              <span className={styles.catDot} style={{ background: catColor(cat) }} />
              {' '}{selectedMemberId ? `${cat.name} (€)` : 'Catégorie & budget (€)'}
            </label>
            <div className={selectedMemberId ? undefined : styles.catEditRow}>
              {!selectedMemberId && (
                <input
                  type="text"
                  value={nameDrafts[cat.id] ?? ''}
                  onChange={e => setNameDrafts(d => ({ ...d, [cat.id]: e.target.value }))}
                  className={styles.input}
                  placeholder="Nom de la catégorie"
                  aria-label={`Nom de ${cat.name}`}
                />
              )}
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={budgetDrafts[cat.id] ?? ''}
                onChange={e => setBudgetDrafts(d => ({ ...d, [cat.id]: e.target.value }))}
                className={styles.input}
                placeholder="Sans limite"
                aria-label={`Budget de ${cat.name}`}
              />
              {!selectedMemberId && (
                <button
                  type="button"
                  className={styles.catDeleteBtn}
                  onClick={() => setConfirmDelete(cat.id)}
                  aria-label={`Supprimer ${cat.name}`}
                >
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Revenus et Épargne : renommables, mais sans budget de dépense. */}
        {!selectedMemberId && (
          <>
            {categories.filter(c => !isSpendType(c.type)).map(cat => (
              <div key={cat.id} className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  <span className={styles.catDot} style={{ background: catColor(cat) }} />
                  {' '}{catGlyph(cat.type)} {TYPE_LABELS[cat.type]}
                </label>
                <div className={styles.catEditRow}>
                  <input
                    type="text"
                    value={nameDrafts[cat.id] ?? ''}
                    onChange={e => setNameDrafts(d => ({ ...d, [cat.id]: e.target.value }))}
                    className={styles.input}
                    aria-label={`Nom de ${cat.name}`}
                  />
                  <button
                    type="button"
                    className={styles.catDeleteBtn}
                    onClick={() => setConfirmDelete(cat.id)}
                    aria-label={`Supprimer ${cat.name}`}
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}

            {showNew ? (
              <div className={styles.newCatBox}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="k-newcat" className={styles.fieldLabel}>Nouvelle catégorie</label>
                  <input
                    id="k-newcat"
                    type="text"
                    className={styles.input}
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Ex. Animaux, Santé…"
                    autoFocus
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Type</label>
                  <div className={styles.catPills}>
                    {CAT_TYPES.map(t => (
                      <button
                        key={t}
                        type="button"
                        className={[styles.catPill, newType === t ? styles.catPillActive : ''].join(' ')}
                        onClick={() => setNewType(t)}
                        title={CAT_META[t]?.desc}
                      >
                        <span className={styles.catPillGlyph}>{catGlyph(t)}</span>
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Couleur</label>
                  <div className={styles.colorRow}>
                    {NEW_CAT_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        className={[styles.colorDot, newColor === c ? styles.colorDotActive : ''].join(' ')}
                        style={{ background: c }}
                        onClick={() => setNewColor(c)}
                        aria-label={`Couleur ${c}`}
                        aria-pressed={newColor === c}
                      />
                    ))}
                  </div>
                </div>
                <div className={styles.newCatActions}>
                  <button type="button" className={styles.newCatCancel} onClick={() => setShowNew(false)}>Annuler</button>
                  <button
                    type="button"
                    className={styles.newCatConfirm}
                    onClick={handleCreate}
                    disabled={!newName.trim() || createCategory.isPending}
                  >
                    Créer
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={styles.addCatBtn} onClick={() => setShowNew(true)}>
                <Plus size={14} strokeWidth={2.5} /> Ajouter une catégorie
              </button>
            )}
          </>
        )}

        <button className={styles.submitBtn} onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {confirmDelete && (
        <SlideUpModal title="Supprimer la catégorie ?" onClose={() => setConfirmDelete(null)}>
          <div className={styles.form}>
            <p className={styles.confirmText}>
              « {categories.find(c => c.id === confirmDelete)?.name} » sera supprimée définitivement.
              La suppression est refusée si des opérations y sont encore rattachées.
            </p>
            <button
              className={styles.dangerBtn}
              onClick={() => deleteCategory.mutate(confirmDelete, { onSuccess: () => setConfirmDelete(null) })}
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending ? 'Suppression…' : 'Supprimer'}
            </button>
            <button className={styles.newCatCancel} onClick={() => setConfirmDelete(null)}>Annuler</button>
          </div>
        </SlideUpModal>
      )}
    </SlideUpModal>
  )
}
