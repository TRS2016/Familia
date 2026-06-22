import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { format, addMonths, subMonths, getDaysInMonth } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Settings, Download, X } from 'lucide-react'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import SlideUpModal from '../../components/SlideUpModal'
import { useToast } from '../../components/useToast'
import {
  useKakeboCategories,
  useKakeboEntries,
  useKakeboObjectif,
  useKakeboTrend,
  useAddEntry,
  useEditEntry,
  useDeleteEntry,
  useUpdateCategoryBudget,
  useKakeboMembers,
  useKakeboMemberBudgets,
  useUpdateMemberBudget,
  useUpdateMemberObjectif,
  useRenameCategory,
  useMaterializeRecurring,
} from './useKakebo'
import { useKakeboRealtime } from './useKakeboRealtime'
import type { KakeboEntry } from './useKakebo'
import { memberColor } from '../../lib/constants'
import styles from './KakeboPage.module.css'

import { catGlyph, catColor } from './kakebo.utils'
import BilanView from './BilanView'
import DetailView from './DetailView'
import CategoryDetail from './CategoryDetail'
import ReflexionView from './ReflexionView'
import TrendView from './TrendView'


type View = 'bilan' | 'detail' | 'reflexion' | 'tendance'

// ── Main component ────────────────────────────────────────────────────────────

