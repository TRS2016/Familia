import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { format, addMonths, subMonths, getDaysInMonth } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Settings, X, Trash2 } from 'lucide-react'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import {
  useKakeboCategories,
  useKakeboEntries,
  useAddEntry,
  useDeleteEntry,
} from './useKakebo'
import { useKakeboRealtime } from './useKakeboRealtime'
import type { KakeboCategory, KakeboEntry } from './useKakebo'
import styles from './KakeboPage.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

const CAT_META: Record<string, { glyph: string; desc: string }> = {
  fixed:    { glyph: '必', desc: 'Loyer, courses, transport' },
  leisure:  { glyph: '楽', desc: 'Sorties, restaurants, sport' },
  variable: { glyph: '知', desc: 'Livres, abonnements, ciné' },
  extra:    { glyph: '他', desc: 'Imprévus, cadeaux, divers' },
  income:   { glyph: '入', desc: 'Salaires, aides, revenus' },
}

function catGlyph(type: string) { return CAT_META[type]?.glyph ?? '•' }
function catDesc(type: string)  { return CAT_META[type]?.desc ?? '' }
function catColor(cat: KakeboCategory | null | undefined) { return cat?.color ?? '#A89F97' }

function fmtEur(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

// Budget stored locally (no table for V1)
function loadBudget() {
  try {
    const s = localStorage.getItem('familia_kakebo_budget')
    return s ? JSON.parse(s) as { revenus: number; objectifEpargne: number } : { revenus: 3000, objectifEpargne: 400 }
  } catch { return { revenus: 3000, objectifEpargne: 400 } }
}

type View = 'bilan' | 'detail' | 'reflexion'

// ── Main component ────────────────────────────────────────────────────────────

export default function KakeboPage() {
  const [refDate, setRefDate] = useState(() => new Date())
  const year  = refDate.getFullYear()
  const month = refDate.getMonth() + 1 // 1-based

  const { data: categories = [], isLoading: catsLoading } = useKakeboCategories()
  const { data: entries = [], isLoading: entriesLoading } = useKakeboEntries(year, month)
  useKakeboRealtime(year, month)

  const addEntry    = useAddEntry(year, month)
  const deleteEntry = useDeleteEntry(year, month)

  const [view, setView]             = useState<View>('bilan')
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

  const [showAdd, setShowAdd]       = useState(false)
  const [showBudget, setShowBudget] = useState(false)
  const [budget, setBudgetState]    = useState(loadBudget)

  // Add form state
  const firstCatId = categories.find(c => c.type !== 'income')?.id ?? ''
  const [draft, setDraft] = useState({
    category_id: '',
    amount: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  })

  // Reset draft category when categories load
  useEffect(() => {
    if (categories.length > 0 && !draft.category_id) {
      setDraft(d => ({ ...d, category_id: firstCatId }))
    }
  }, [categories, firstCatId, draft.category_id])

  // Budget modal state
  const [budgetDraft, setBudgetDraft] = useState(budget)

  // ── Computations ──────────────────────────────────────────────────────────

  const expenseEntries = entries.filter(e => e.category?.type !== 'income')
  const totalByCategory: Record<string, number> = {}
  for (const cat of categories) totalByCategory[cat.id] = 0
  for (const e of expenseEntries) {
    if (e.category_id) totalByCategory[e.category_id] = (totalByCategory[e.category_id] ?? 0) + Number(e.amount)
  }
  const totalDepenses = Object.values(totalByCategory).reduce((s, v) => s + v, 0)
  const epargneReelle = budget.revenus - totalDepenses
  const solde         = epargneReelle - budget.objectifEpargne

  const moodEmoji = solde >= 0 ? '🌱' : solde >= -50 ? '🌤' : '🌧'
  const moodLabel = solde >= 0 ? 'Mois équilibré' : solde >= -50 ? 'Légèrement au-dessus' : 'Au-delà de l\'objectif'

  // Donut math
  const donutR = 54
  const donutC = 2 * Math.PI * donutR
  let cumPct = 0
  const spendCats = categories.filter(c => c.type !== 'income')
  const arcs = spendCats.map(cat => {
    const v = totalByCategory[cat.id] ?? 0
    const pct = totalDepenses > 0 ? v / totalDepenses : 0
    const dash = pct * donutC
    const offset = -cumPct * donutC
    cumPct += pct
    return { cat, pct, dash, offset, value: v }
  })

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

  function saveBudget() {
    localStorage.setItem('familia_kakebo_budget', JSON.stringify(budgetDraft))
    setBudgetState(budgetDraft)
    setShowBudget(false)
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
    })
    setDraft({ category_id: draft.category_id, amount: '', description: '', date: draft.date })
    setShowAdd(false)
  }

  const monthLabel = format(refDate, 'MMMM yyyy', { locale: fr })
    .replace(/^\w/, c => c.toUpperCase())

  const isLoading = catsLoading || entriesLoading

  const selectedCat = selectedCatId ? categories.find(c => c.id === selectedCatId) : null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/" className={styles.backLink} aria-label="Retour">
            {selectedCatId
              ? <button className={styles.backCatBtn} onClick={() => setSelectedCatId(null)} aria-label="Retour aux catégories">
                  <ChevronLeft size={20} strokeWidth={2.5} />
                </button>
              : <ChevronLeft size={22} strokeWidth={2.5} />
            }
          </Link>
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
          <button className={styles.iconBtn} onClick={() => setShowBudget(true)} aria-label="Paramètres">
            <Settings size={15} strokeWidth={2} />
          </button>
          <button className={styles.fabSmall} onClick={() => setShowAdd(true)} aria-label="Ajouter">
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

      {/* ── View tabs (hidden when drilling into a category) ──────────── */}
      {!selectedCatId && (
        <div className={styles.viewPills}>
          {(['bilan', 'detail', 'reflexion'] as View[]).map(v => (
            <button
              key={v}
              className={[styles.pill, view === v ? styles.pillActive : ''].join(' ')}
              onClick={() => setView(v)}
            >
              {v === 'bilan' ? 'Bilan' : v === 'detail' ? 'Détail' : 'Réflexion'}
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
              entries={entries.filter(e => e.category_id === selectedCatId)}
              revenus={budget.revenus}
              onDelete={id => deleteEntry.mutate(id)}
            />
          )}

          {/* ── Bilan ───────────────────────────────────────────────── */}
          {!selectedCatId && view === 'bilan' && (
            <BilanView
              arcs={arcs}
              donutR={donutR}
              donutC={donutC}
              totalDepenses={totalDepenses}
              revenus={budget.revenus}
              objectifEpargne={budget.objectifEpargne}
              epargneReelle={epargneReelle}
              solde={solde}
              moodEmoji={moodEmoji}
              moodLabel={moodLabel}
              dailyTotals={dailyTotals}
              maxDaily={maxDaily}
              todayDay={todayDay}

              recentEntries={[...entries].slice(0, 5)}
              onSelectCat={setSelectedCatId}
              onShowDetail={() => setView('detail')}
            />
          )}

          {/* ── Détail ──────────────────────────────────────────────── */}
          {!selectedCatId && view === 'detail' && (
            <DetailView
              categories={spendCats}
              entries={entries}
              onDelete={id => deleteEntry.mutate(id)}
            />
          )}

          {/* ── Réflexion ───────────────────────────────────────────── */}
          {!selectedCatId && view === 'reflexion' && (
            <ReflexionView
              epargneReelle={epargneReelle}
              objectifEpargne={budget.objectifEpargne}
              solde={solde}
              categories={spendCats}
              totalByCategory={totalByCategory}
            />
          )}

          {/* Empty state only for bilan with no entries */}
          {!selectedCatId && view === 'bilan' && entries.length === 0 && (
            <EmptyState
              emoji="📒"
              title="Aucune opération ce mois"
              description="Commence par ajouter une dépense avec le bouton +."
              action={{ label: 'Ajouter une opération', onClick: () => setShowAdd(true) }}
            />
          )}
        </>
      )}

      {/* ── Add entry modal ───────────────────────────────────────────── */}
      {showAdd && (
        <div className={styles.overlay} onClick={() => setShowAdd(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.dragHandle} />
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Nouvelle opération</h2>
              <button className={styles.closeBtn} onClick={() => setShowAdd(false)} aria-label="Fermer">
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className={styles.form}>
              {/* Category picker */}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Catégorie</label>
                <div className={styles.catPills}>
                  {categories.filter(c => c.type !== 'income').map(cat => (
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

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={addEntry.isPending || !draft.amount || parseFloat(draft.amount) <= 0}
              >
                {addEntry.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Budget settings modal ──────────────────────────────────────── */}
      {showBudget && (
        <div className={styles.overlay} onClick={() => setShowBudget(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.dragHandle} />
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Paramètres Kakebo</h2>
              <button className={styles.closeBtn} onClick={() => setShowBudget(false)} aria-label="Fermer">
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>
            <div className={styles.form}>
              <div className={styles.fieldGroup}>
                <label htmlFor="k-revenus" className={styles.fieldLabel}>Revenus mensuels (€)</label>
                <input
                  id="k-revenus"
                  type="number"
                  min="0"
                  step="1"
                  value={budgetDraft.revenus}
                  onChange={e => setBudgetDraft(d => ({ ...d, revenus: parseFloat(e.target.value) || 0 }))}
                  className={styles.input}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="k-objectif" className={styles.fieldLabel}>Objectif d'épargne (€)</label>
                <input
                  id="k-objectif"
                  type="number"
                  min="0"
                  step="1"
                  value={budgetDraft.objectifEpargne}
                  onChange={e => setBudgetDraft(d => ({ ...d, objectifEpargne: parseFloat(e.target.value) || 0 }))}
                  className={styles.input}
                />
              </div>
              <button className={styles.submitBtn} onClick={saveBudget}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Sub-views ─────────────────────────────────────────────────────────────────

function BilanView({
  arcs, donutR, donutC, totalDepenses, revenus, objectifEpargne,
  epargneReelle, solde, moodEmoji, moodLabel,
  dailyTotals, maxDaily, todayDay,
  recentEntries, onSelectCat, onShowDetail,
}: {
  arcs: { cat: KakeboCategory; pct: number; dash: number; offset: number; value: number }[]
  donutR: number; donutC: number
  totalDepenses: number; revenus: number; objectifEpargne: number
  epargneReelle: number; solde: number
  moodEmoji: string; moodLabel: string
  dailyTotals: number[]; maxDaily: number; todayDay: number
  recentEntries: KakeboEntry[]
  onSelectCat: (id: string) => void
  onShowDetail: () => void
}) {
  const epargnePct  = revenus > 0 ? Math.max(0, Math.min(1, epargneReelle / revenus)) : 0
  const objectifPct = revenus > 0 ? Math.max(0, Math.min(1, objectifEpargne / revenus)) : 0
  const positif = solde >= 0

  if (totalDepenses === 0 && recentEntries.length === 0) return null

  return (
    <div className={styles.scrollArea}>
      {/* Hero card */}
      <div className={styles.heroCard}>
        <div className={styles.heroTop}>
          {/* Donut */}
          <div className={styles.donutWrap}>
            <svg width="130" height="130" viewBox="0 0 130 130" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="65" cy="65" r={donutR} fill="none" stroke="var(--border)" strokeWidth="13" />
              {arcs.map((a, i) => (
                <circle key={i} cx="65" cy="65" r={donutR} fill="none"
                  stroke={catColor(a.cat)} strokeWidth="13" strokeLinecap="butt"
                  strokeDasharray={`${a.dash} ${donutC - a.dash}`}
                  strokeDashoffset={a.offset}
                />
              ))}
            </svg>
            <div className={styles.donutCenter}>
              <span className={styles.donutLabel}>Dépensé</span>
              <span className={styles.donutAmount}>{fmtEur(totalDepenses)}<span className={styles.donutEur}>€</span></span>
              <span className={styles.donutSub}>/ {fmtEur(revenus)} €</span>
            </div>
          </div>

          {/* Right column */}
          <div className={styles.heroRight}>
            <p className={styles.heroSubLabel}>Épargne réelle</p>
            <div className={styles.heroSavings} style={{ color: positif ? '#5B9E8F' : '#E07B54' }}>
              {fmtEur(epargneReelle)}<span className={styles.heroSavingsEur}>€</span>
            </div>
            <div className={styles.goalBox}>
              <div className={styles.goalRow}>
                <span className={styles.goalLabel}>Objectif {fmtEur(objectifEpargne)} €</span>
                <span className={styles.goalDelta} style={{ color: positif ? '#5B9E8F' : '#E07B54' }}>
                  {positif ? '+' : ''}{fmtEur(solde)} €
                </span>
              </div>
              <div className={styles.goalTrack}>
                <div className={styles.goalFill} style={{ width: `${epargnePct * 100}%`, background: positif ? '#5B9E8F' : '#E07B54' }} />
                <div className={styles.goalMarker} style={{ left: `${objectifPct * 100}%` }} />
              </div>
            </div>
            <div className={styles.mood}>
              <span className={styles.moodEmoji}>{moodEmoji}</span>
              <span className={styles.moodLabel}>{moodLabel}</span>
            </div>
          </div>
        </div>

        {/* Category legend 2×2 */}
        <div className={styles.catLegend}>
          {arcs.map(({ cat, pct }) => (
            <button key={cat.id} className={styles.catLegendItem} onClick={() => onSelectCat(cat.id)}>
              <span className={styles.catDot} style={{ background: catColor(cat) }} />
              <span className={styles.catLegendName}>{cat.name}</span>
              <span className={styles.catLegendPct}>{(pct * 100).toFixed(0)}%</span>
            </button>
          ))}
        </div>
      </div>

      {/* Daily rhythm */}
      <div className={styles.rhythmCard}>
        <div className={styles.rhythmHeader}>
          <span className={styles.rhythmTitle}>Rythme du mois</span>
          <span className={styles.rhythmAvg}>
            {todayDay > 0 ? fmtEur(totalDepenses / todayDay) : 0} €/jour
          </span>
        </div>
        <div className={styles.rhythmBars}>
          {dailyTotals.map((v, i) => {
            const h = v > 0 ? Math.max(3, (v / maxDaily) * 44) : 2
            const day = i + 1
            const isToday  = day === todayDay
            const isFuture = day > todayDay
            const bg = isFuture ? 'var(--border)' : isToday ? 'var(--accent)' : v > 0 ? '#C8B89A' : 'var(--border)'
            return (
              <div key={i} className={styles.rhythmBarWrap}>
                <div className={styles.rhythmBar} style={{ height: h, background: bg, opacity: v === 0 && !isToday ? 0.5 : 1 }} />
              </div>
            )
          })}
        </div>
        <div className={styles.rhythmAxis}>
          {[1, 8, 15, 22, dailyTotals.length].map(d => (
            <span key={d}>{d}</span>
          ))}
        </div>
      </div>

      {/* Category cards 2×2 */}
      <div className={styles.catGrid}>
        {arcs.map(({ cat, pct, value }) => {
          return (
            <button key={cat.id} className={styles.catCard} onClick={() => onSelectCat(cat.id)}>
              <div className={styles.catCardTop}>
                <div className={styles.catGlyphBox} style={{ background: catColor(cat) }}>
                  {catGlyph(cat.type)}
                </div>
                <ChevronRight size={13} strokeWidth={2} color="var(--text-muted)" />
              </div>
              <p className={styles.catCardName}>{cat.name}</p>
              <div className={styles.catCardAmount}>
                <span className={styles.catCardAmountVal}>{fmtEur(value)}</span>
                <span className={styles.catCardAmountEur}>€</span>
              </div>
              <div className={styles.catCardTrack}>
                <div className={styles.catCardFill} style={{ width: `${Math.min(pct * 100, 100)}%`, background: catColor(cat) }} />
              </div>
              <div className={styles.catCardMeta}>
                <span>{recentEntries.filter(e => e.category_id === cat.id).length} op.</span>
                <span style={{ color: catColor(cat) }}>{(pct * 100).toFixed(0)}%</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Recent entries */}
      {recentEntries.length > 0 && (
        <>
          <div className={styles.sectionRow}>
            <span className={styles.sectionLabel}>Dernières opérations</span>
            <button className={styles.sectionLink} onClick={onShowDetail}>Tout voir →</button>
          </div>
          <div className={styles.entryList}>
            {recentEntries.map((e, i) => (
              <EntryRow key={e.id} entry={e} showBorder={i < recentEntries.length - 1} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function DetailView({
  categories, entries, onDelete,
}: {
  categories: KakeboCategory[]
  entries: KakeboEntry[]
  onDelete: (id: string) => void
}) {
  return (
    <div className={styles.scrollArea}>
      {categories.map(cat => {
        const catEntries = entries
          .filter(e => e.category_id === cat.id)
          .sort((a, b) => b.date.localeCompare(a.date))
        const total = catEntries.reduce((s, e) => s + Number(e.amount), 0)
        return (
          <div key={cat.id} className={styles.detailGroup}>
            <div className={styles.detailGroupHeader}>
              <div className={styles.detailGroupLeft}>
                <div className={styles.catGlyphBoxSm} style={{ background: catColor(cat) }}>
                  {catGlyph(cat.type)}
                </div>
                <span className={styles.detailGroupName}>{cat.name}</span>
                <span className={styles.detailGroupCount}>· {catEntries.length}</span>
              </div>
              <span className={styles.detailGroupTotal} style={{ color: catColor(cat) }}>
                {fmtEur(total)} €
              </span>
            </div>
            {catEntries.length === 0
              ? <p className={styles.detailEmpty}>Aucune dépense</p>
              : (
                <div className={styles.entryList}>
                  {catEntries.map((e, i) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      showBorder={i < catEntries.length - 1}
                      onDelete={() => onDelete(e.id)}
                    />
                  ))}
                </div>
              )
            }
          </div>
        )
      })}
    </div>
  )
}

function CategoryDetail({
  cat, entries, revenus, onDelete,
}: {
  cat: KakeboCategory
  entries: KakeboEntry[]
  revenus: number
  onDelete: (id: string) => void
}) {
  const total    = entries.reduce((s, e) => s + Number(e.amount), 0)
  const count    = entries.length
  const avg      = count > 0 ? total / count : 0
  const pctRev   = revenus > 0 ? (total / revenus) * 100 : 0
  const sorted   = [...entries].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className={styles.scrollArea}>
      <div className={styles.catDetailHero} style={{ '--cat-color': catColor(cat) } as React.CSSProperties}>
        <div className={styles.catDetailBg} style={{ background: `${catColor(cat)}14` }} />
        <div className={styles.catDetailTop}>
          <div>
            <p className={styles.catDetailSublabel}>Total ce mois</p>
            <p className={styles.catDetailTotal} style={{ color: catColor(cat) }}>
              {fmtEur(total)}<span className={styles.catDetailEur}>€</span>
            </p>
            <p className={styles.catDetailDesc}>{catDesc(cat.type)}</p>
          </div>
          <div className={styles.catDetailGlyph} style={{ background: catColor(cat) }}>
            {catGlyph(cat.type)}
          </div>
        </div>
        <div className={styles.catDetailStats}>
          {[
            { l: 'Opérations', v: count },
            { l: 'Moyenne',    v: `${fmtEur(avg)} €` },
            { l: '% revenus',  v: `${pctRev.toFixed(0)}%` },
          ].map(s => (
            <div key={s.l} className={styles.catDetailStat}>
              <p className={styles.catDetailStatLabel}>{s.l}</p>
              <p className={styles.catDetailStatValue}>{s.v}</p>
            </div>
          ))}
        </div>
      </div>

      <p className={styles.sectionLabel} style={{ marginBottom: 8 }}>Toutes les opérations</p>
      {sorted.length === 0
        ? <p className={styles.detailEmpty}>Aucune dépense ce mois</p>
        : (
          <div className={styles.entryList}>
            {sorted.map((e, i) => (
              <EntryRow
                key={e.id}
                entry={e}
                showBorder={i < sorted.length - 1}
                onDelete={() => onDelete(e.id)}
              />
            ))}
          </div>
        )
      }
    </div>
  )
}

function ReflexionView({
  epargneReelle, objectifEpargne, solde, categories, totalByCategory,
}: {
  epargneReelle: number; objectifEpargne: number; solde: number
  categories: KakeboCategory[]
  totalByCategory: Record<string, number>
}) {
  const questions = [
    'Combien d\'argent ai-je en ce moment ?',
    'Combien d\'argent voudrais-je épargner ?',
    'Combien d\'argent ai-je dépensé ?',
    'Comment puis-je améliorer mes dépenses ?',
  ]
  const qColors = ['#E07B54', '#5B9E8F', '#E07B54', '#9B7AC4']
  const positif = solde >= 0

  return (
    <div className={styles.scrollArea}>
      <div className={styles.quoteCard}>
        <span className={styles.quoteGlyph}>"</span>
        <p className={styles.quoteText}>
          Le Kakebo est un journal de bord financier qui vous invite à réfléchir consciemment à votre rapport à l'argent.
        </p>
        <p className={styles.quoteAuthor}>— HANI MOTOKO · 1904</p>
      </div>

      <p className={styles.sectionLabel}>Les 4 questions du mois</p>

      {questions.map((q, i) => (
        <div key={i} className={styles.questionCard} style={{ borderLeftColor: qColors[i] }}>
          <div className={styles.questionTop}>
            <span className={styles.questionNum} style={{ color: qColors[i] }}>{i + 1}</span>
            <p className={styles.questionText}>{q}</p>
          </div>
          {i === 0 && <p className={styles.questionAnswer} style={{ color: positif ? '#5B9E8F' : '#E07B54' }}>{fmtEur(epargneReelle)} €</p>}
          {i === 1 && <p className={styles.questionAnswer}>{fmtEur(objectifEpargne)} €</p>}
          {i === 2 && (
            <div className={styles.questionCats}>
              {categories.map(cat => (
                <div key={cat.id} className={styles.questionCatRow}>
                  <span className={styles.catDot} style={{ background: catColor(cat) }} />
                  <span className={styles.questionCatName}>{cat.name}</span>
                  <span className={styles.questionCatVal}>{fmtEur(totalByCategory[cat.id] ?? 0)} €</span>
                </div>
              ))}
            </div>
          )}
          {i === 3 && (
            <p className={styles.questionAnswer} style={{ color: 'var(--text-sub)', fontSize: 12 }}>
              {positif
                ? `Bravo — vous avez épargné ${fmtEur(solde)} € de plus que votre objectif.`
                : `Vous dépassez votre objectif de ${fmtEur(Math.abs(solde))} €. Quelles dépenses pourriez-vous réduire ?`
              }
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function EntryRow({ entry, showBorder, onDelete }: {
  entry: KakeboEntry
  showBorder: boolean
  onDelete?: () => void
}) {
  const cat = entry.category
  return (
    <div className={[styles.entryRow, showBorder ? styles.entryRowBorder : ''].join(' ')}>
      <div className={styles.entryDateBox} style={{ background: `${catColor(cat)}1F` }}>
        <span className={styles.entryDay} style={{ color: catColor(cat) }}>
          {entry.date.slice(8)}
        </span>
        <span className={styles.entryMon} style={{ color: catColor(cat) }}>
          {['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'][parseInt(entry.date.slice(5, 7)) - 1]}
        </span>
      </div>
      <div className={styles.entryBody}>
        <p className={styles.entryDesc}>{entry.description ?? cat?.name ?? '—'}</p>
        <p className={styles.entryMeta}>{cat?.name}{entry.member?.display_name ? ` · ${entry.member.display_name}` : ''}</p>
      </div>
      <div className={styles.entryRight}>
        <span className={styles.entryAmount}>−{fmtEur(Number(entry.amount))} €</span>
        {onDelete && (
          <button className={styles.deleteBtn} onClick={onDelete} aria-label="Supprimer">
            <Trash2 size={14} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  )
}
