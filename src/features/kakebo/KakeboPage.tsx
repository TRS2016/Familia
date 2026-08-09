import { useState, useEffect, useMemo } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { format, addMonths, subMonths, getDaysInMonth } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Settings, Download } from 'lucide-react'
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
  useKakeboMembers,
  useKakeboMemberBudgets,
  useMaterializeRecurring,
} from './useKakebo'
import { useKakeboRealtime } from './useKakeboRealtime'
import type { KakeboEntry } from './useKakebo'
import { memberColor } from '../../lib/constants'
import styles from './KakeboPage.module.css'

import { isSpendType, isSavingType, csvCell, lastDayOfMonth, EMPTY_DRAFT } from './kakebo.utils'
import type { EntryDraft } from './kakebo.utils'
import SavingGoalsCard from './SavingGoalsCard'
import { useSavingGoals, useArchivedSavingGoals } from './useSavingGoals'
import EntryForm from './EntryForm'
import BudgetSettings from './BudgetSettings'
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
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`

  // Les mois passés sont en lecture seule : ni ajout, ni édition, ni
  // suppression — uniquement la duplication d'une opération vers aujourd'hui.
  const _now = new Date()
  const isCurrentMonth = year === _now.getFullYear() && month === _now.getMonth() + 1
  const isPastMonth = year < _now.getFullYear() || (year === _now.getFullYear() && month < _now.getMonth() + 1)

  const { data: categories = [], isLoading: catsLoading } = useKakeboCategories()
  const { data: entries = [], isLoading: entriesLoading } = useKakeboEntries(year, month)
  const { objectif } = useKakeboObjectif()
  const { data: trendEntries = [], isLoading: trendLoading } = useKakeboTrend(12)
  const { data: members = [] } = useKakeboMembers()
  useMaterializeRecurring() // génère les occurrences récurrentes manquantes du mois courant
  useKakeboRealtime()

  const { showToast } = useToast()

  const addEntry    = useAddEntry()
  const replayEntry = useAddEntry()
  const editEntry   = useEditEntry(year, month)
  const deleteEntry = useDeleteEntry(year, month)

  const [view, setView]             = useState<View>('bilan')
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  const { data: memberBudgets = [] } = useKakeboMemberBudgets(selectedMemberId)
  const selectedMember = members.find(m => m.id === selectedMemberId) ?? null

  const { data: savingGoals = [] } = useSavingGoals()
  const { data: archivedGoals = [] } = useArchivedSavingGoals()
  const [showAdd, setShowAdd]       = useState(false)
  const [showBudget, setShowBudget] = useState(false)

  const [editTarget, setEditTarget] = useState<KakeboEntry | null>(null)
  const [editDraft, setEditDraft]   = useState<EntryDraft>(EMPTY_DRAFT)
  // Portée de l'édition d'une charge récurrente : cette occurrence ou toute la série.
  const [editScope, setEditScope]   = useState<'one' | 'series'>('one')

  const firstCatId = categories.find(c => c.type !== 'income')?.id ?? ''
  const [draft, setDraft] = useState<EntryDraft>(() => ({
    ...EMPTY_DRAFT,
    date: format(new Date(), 'yyyy-MM-dd'),
  }))

  // Reset draft category when categories load
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (categories.length > 0 && !draft.category_id) {
      setDraft(d => ({ ...d, category_id: firstCatId }))
    }
  }, [categories, firstCatId, draft.category_id])
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * Ouvre le modal d'ajout en pré-affectant à la vue courante (Foyer ou membre)
   * et en calant la date sur le mois consulté : sans ça, on saisissait une
   * opération datée d'aujourd'hui tout en consultant un autre mois, et elle
   * disparaissait de la liste au premier refetch.
   */
  function openAddModal() {
    setDraft(d => ({
      ...d,
      member_id: selectedMemberId,
      date: isCurrentMonth ? format(new Date(), 'yyyy-MM-dd') : `${monthPrefix}-01`,
    }))
    setShowAdd(true)
  }

  // ── Member-aware derived data ──────────────────────────────────────────────

  // Buckets séparés : Foyer = dépenses communes (member_id null),
  // membre = ses dépenses perso uniquement. Pas de chevauchement.
  const displayEntries = useMemo(() => (
    selectedMemberId
      ? entries.filter(e => e.member_id === selectedMemberId)
      : entries.filter(e => e.member_id === null)
  ), [entries, selectedMemberId])

  const displayTrendEntries = useMemo(() => (
    selectedMemberId
      ? trendEntries.filter(e => e.member_id === selectedMemberId)
      : trendEntries.filter(e => e.member_id === null)
  ), [trendEntries, selectedMemberId])

  // Override monthly_budget per category with member-specific values when a member is selected
  const displayCategories = useMemo(() => categories.map(cat => ({
    ...cat,
    monthly_budget: selectedMemberId
      ? (memberBudgets.find(b => b.category_id === cat.id)?.monthly_budget ?? null)
      : cat.monthly_budget,
  })), [categories, selectedMemberId, memberBudgets])

  const effectiveObjectif = selectedMemberId
    ? (selectedMember?.kakebo_objectif_epargne ?? 0)
    : objectif

  // ── Previous month expenses (for delta badge in BilanView) ────────────────

  const prevMonthExpenses = useMemo(() => {
    const prefix = format(subMonths(refDate, 1), 'yyyy-MM')
    return displayTrendEntries
      .filter(e => e.date.startsWith(prefix) && isSpendType(e.category?.type))
      .reduce((s, e) => s + Number(e.amount), 0)
  }, [displayTrendEntries, refDate])

  // ── Computations ──────────────────────────────────────────────────────────

  const {
    totalRevenusMois, totalByCategory, totalDepenses, totalEpargneMiseDeCote,
    epargneReelle, solde, expenseEntries,
  } = useMemo(() => {
    const incomeEntries  = displayEntries.filter(e => e.category?.type === 'income')
    const expenses       = displayEntries.filter(e => isSpendType(e.category?.type))
    const savingEntries  = displayEntries.filter(e => isSavingType(e.category?.type))
    const revenus = incomeEntries.reduce((s, e) => s + Number(e.amount), 0)

    // Dépenses de consommation uniquement (l'épargne est comptée à part).
    const byCat: Record<string, number> = {}
    for (const cat of displayCategories) byCat[cat.id] = 0
    for (const e of expenses) {
      if (e.category_id) byCat[e.category_id] = (byCat[e.category_id] ?? 0) + Number(e.amount)
    }
    const depenses = Object.values(byCat).reduce((s, v) => s + v, 0)
    // Épargne mise de côté : virements vers l'épargne (sortie du courant, pas une
    // dépense). Suivie séparément, n'entre pas dans l'épargne réelle résiduelle.
    const miseDeCote = savingEntries.reduce((s, e) => s + Number(e.amount), 0)
    const reelle = revenus - depenses
    return {
      totalRevenusMois: revenus,
      totalByCategory: byCat,
      totalDepenses: depenses,
      totalEpargneMiseDeCote: miseDeCote,
      epargneReelle: reelle,
      solde: reelle - effectiveObjectif,
      expenseEntries: expenses,
    }
  }, [displayEntries, displayCategories, effectiveObjectif])

  const moodEmoji = solde >= 0 ? '🌱' : solde >= -50 ? '🌤' : '🌧'
  const moodLabel = solde >= 0 ? 'Mois équilibré' : solde >= -50 ? 'Légèrement au-dessus' : 'Au-delà de l\'objectif'

  // Donut math
  const donutR = 54
  const donutC = 2 * Math.PI * donutR
  const spendCats = useMemo(() => displayCategories.filter(c => isSpendType(c.type)), [displayCategories])

  const arcs = useMemo(() => {
    const bases = spendCats.map(cat => {
      const v = totalByCategory[cat.id] ?? 0
      return { cat, pct: totalDepenses > 0 ? v / totalDepenses : 0, value: v }
    })
    // Prefix sums: cumPcts[i] = sum of pcts before index i (no mutation needed)
    const cumPcts = bases.reduce<number[]>((acc, a) => [...acc, acc[acc.length - 1] + a.pct], [0])
    return bases.map((a, i) => ({ ...a, dash: a.pct * donutC, offset: -cumPcts[i] * donutC }))
  }, [spendCats, totalByCategory, totalDepenses, donutC])

  // Daily rhythm
  const daysCount = getDaysInMonth(refDate)
  const todayDay  = isCurrentMonth ? new Date().getDate() : daysCount
  const dailyTotals = useMemo(() => Array.from({ length: daysCount }, (_, i) => {
    const day = String(i + 1).padStart(2, '0')
    return expenseEntries
      .filter(e => e.date === `${monthPrefix}-${day}`)
      .reduce((s, e) => s + Number(e.amount), 0)
  }), [daysCount, expenseEntries, monthPrefix])
  const maxDaily = Math.max(1, ...dailyTotals)

  // Projets d'épargne proposés au formulaire : les actifs, plus celui déjà
  // rattaché à l'opération même s'il est archivé (sinon il devient invisible
  // et l'opération non réaffectable).
  function goalsFor(currentId: string | null) {
    const archived = currentId ? archivedGoals.filter(g => g.id === currentId) : []
    return [...savingGoals, ...archived]
  }

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
      series_end: entry.series_end ?? null,
      saving_goal_id: entry.saving_goal_id ?? null,
    })
    setEditScope('one')
    setEditTarget(entry)
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    const amount = parseFloat(editDraft.amount)
    if (!editDraft.category_id || isNaN(amount) || amount <= 0) return
    const editCat = categories.find(c => c.id === editDraft.category_id)
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
      series_end: editDraft.recurring ? editDraft.series_end : null,
      saving_goal_id: isSavingType(editCat?.type) ? editDraft.saving_goal_id : null,
      scope: editDraft.series_id ? editScope : 'one',
    })
    setEditTarget(null)
  }

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault()
    const amount = parseFloat(draft.amount)
    if (!draft.category_id || isNaN(amount) || amount <= 0) return
    const addCat = categories.find(c => c.id === draft.category_id)
    await addEntry.mutateAsync({
      category_id: draft.category_id,
      amount,
      date: draft.date,
      description: draft.description,
      member_id: draft.member_id,
      tags: draft.tags,
      recurring: draft.recurring,
      series_end: draft.recurring ? draft.series_end : null,
      saving_goal_id: isSavingType(addCat?.type) ? draft.saving_goal_id : null,
    })
    setDraft(d => ({ ...d, amount: '', description: '', tags: [], recurring: false, series_end: null, saving_goal_id: null }))
    setShowAdd(false)
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
        series_end: null,
        saving_goal_id: entry.saving_goal_id ?? null,
      },
      { onSuccess: () => showToast({ type: 'success', message: 'Opération dupliquée pour aujourd\'hui.' }) }
    )
  }

  function exportCsv() {
    const header = ['Date', 'Catégorie', 'Type', 'Description', 'Membre', 'Tags', 'Projet', 'Montant'].join(',') + '\n'
    const goalName = (id: string | null) =>
      id ? ([...savingGoals, ...archivedGoals].find(g => g.id === id)?.name ?? '') : ''
    const rows = [...displayEntries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(e => [
        e.date,
        csvCell(e.category?.name ?? ''),
        e.category?.type ?? '',
        csvCell(e.description ?? ''),
        csvCell(e.member?.display_name ?? 'Foyer'),
        csvCell((e.tags ?? []).join(' ')),
        csvCell(goalName(e.saving_goal_id)),
        // Revenus en positif, dépenses en négatif pour un grand livre lisible.
        (e.category?.type === 'income' ? Number(e.amount) : -Number(e.amount)).toFixed(2),
      ].join(','))
      .join('\n')
    // Lignes de synthèse en pied de fichier.
    const totals = [
      '',
      `\nTotal revenus,,,,,,,${totalRevenusMois.toFixed(2)}`,
      `Total dépenses,,,,,,,${(-totalDepenses).toFixed(2)}`,
      `Épargne mise de côté,,,,,,,${(-totalEpargneMiseDeCote).toFixed(2)}`,
      `Épargne réelle,,,,,,,${epargneReelle.toFixed(2)}`,
    ].join('\n')
    const blob = new Blob(['﻿' + header + rows + totals], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const suffix = selectedMember ? `-${selectedMember.display_name.toLowerCase()}` : ''
    a.download = `kakebo-${monthPrefix}${suffix}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
          <button className={styles.iconBtn} onClick={() => setShowBudget(true)} aria-label="Paramètres">
            <Settings size={15} strokeWidth={2} />
          </button>
          {!isPastMonth && (
            <button className={styles.fabSmall} onClick={openAddModal} aria-label="Ajouter">
              <Plus size={16} strokeWidth={2.5} />
            </button>
          )}
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

      {isPastMonth && !selectedCatId && (
        <p className={styles.readOnlyNote}>Mois clôturé — consultation seule. Utilise ↻ pour rejouer une opération aujourd'hui.</p>
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
              trendEntries={displayTrendEntries.filter(e => e.category_id === selectedCatId)}
              revenus={totalRevenusMois}
              onEdit={openEdit}
              onDelete={entry => deleteEntry.mutate(entry)}
              onReplay={handleReplay}
              readOnly={isPastMonth}
            />
          )}

          {/* ── Bilan ───────────────────────────────────────────────── */}
          {!selectedCatId && view === 'bilan' && <SavingGoalsCard />}
          {!selectedCatId && view === 'bilan' && (
            <BilanView
              arcs={arcs}
              donutR={donutR}
              donutC={donutC}
              totalDepenses={totalDepenses}
              revenus={totalRevenusMois}
              objectifEpargne={effectiveObjectif}
              epargneReelle={epargneReelle}
              epargneMiseDeCote={totalEpargneMiseDeCote}
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
              readOnly={isPastMonth}
            />
          )}

          {/* ── Détail ──────────────────────────────────────────────── */}
          {!selectedCatId && view === 'detail' && (
            <DetailView
              categories={displayCategories}
              entries={displayEntries}
              onEdit={openEdit}
              onDelete={entry => deleteEntry.mutate(entry)}
              onReplay={handleReplay}
              readOnly={isPastMonth}
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
            <TrendView
              entries={displayTrendEntries}
              isLoading={trendLoading}
              categories={displayCategories}
              onSelectMonth={date => { setRefDate(date); setView('bilan') }}
            />
          )}

          {/* Empty state only for bilan with no entries */}
          {!selectedCatId && view === 'bilan' && displayEntries.length === 0 && (
            <EmptyState
              emoji="📒"
              title="Aucune opération ce mois"
              description={isPastMonth
                ? 'Ce mois est clôturé : aucune opération n\'y a été enregistrée.'
                : 'Commence par ajouter une dépense avec le bouton +.'}
              action={isPastMonth ? undefined : { label: 'Ajouter une opération', onClick: openAddModal }}
            />
          )}
        </>
      )}

      {/* ── Add entry modal ───────────────────────────────────────────── */}
      {showAdd && (
        <SlideUpModal title="Nouvelle opération" onClose={() => setShowAdd(false)}>
          <EntryForm
            idPrefix="k"
            draft={draft}
            setDraft={setDraft}
            categories={categories}
            members={members}
            savingGoals={goalsFor(draft.saving_goal_id)}
            dateMin={`${monthPrefix}-01`}
            dateMax={lastDayOfMonth(year, month)}
            isPending={addEntry.isPending}
            submitLabel="Enregistrer"
            onSubmit={handleAddSubmit}
          />
        </SlideUpModal>
      )}

      {/* ── Edit entry modal ─────────────────────────────────────────── */}
      {editTarget && (
        <SlideUpModal title="Modifier l'opération" onClose={() => setEditTarget(null)}>
          <EntryForm
            idPrefix="e"
            draft={editDraft}
            setDraft={setEditDraft}
            categories={categories}
            members={members}
            savingGoals={goalsFor(editDraft.saving_goal_id)}
            scope={editScope}
            setScope={setEditScope}
            isPending={editEntry.isPending}
            submitLabel="Enregistrer"
            onSubmit={handleEditSubmit}
          />
        </SlideUpModal>
      )}

      {/* ── Budget settings modal ──────────────────────────────────────── */}
      {showBudget && (
        <BudgetSettings
          selectedMemberId={selectedMemberId}
          selectedMember={selectedMember}
          categories={categories}
          displayCategories={displayCategories}
          effectiveObjectif={effectiveObjectif}
          onClose={() => setShowBudget(false)}
        />
      )}

    </div>
  )
}