export default function KakeboPage() {
  const [refDate, setRefDate] = useState(() => new Date())
  const year  = refDate.getFullYear()
  const month = refDate.getMonth() + 1 // 1-based

  const { data: categories = [], isLoading: catsLoading } = useKakeboCategories()
  const { data: entries = [], isLoading: entriesLoading } = useKakeboEntries(year, month)
  const { objectif, update: updateObjectif } = useKakeboObjectif()
  const { data: trendEntries = [], isLoading: trendLoading } = useKakeboTrend(12)
  const { data: members = [] } = useKakeboMembers()
  useMaterializeRecurring(year, month) // génère les occurrences récurrentes manquantes du mois
  useKakeboRealtime()

  const { showToast } = useToast()

  const addEntry    = useAddEntry(year, month)
  const editEntry   = useEditEntry(year, month)
  const deleteEntry = useDeleteEntry(year, month)

  // Replay always targets the actual current month, regardless of the displayed month
  const nowYear  = new Date().getFullYear()
  const nowMonth = new Date().getMonth() + 1
  const replayEntry = useAddEntry(nowYear, nowMonth)

  const [view, setView]             = useState<View>('bilan')
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const updateCategoryBudget  = useUpdateCategoryBudget()
  const updateMemberBudget    = useUpdateMemberBudget()
  const updateMemberObjectif  = useUpdateMemberObjectif()
  const renameCategory        = useRenameCategory()
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({})

  const { data: memberBudgets = [] } = useKakeboMemberBudgets(selectedMemberId)
  const selectedMember = members.find(m => m.id === selectedMemberId) ?? null

  const [showAdd, setShowAdd]       = useState(false)
  const [showBudget, setShowBudget] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState(400)
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({})

  // Edit entry state
  const [editTarget, setEditTarget] = useState<KakeboEntry | null>(null)
  const [editDraft, setEditDraft]   = useState({ category_id: '', amount: '', description: '', date: '', member_id: null as string | null, tags: [] as string[], recurring: false, series_id: null as string | null })

  // Add form state
  const firstCatId = categories.find(c => c.type !== 'income')?.id ?? ''
  const [draft, setDraft] = useState({
    category_id: '',
    amount: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    member_id: null as string | null,
    tags: [] as string[],
    recurring: false,
  })

  // Ouvre le modal d'ajout en pré-affectant à la vue courante (Foyer ou membre)
  function openAddModal() {
    setDraft(d => ({ ...d, member_id: selectedMemberId }))
    setShowAdd(true)
  }

  // Reset draft category when categories load
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (categories.length > 0 && !draft.category_id) {
      setDraft(d => ({ ...d, category_id: firstCatId }))
    }
  }, [categories, firstCatId, draft.category_id])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Member-aware derived data ──────────────────────────────────────────────

  // Buckets séparés : Foyer = dépenses communes (member_id null),
  // membre = ses dépenses perso uniquement. Pas de chevauchement.
  const displayEntries = selectedMemberId
    ? entries.filter(e => e.member_id === selectedMemberId)
    : entries.filter(e => e.member_id === null)

  const displayTrendEntries = selectedMemberId
    ? trendEntries.filter(e => e.member_id === selectedMemberId)
    : trendEntries.filter(e => e.member_id === null)

  // Override monthly_budget per category with member-specific values when a member is selected
  const displayCategories = categories.map(cat => ({
    ...cat,
    monthly_budget: selectedMemberId
      ? (memberBudgets.find(b => b.category_id === cat.id)?.monthly_budget ?? null)
      : cat.monthly_budget,
  }))

  const effectiveObjectif = selectedMemberId
    ? (selectedMember?.kakebo_objectif_epargne ?? 0)
    : objectif

  // ── Previous month expenses (for delta badge in BilanView) ────────────────

  const prevMonthPrefix    = format(subMonths(refDate, 1), 'yyyy-MM')
  const prevMonthExpenses  = displayTrendEntries
    .filter(e => e.date.startsWith(prevMonthPrefix) && e.category?.type !== 'income')
    .reduce((s, e) => s + Number(e.amount), 0)

  // ── Computations ──────────────────────────────────────────────────────────

  const incomeEntries  = displayEntries.filter(e => e.category?.type === 'income')
  const expenseEntries = displayEntries.filter(e => e.category?.type !== 'income')
  const totalRevenusMois = incomeEntries.reduce((s, e) => s + Number(e.amount), 0)

  const totalByCategory: Record<string, number> = {}
  for (const cat of displayCategories) totalByCategory[cat.id] = 0
  for (const e of expenseEntries) {
    if (e.category_id) totalByCategory[e.category_id] = (totalByCategory[e.category_id] ?? 0) + Number(e.amount)
  }
  const totalDepenses = Object.values(totalByCategory).reduce((s, v) => s + v, 0)
  const epargneReelle = totalRevenusMois - totalDepenses
  const solde         = epargneReelle - effectiveObjectif

  const moodEmoji = solde >= 0 ? '🌱' : solde >= -50 ? '🌤' : '🌧'
  const moodLabel = solde >= 0 ? 'Mois équilibré' : solde >= -50 ? 'Légèrement au-dessus' : 'Au-delà de l\'objectif'

  // Donut math
  const donutR = 54
  const donutC = 2 * Math.PI * donutR
  const spendCats = displayCategories.filter(c => c.type !== 'income')
  const arcBases = spendCats.map(cat => {
    const v = totalByCategory[cat.id] ?? 0
    const pct = totalDepenses > 0 ? v / totalDepenses : 0
    return { cat, pct, value: v }
  })
  // Prefix sums: cumPcts[i] = sum of pcts before index i (no mutation needed)
  const cumPcts = arcBases.reduce<number[]>((acc, a) => [...acc, acc[acc.length - 1] + a.pct], [0])
  const arcs = arcBases.map((a, i) => ({
    ...a,
    dash: a.pct * donutC,
    offset: -cumPcts[i] * donutC,
  }))

  // Daily rhythm
  const daysCount = getDaysInMonth(refDate)
  const todayDay  = refDate.getMonth() === new Date().getMonth() &&
                    refDate.getFullYear() === new Date().getFullYear()
                      ? new Date().getDate() : daysCount
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const dailyTotals = Array.from({ length: daysCount }, (_, i) => {
    const day = String(i + 1).padStart(2, '0')
    return expenseEntries
      .filter(e => e.date === `${monthPrefix}-${day}`)
      .reduce((s, e) => s + Number(e.amount), 0)
  })
  const maxDaily = Math.max(1, ...dailyTotals)

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openEdit(entry: KakeboEntry) {
    setEditDraft({
      category_id: entry.category_id ?? '',
      amount: String(entry.amount),
      description: entry.description ?? '',
      date: entry.date,
      member_id: entry.member_id,
      tags: entry.tags ?? [],
      recurring: entry.recurring ?? false,
      series_id: entry.series_id ?? null,
    })
    setEditTarget(entry)
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    const amount = parseFloat(editDraft.amount)
    if (!editDraft.category_id || isNaN(amount) || amount <= 0) return
    await editEntry.mutateAsync({
      id: editTarget.id,
      category_id: editDraft.category_id,
      amount,
      date: editDraft.date,
      description: editDraft.description,
      member_id: editDraft.member_id,
      tags: editDraft.tags,
      recurring: editDraft.recurring,
      series_id: editDraft.series_id,
    })
    setEditTarget(null)
  }

  function handleReplay(entry: KakeboEntry) {
    if (!entry.category_id) return
    replayEntry.mutate(
      {
        category_id: entry.category_id,
        amount: Number(entry.amount),
        date: format(new Date(), 'yyyy-MM-dd'),
        description: entry.description ?? '',
        member_id: entry.member_id,
        tags: entry.tags ?? [],
        recurring: false,
      },
      { onSuccess: () => showToast({ type: 'success', message: 'Opération dupliquée pour aujourd\'hui.' }) }
    )
  }

  function exportCsv() {
    const header = 'Date,Catégorie,Type,Description,Montant\n'
    const sorted = [...displayEntries].sort((a, b) => a.date.localeCompare(b.date))
    const rows = sorted
      .map(e => [
        e.date,
        e.category?.name ?? '',
        e.category?.type ?? '',
        `"${(e.description ?? '').replace(/"/g, '""')}"`,
        // Revenus en positif, dépenses en négatif pour un grand livre lisible.
        (e.category?.type === 'income' ? Number(e.amount) : -Number(e.amount)).toFixed(2),
      ].join(','))
      .join('\n')
    // Lignes de synthèse en pied de fichier.
    const totals = [
      '',
      `\nTotal revenus,,,,${totalRevenusMois.toFixed(2)}`,
      `Total dépenses,,,,${(-totalDepenses).toFixed(2)}`,
      `Épargne réelle,,,,${epargneReelle.toFixed(2)}`,
    ].join('\n')
    const blob = new Blob(['﻿' + header + rows + totals], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const suffix = selectedMember ? `-${selectedMember.display_name.toLowerCase()}` : ''
    a.download = `kakebo-${year}-${String(month).padStart(2, '0')}${suffix}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function saveBudget() {
    try {
      if (selectedMemberId) {
        await updateMemberObjectif.mutateAsync({ memberId: selectedMemberId, objectif: budgetDraft || null })
        for (const [categoryId, val] of Object.entries(budgetDrafts)) {
          const num = parseFloat(val)
          const monthly_budget = val.trim() === '' ? null : isNaN(num) || num <= 0 ? null : num
          const current = memberBudgets.find(b => b.category_id === categoryId)?.monthly_budget ?? null
          if (current !== monthly_budget) {
            updateMemberBudget.mutate({ memberId: selectedMemberId, categoryId, monthly_budget })
          }
        }
      } else {
        await updateObjectif.mutateAsync(budgetDraft)
        for (const [id, val] of Object.entries(budgetDrafts)) {
          const num = parseFloat(val)
          const monthly_budget = val.trim() === '' ? null : isNaN(num) || num <= 0 ? null : num
          const cat = categories.find(c => c.id === id)
          if (cat && cat.monthly_budget !== monthly_budget) {
            updateCategoryBudget.mutate({ id, monthly_budget })
          }
          // Renommage de catégorie (global au foyer)
          const newName = (nameDrafts[id] ?? '').trim()
          if (cat && newName && newName !== cat.name) {
            renameCategory.mutate({ id, name: newName })
          }
        }
      }
      setShowBudget(false)
    } catch { /* onError handles toast */ }
  }

  function openBudgetModal() {
    setBudgetDraft(effectiveObjectif)
    const drafts: Record<string, string> = {}
    const names: Record<string, string> = {}
    for (const cat of displayCategories.filter(c => c.type !== 'income')) {
      drafts[cat.id] = cat.monthly_budget != null ? String(cat.monthly_budget) : ''
      names[cat.id] = cat.name
    }
    setBudgetDrafts(drafts)
    setNameDrafts(names)
    setShowBudget(true)
  }

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault()
    const amount = parseFloat(draft.amount)
    if (!draft.category_id || isNaN(amount) || amount <= 0) return
    await addEntry.mutateAsync({
      category_id: draft.category_id,
      amount,
      date: draft.date,
      description: draft.description,
      member_id: draft.member_id,
      tags: draft.tags,
      recurring: draft.recurring,
    })
    setDraft({ category_id: draft.category_id, amount: '', description: '', date: draft.date, member_id: draft.member_id, tags: [], recurring: false })
    setShowAdd(false)
  }

  const monthLabel = format(refDate, 'MMMM yyyy', { locale: fr })
    .replace(/^\w/, c => c.toUpperCase())

  const isLoading = catsLoading || entriesLoading

  const selectedCat = selectedCatId ? displayCategories.find(c => c.id === selectedCatId) : null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          {selectedCatId
            ? <button className={styles.backCatBtn} onClick={() => setSelectedCatId(null)} aria-label="Retour au bilan">
                <ChevronLeft size={22} strokeWidth={2.5} />
              </button>
            : <Link to="/" className={styles.backLink} aria-label="Retour à l'accueil">
                <ChevronLeft size={22} strokeWidth={2.5} />
              </Link>
          }
          <div>
            <div className={styles.headerMeta}>
              <span className={styles.headerKanji}>家計簿</span>
              <span className={styles.headerMonthBadge}>· {monthLabel}</span>
            </div>
            <h1 className={styles.pageTitle}>
              {selectedCat ? selectedCat.name : 'Carnet de comptes'}
            </h1>
          </div>
        </div>
        <div className={styles.headerActions}>
          {displayEntries.length > 0 && (
            <button className={styles.iconBtn} onClick={exportCsv} aria-label="Exporter CSV" title="Exporter CSV">
              <Download size={15} strokeWidth={2} />
            </button>
          )}
          <button className={styles.iconBtn} onClick={openBudgetModal} aria-label="Paramètres">
            <Settings size={15} strokeWidth={2} />
          </button>
          <button className={styles.fabSmall} onClick={openAddModal} aria-label="Ajouter">
            <Plus size={16} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {/* ── Month nav ─────────────────────────────────────────────────── */}
      {!selectedCatId && (
        <div className={styles.monthNav}>
          <button className={styles.navBtn} onClick={() => setRefDate(d => subMonths(d, 1))} aria-label="Mois précédent">
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <button className={styles.monthLabel} onClick={() => setRefDate(new Date())}>
            {monthLabel}
          </button>
          <button className={styles.navBtn} onClick={() => setRefDate(d => addMonths(d, 1))} aria-label="Mois suivant">
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* ── Member switcher ───────────────────────────────────────────── */}
      {!selectedCatId && members.length > 1 && (
        <div className={styles.memberFilter}>
          <button
            className={[styles.memberPill, !selectedMemberId ? styles.memberPillActive : ''].join(' ')}
            onClick={() => setSelectedMemberId(null)}
          >Foyer</button>
          {members.map((m, i) => {
            const active = selectedMemberId === m.id
            const color  = memberColor(i)
            return (
              <button
                key={m.id}
                className={[styles.memberPill, active ? styles.memberPillActive : ''].join(' ')}
                style={active ? { borderColor: color, background: `${color}1A`, color } : {}}
                onClick={() => setSelectedMemberId(active ? null : m.id)}
              >{m.display_name}</button>
            )
          })}
        </div>
      )}

      {/* ── View tabs (hidden when drilling into a category) ──────────── */}
      {!selectedCatId && (
        <div className={styles.viewPills}>
          {(['bilan', 'detail', 'reflexion', 'tendance'] as View[]).map(v => (
            <button
              key={v}
              className={[styles.pill, view === v ? styles.pillActive : ''].join(' ')}
              onClick={() => setView(v)}
            >
              {v === 'bilan' ? 'Bilan' : v === 'detail' ? 'Détail' : v === 'reflexion' ? 'Réflexion' : 'Tendance'}
            </button>
          ))}
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {isLoading && (
        <div className={styles.spinnerWrap}>
          <Spinner size={32} />
        </div>
      )}

      {!isLoading && (
        <>
          {/* ── Category drill-down ─────────────────────────────────── */}
          {selectedCatId && selectedCat && (
            <CategoryDetail
              cat={selectedCat}
              entries={displayEntries.filter(e => e.category_id === selectedCatId)}
              revenus={totalRevenusMois}
              onEdit={openEdit}
              onDelete={id => deleteEntry.mutate(id)}
              onReplay={handleReplay}
            />
          )}

          {/* ── Bilan ───────────────────────────────────────────────── */}
          {!selectedCatId && view === 'bilan' && (
            <BilanView
              arcs={arcs}
              donutR={donutR}
              donutC={donutC}
              totalDepenses={totalDepenses}
              revenus={totalRevenusMois}
              objectifEpargne={effectiveObjectif}
              epargneReelle={epargneReelle}
              solde={solde}
              moodEmoji={moodEmoji}
              moodLabel={moodLabel}
              dailyTotals={dailyTotals}
              maxDaily={maxDaily}
              todayDay={todayDay}
              entries={displayEntries}
              prevMonthExpenses={prevMonthExpenses}
              onSelectCat={setSelectedCatId}
              onShowDetail={() => setView('detail')}
              onEdit={openEdit}
              onReplay={handleReplay}
            />
          )}

          {/* ── Détail ──────────────────────────────────────────────── */}
          {!selectedCatId && view === 'detail' && (
            <DetailView
              categories={displayCategories}
              entries={displayEntries}
              onEdit={openEdit}
              onDelete={id => deleteEntry.mutate(id)}
              onReplay={handleReplay}
            />
          )}

          {/* ── Réflexion ───────────────────────────────────────────── */}
          {!selectedCatId && view === 'reflexion' && (
            <ReflexionView
              epargneReelle={epargneReelle}
              objectifEpargne={effectiveObjectif}
              solde={solde}
              categories={spendCats}
              totalByCategory={totalByCategory}
            />
          )}

          {/* ── Tendance ────────────────────────────────────────────── */}
          {!selectedCatId && view === 'tendance' && (
            <TrendView entries={displayTrendEntries} isLoading={trendLoading} categories={displayCategories} />
          )}

          {/* Empty state only for bilan with no entries */}
          {!selectedCatId && view === 'bilan' && displayEntries.length === 0 && (
            <EmptyState
              emoji="📒"
              title="Aucune opération ce mois"
              description="Commence par ajouter une dépense avec le bouton +."
              action={{ label: 'Ajouter une opération', onClick: openAddModal }}
            />
          )}
        </>
      )}

      {/* ── Add entry modal ───────────────────────────────────────────── */}
      {showAdd && (
        <SlideUpModal title="Nouvelle opération" onClose={() => setShowAdd(false)}>
            <form onSubmit={handleAddSubmit} className={styles.form}>
              {/* Affectation : foyer (commun) ou membre (perso) */}
              {members.length > 0 && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Affecté à</label>
                  <div className={styles.catPills}>
                    <button
                      type="button"
                      className={[styles.catPill, draft.member_id === null ? styles.catPillActive : ''].join(' ')}
                      style={draft.member_id === null ? { background: 'rgba(224,123,84,0.13)', borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
                      onClick={() => setDraft(d => ({ ...d, member_id: null }))}
                    >
                      🏠 Foyer
                    </button>
                    {members.map((m, i) => {
                      const active = draft.member_id === m.id
                      const color  = memberColor(i)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={[styles.catPill, active ? styles.catPillActive : ''].join(' ')}
                          style={active ? { background: `${color}22`, borderColor: color, color } : {}}
                          onClick={() => setDraft(d => ({ ...d, member_id: m.id }))}
                        >
                          {m.display_name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Category picker */}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Catégorie</label>
                <div className={styles.catPills}>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      className={[
                        styles.catPill,
                        draft.category_id === cat.id ? styles.catPillActive : '',
                      ].join(' ')}
                      style={draft.category_id === cat.id
                        ? { background: `${catColor(cat)}22`, borderColor: catColor(cat), color: catColor(cat) }
                        : {}}
                      onClick={() => setDraft(d => ({ ...d, category_id: cat.id }))}
                    >
                      <span className={styles.catPillGlyph}>{catGlyph(cat.type)}</span>
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div className={styles.fieldGroup}>
                <label htmlFor="k-amount" className={styles.fieldLabel}>Montant (€)</label>
                <input
                  id="k-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={draft.amount}
                  onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))}
                  className={styles.input}
                  placeholder="0,00"
                  required
                  autoFocus
                />
              </div>

              {/* Description */}
              <div className={styles.fieldGroup}>
                <label htmlFor="k-desc" className={styles.fieldLabel}>Description</label>
                <input
                  id="k-desc"
                  type="text"
                  value={draft.description}
                  onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                  className={styles.input}
                  placeholder="Ex. Restaurant, Loyer, Netflix…"
                />
              </div>

              {/* Tags */}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Tags</label>
                <TagInput tags={draft.tags} onChange={tags => setDraft(d => ({ ...d, tags }))} />
              </div>

              {/* Date */}
              <div className={styles.fieldGroup}>
                <label htmlFor="k-date" className={styles.fieldLabel}>Date</label>
                <input
                  id="k-date"
                  type="date"
                  value={draft.date}
                  onChange={e => setDraft(d => ({ ...d, date: e.target.value }))}
                  className={styles.input}
                  required
                />
              </div>

              {/* Récurrence */}
              <label className={styles.recurRow}>
                <input
                  type="checkbox"
                  checked={draft.recurring}
                  onChange={e => setDraft(d => ({ ...d, recurring: e.target.checked }))}
                />
                <span>🔁 Charge fixe — revient chaque mois à la même date</span>
              </label>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={addEntry.isPending || !draft.amount || parseFloat(draft.amount) <= 0}
              >
                {addEntry.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </form>
        </SlideUpModal>
      )}

      {/* ── Edit entry modal ─────────────────────────────────────────── */}
      {editTarget && (
        <SlideUpModal title="Modifier l'opération" onClose={() => setEditTarget(null)}>
            <form onSubmit={handleEditSubmit} className={styles.form}>
              {members.length > 0 && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Affecté à</label>
                  <div className={styles.catPills}>
                    <button
                      type="button"
                      className={[styles.catPill, editDraft.member_id === null ? styles.catPillActive : ''].join(' ')}
                      style={editDraft.member_id === null ? { background: 'rgba(224,123,84,0.13)', borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
                      onClick={() => setEditDraft(d => ({ ...d, member_id: null }))}
                    >
                      🏠 Foyer
                    </button>
                    {members.map((m, i) => {
                      const active = editDraft.member_id === m.id
                      const color  = memberColor(i)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={[styles.catPill, active ? styles.catPillActive : ''].join(' ')}
                          style={active ? { background: `${color}22`, borderColor: color, color } : {}}
                          onClick={() => setEditDraft(d => ({ ...d, member_id: m.id }))}
                        >
                          {m.display_name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Catégorie</label>
                <div className={styles.catPills}>
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      className={[
                        styles.catPill,
                        editDraft.category_id === cat.id ? styles.catPillActive : '',
                      ].join(' ')}
                      style={editDraft.category_id === cat.id
                        ? { background: `${catColor(cat)}22`, borderColor: catColor(cat), color: catColor(cat) }
                        : {}}
                      onClick={() => setEditDraft(d => ({ ...d, category_id: cat.id }))}
                    >
                      <span className={styles.catPillGlyph}>{catGlyph(cat.type)}</span>
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="e-amount" className={styles.fieldLabel}>Montant (€)</label>
                <input
                  id="e-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={editDraft.amount}
                  onChange={e => setEditDraft(d => ({ ...d, amount: e.target.value }))}
                  className={styles.input}
                  placeholder="0,00"
                  required
                  autoFocus
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="e-desc" className={styles.fieldLabel}>Description</label>
                <input
                  id="e-desc"
                  type="text"
                  value={editDraft.description}
                  onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                  className={styles.input}
                  placeholder="Ex. Restaurant, Loyer, Netflix…"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Tags</label>
                <TagInput tags={editDraft.tags} onChange={tags => setEditDraft(d => ({ ...d, tags }))} />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="e-date" className={styles.fieldLabel}>Date</label>
                <input
                  id="e-date"
                  type="date"
                  value={editDraft.date}
                  onChange={e => setEditDraft(d => ({ ...d, date: e.target.value }))}
                  className={styles.input}
                  required
                />
              </div>
              <label className={styles.recurRow}>
                <input
                  type="checkbox"
                  checked={editDraft.recurring}
                  onChange={e => setEditDraft(d => ({ ...d, recurring: e.target.checked }))}
                />
                <span>🔁 Charge fixe — revient chaque mois{editDraft.recurring ? '' : ' (décocher arrête la série)'}</span>
              </label>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={editEntry.isPending || !editDraft.amount || parseFloat(editDraft.amount) <= 0}
              >
                {editEntry.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </form>
        </SlideUpModal>
      )}

      {/* ── Budget settings modal ──────────────────────────────────────── */}
      {showBudget && (
        <SlideUpModal
          title={selectedMember ? `Budget — ${selectedMember.display_name}` : 'Paramètres Kakebo'}
          onClose={() => setShowBudget(false)}
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
                  value={budgetDraft}
                  onChange={e => setBudgetDraft(parseFloat(e.target.value) || 0)}
                  className={styles.input}
                />
              </div>
              <div className={styles.budgetSeparator}>
                <span className={styles.fieldLabel}>Budgets mensuels par catégorie</span>
              </div>
              {displayCategories.filter(c => c.type !== 'income').map(cat => (
                <div key={cat.id} className={styles.fieldGroup}>
                  {selectedMemberId ? (
                    <label className={styles.fieldLabel}>
                      <span className={styles.catDot} style={{ background: catColor(cat) }} />
                      {' '}{cat.name} (€)
                    </label>
                  ) : (
                    <label className={styles.fieldLabel}>
                      <span className={styles.catDot} style={{ background: catColor(cat) }} />
                      {' '}Catégorie & budget (€)
                    </label>
                  )}
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
                  </div>
                </div>
              ))}
              <button className={styles.submitBtn} onClick={saveBudget} disabled={updateObjectif.isPending || updateMemberObjectif.isPending}>
                {updateObjectif.isPending || updateMemberObjectif.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
        </SlideUpModal>
      )}

    </div>
  )
}

// ── TagInput ────────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')

  function add(raw: string) {
    const t = raw.trim().toLowerCase().replace(/^#+/, '')
    if (t && !tags.includes(t)) onChange([...tags, t])
    setInput('')
  }

  return (
    <div>
      {tags.length > 0 && (
        <div className={styles.tagEditChips}>
          {tags.map(t => (
            <span key={t} className={styles.tagEditChip}>
              #{t}
              <button type="button" onClick={() => onChange(tags.filter(x => x !== t))} aria-label={`Retirer ${t}`}>
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        className={styles.input}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input) }
          else if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1))
        }}
        onBlur={() => { if (input.trim()) add(input) }}
        placeholder="courses, vacances, voiture… (Entrée pour valider)"
      />
    </div>
  )
}
