import { ChevronRight } from 'lucide-react'
import { catColor, catGlyph, fmtEur } from './kakebo.utils'
import EntryRow from './EntryRow'
import type { KakeboCategory, KakeboEntry } from './useKakebo'
import styles from './KakeboPage.module.css'

export default function BilanView({
  arcs, donutR, donutC, totalDepenses, revenus, objectifEpargne,
  epargneReelle, solde, moodEmoji, moodLabel,
  dailyTotals, maxDaily, todayDay,
  entries, prevMonthExpenses,
  onSelectCat, onShowDetail, onEdit, onReplay,
}: {
  arcs: { cat: KakeboCategory; pct: number; dash: number; offset: number; value: number }[]
  donutR: number; donutC: number
  totalDepenses: number; revenus: number; objectifEpargne: number
  epargneReelle: number; solde: number
  moodEmoji: string; moodLabel: string
  dailyTotals: number[]; maxDaily: number; todayDay: number
  entries: KakeboEntry[]
  prevMonthExpenses?: number
  onSelectCat: (id: string) => void
  onShowDetail: () => void
  onEdit: (entry: KakeboEntry) => void
  onReplay: (entry: KakeboEntry) => void
}) {
  const epargnePct  = revenus > 0 ? Math.max(0, Math.min(1, epargneReelle / revenus)) : 0
  const objectifPct = revenus > 0 ? Math.max(0, Math.min(1, objectifEpargne / revenus)) : 0
  const positif = solde >= 0

  const daysCount  = dailyTotals.length
  const projection = todayDay > 0 && todayDay < daysCount
    ? Math.round((totalDepenses / todayDay) * daysCount)
    : null

  const prevDelta = (prevMonthExpenses && prevMonthExpenses > 0 && totalDepenses > 0)
    ? ((totalDepenses - prevMonthExpenses) / prevMonthExpenses) * 100
    : null

  const top3 = [...entries]
    .filter(e => e.category?.type !== 'income' && Number(e.amount) > 0)
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 3)

  const recentEntries = entries.slice(0, 5)
  if (totalDepenses === 0 && entries.length === 0) return null

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
              {prevDelta !== null && (
                <span
                  className={styles.heroMvmt}
                  style={{
                    color:      prevDelta <= 0 ? '#5B9E8F' : '#E07B54',
                    background: prevDelta <= 0 ? 'rgba(91,158,143,0.12)' : 'rgba(224,123,84,0.12)',
                  }}
                >
                  {prevDelta >= 0 ? '+' : ''}{prevDelta.toFixed(0)}%
                </span>
              )}
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
        {projection !== null && (
          <div className={styles.rhythmProjection}>
            <span>Projection fin de mois</span>
            <span className={styles.rhythmProjectionVal}>{fmtEur(projection)} €</span>
          </div>
        )}
      </div>

      {/* Top 3 dépenses */}
      {top3.length > 0 && (
        <div className={styles.topCard}>
          <p className={styles.topTitle}>Plus grosses dépenses</p>
          {top3.map((e, i) => (
            <div key={e.id} className={styles.topRow}>
              <span className={styles.topRank}>#{i + 1}</span>
              <span className={styles.catDot} style={{ background: catColor(e.category ?? null) }} />
              <span className={styles.topDesc}>{e.description || e.category?.name || '—'}</span>
              <span className={styles.topAmount}>{fmtEur(Number(e.amount))} €</span>
            </div>
          ))}
        </div>
      )}

      {/* Category cards 2×2 */}
      <div className={styles.catGrid}>
        {arcs.map(({ cat, pct, value }) => {
          const budget = cat.monthly_budget
          const overBudget = budget != null && value > budget
          const budgetPct = budget != null ? Math.min(value / budget * 100, 100) : Math.min(pct * 100, 100)
          const barColor = budget != null ? (overBudget ? 'var(--danger)' : '#5B9E8F') : catColor(cat)
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
                {budget != null && (
                  <span className={styles.catCardBudgetOf} style={{ color: overBudget ? 'var(--danger)' : 'var(--text-muted)' }}>
                    /{fmtEur(budget)}
                  </span>
                )}
              </div>
              <div className={styles.catCardTrack}>
                <div className={styles.catCardFill} style={{ width: `${budgetPct}%`, background: barColor }} />
              </div>
              <div className={styles.catCardMeta}>
                <span>{entries.filter(e => e.category_id === cat.id).length} op.</span>
                {budget != null
                  ? <span style={{ color: barColor }}>{overBudget ? '⚠ Dépassé' : `${budgetPct.toFixed(0)}%`}</span>
                  : <span style={{ color: catColor(cat) }}>{(pct * 100).toFixed(0)}%</span>
                }
              </div>
            </button>
          )
        })}
      </div>

      {/* Recent entries */}
      {recentEntries.length > 0 && (
        <div className={styles.recentBlock}>
          <div className={styles.sectionRow}>
            <span className={styles.sectionLabel}>Dernières opérations</span>
            <button className={styles.sectionLink} onClick={onShowDetail}>Tout voir →</button>
          </div>
          <div className={styles.entryList}>
            {recentEntries.map((e, i) => (
              <EntryRow key={e.id} entry={e} showBorder={i < recentEntries.length - 1} onEdit={() => onEdit(e)} onReplay={() => onReplay(e)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
