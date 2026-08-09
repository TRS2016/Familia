import Spinner from '../../components/Spinner'
import { catColor, fmtEur, isSpendType, isPocketDetail, spendTotal, MONTH_LABELS_FR } from './kakebo.utils'
import type { KakeboCategory, KakeboEntry } from './useKakebo'
import styles from './KakeboPage.module.css'

export default function TrendView({ entries, isLoading, categories, onSelectMonth }: {
  entries: KakeboEntry[]
  isLoading: boolean
  categories: KakeboCategory[]
  onSelectMonth: (date: Date) => void
}) {
  if (isLoading) {
    return <div className={styles.spinnerWrap}><Spinner size={32} /></div>
  }

  const now = new Date()
  const months = Array.from({ length: 12 }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      prefix:    `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label:     MONTH_LABELS_FR[d.getMonth()],
      date:      d,
      isCurrent: i === 11,
    }
  })

  const byMonth = months.map(m => {
    const mes      = entries.filter(e => e.date.startsWith(m.prefix))
    const depenses = spendTotal(mes)
    const revenus  = mes.filter(e => e.category?.type === 'income').reduce((s, e) => s + Number(e.amount), 0)
    return { ...m, depenses, revenus, savings: revenus - depenses }
  })

  const maxVal = Math.max(1, ...byMonth.flatMap(m => [m.depenses, m.revenus]))
  const BAR_H  = 100

  // Month-over-month delta
  const prevM      = byMonth[byMonth.length - 2]
  const currM      = byMonth[byMonth.length - 1]
  const monthDelta = prevM?.depenses > 0
    ? ((currM.depenses - prevM.depenses) / prevM.depenses) * 100
    : null

  // ── Savings SVG line chart ─────────────────────────────────────────────────

  const SL_W = 300, SL_H = 48
  const activeMonths = byMonth.filter(m => m.revenus > 0 || m.depenses > 0)
  const minSav  = Math.min(0, ...byMonth.map(m => m.savings))
  const maxSav  = Math.max(1, ...byMonth.map(m => m.savings))
  const savRange = maxSav - minSav || 1
  const zeroY    = +(SL_H - ((0 - minSav) / savRange) * SL_H).toFixed(1)

  const savPts = byMonth.map((m, i) => ({
    x: +((i / (byMonth.length - 1)) * SL_W).toFixed(1),
    y: +(SL_H - ((m.savings - minSav) / savRange) * SL_H).toFixed(1),
    savings:   m.savings,
    isCurrent: m.isCurrent,
    label:     m.label,
    date:      m.date,
  }))
  const savPath = savPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  // ── Annual summary ─────────────────────────────────────────────────────────

  const year         = now.getFullYear()
  const yearEntries  = entries.filter(e => e.date.startsWith(`${year}-`))
  // Somme des totaux mensuels : le dépassement d'enveloppe se calcule mois par
  // mois, l'agréger sur l'année d'un coup donnerait un chiffre différent.
  const yearExpenses = byMonth
    .filter(m => m.prefix.startsWith(`${year}-`))
    .reduce((s, m) => s + m.depenses, 0)
  const yearIncome   = yearEntries.filter(e => e.category?.type === 'income').reduce((s, e) => s + Number(e.amount), 0)
  const yearBalance  = yearIncome - yearExpenses

  const spendCats = categories.filter(c => isSpendType(c.type))
  const byCat = spendCats
    .map(cat => ({
      cat,
      total: yearEntries
        .filter(e => e.category_id === cat.id && !isPocketDetail(e))
        .reduce((s, e) => s + Number(e.amount), 0),
    }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total)
  const catTotal = byCat.reduce((s, x) => s + x.total, 0)

  return (
    <div className={styles.scrollArea}>

      {/* ── Bar chart ─────────────────────────────────────────────────── */}
      <div className={styles.trendCard}>
        <div className={styles.trendCardHead}>
          <p className={styles.trendTitle}>Dépenses sur 12 mois</p>
          {monthDelta !== null && (
            <span
              className={styles.trendDeltaBadge}
              style={{
                color:      monthDelta <= 0 ? '#5B9E8F' : '#E07B54',
                background: monthDelta <= 0 ? 'rgba(91,158,143,0.12)' : 'rgba(224,123,84,0.12)',
              }}
            >
              {monthDelta >= 0 ? '+' : ''}{monthDelta.toFixed(0)}% vs mois préc.
            </span>
          )}
        </div>

        <div
          className={styles.trendBars}
          role="img"
          aria-label={`Dépenses et revenus sur 12 mois. ${byMonth.map(m => `${m.label} : ${fmtEur(m.depenses)} € dépensés, ${fmtEur(m.revenus)} € de revenus`).join('. ')}.`}
        >
          {byMonth.map(m => {
            const depH = Math.max(2, (m.depenses / maxVal) * BAR_H)
            const revH = m.revenus > 0 ? Math.max(2, (m.revenus / maxVal) * BAR_H) : 0
            return (
              <button
                key={m.prefix}
                type="button"
                className={styles.trendBarGroup}
                onClick={() => onSelectMonth(m.date)}
                title={`${m.label} — Dépenses ${fmtEur(m.depenses)} € · Revenus ${fmtEur(m.revenus)} €`}
                aria-label={`Voir ${m.label} : ${fmtEur(m.depenses)} € de dépenses`}
              >
                <div className={styles.trendBarStack}>
                  {revH > 0 && <div className={styles.trendBarRev} style={{ height: revH }} />}
                  <div
                    className={[styles.trendBarDep, m.isCurrent ? styles.trendBarDepCurrent : ''].join(' ')}
                    style={{ height: depH }}
                  />
                </div>
                <span className={styles.trendMonthLabel}>{m.label}</span>
                {m.isCurrent && m.depenses > 0 && (
                  <span className={styles.trendAmountLabel}>{fmtEur(m.depenses)}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className={styles.trendLegend}>
          <span className={styles.trendLegendItem}>
            <span className={styles.trendDotDep} /> Dépenses
          </span>
          <span className={styles.trendLegendItem}>
            <span className={styles.trendDotRev} /> Revenus
          </span>
        </div>
      </div>

      {/* ── Savings line chart ────────────────────────────────────────── */}
      {activeMonths.length > 2 && (
        <div className={styles.savingsCard}>
          <p className={styles.trendTitle}>Épargne mensuelle</p>

          <div
            className={styles.savingsChartWrap}
            role="img"
            aria-label={`Épargne mensuelle sur 12 mois. ${byMonth.map(m => `${m.label} : ${m.savings >= 0 ? '+' : ''}${fmtEur(m.savings)} €`).join('. ')}.`}
          >
            <svg
              viewBox={`0 0 ${SL_W} ${SL_H}`}
              className={styles.savingsLineSvg}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {/* Zero baseline */}
              <line
                x1="0" y1={zeroY} x2={SL_W} y2={zeroY}
                stroke="var(--border)" strokeWidth="1" strokeDasharray="3,2"
                vectorEffect="non-scaling-stroke"
              />
              {/* Positive fill area */}
              <path
                d={`${savPath} L${SL_W},${zeroY} L0,${zeroY} Z`}
                fill="rgba(91,158,143,0.10)"
                clipPath="url(#aboveZero)"
              />
              <clipPath id="aboveZero">
                <rect x="0" y="0" width={SL_W} height={zeroY} />
              </clipPath>
              {/* Negative fill area */}
              <path
                d={`${savPath} L${SL_W},${zeroY} L0,${zeroY} Z`}
                fill="rgba(224,123,84,0.08)"
                clipPath="url(#belowZero)"
              />
              <clipPath id="belowZero">
                <rect x="0" y={zeroY} width={SL_W} height={SL_H - zeroY} />
              </clipPath>
              {/* Line */}
              <path
                d={savPath}
                fill="none"
                stroke="var(--positive)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {/* Points — rendus en overlay HTML pour rester parfaitement ronds
                (le SVG est étiré via preserveAspectRatio="none"). */}
            {savPts.map((p, i) => (
              <button
                key={i}
                type="button"
                className={styles.savingsHit}
                style={{ left: `${(p.x / SL_W) * 100}%`, top: `${(p.y / SL_H) * 100}%` }}
                onClick={() => onSelectMonth(p.date)}
                title={`${p.label} : ${p.savings >= 0 ? '+' : ''}${fmtEur(p.savings)} €`}
                aria-label={`Voir ${p.label} : épargne ${p.savings >= 0 ? '+' : ''}${fmtEur(p.savings)} €`}
              >
                <span
                  className={styles.savingsPoint}
                  style={{
                    width:  p.isCurrent ? 8 : 5,
                    height: p.isCurrent ? 8 : 5,
                    background: p.savings >= 0 ? 'var(--positive)' : 'var(--accent)',
                  }}
                />
              </button>
            ))}
          </div>

          <div className={styles.savingsLineLabels}>
            {byMonth.map(m => (
              <span
                key={m.prefix}
                className={[styles.savingsLineLabel, m.isCurrent ? styles.savingsLineLabelCurrent : ''].join(' ')}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className={styles.savingsCallout}>
            <span className={styles.savingsCalloutLabel}>Ce mois :</span>
            <span
              className={styles.savingsCalloutVal}
              style={{ color: currM.savings >= 0 ? '#5B9E8F' : '#E07B54' }}
            >
              {currM.savings >= 0 ? '+' : ''}{fmtEur(currM.savings)} €
            </span>
          </div>
        </div>
      )}

      {/* ── Annual summary ────────────────────────────────────────────── */}
      <div className={styles.annualCard}>
        <p className={styles.trendTitle}>Bilan {year}</p>

        <div className={styles.annualRow}>
          <span className={styles.annualLabel}>Revenus</span>
          <span className={styles.annualVal} style={{ color: '#5B9E8F' }}>{fmtEur(yearIncome)} €</span>
        </div>
        <div className={styles.annualRow}>
          <span className={styles.annualLabel}>Dépenses</span>
          <span className={styles.annualVal} style={{ color: 'var(--accent)' }}>{fmtEur(yearExpenses)} €</span>
        </div>
        <div className={styles.annualDivider} />
        <div className={styles.annualRow}>
          <span className={styles.annualLabel}>Épargne nette</span>
          <span className={styles.annualVal} style={{ color: yearBalance >= 0 ? '#5B9E8F' : '#E07B54', fontWeight: 900 }}>
            {yearBalance >= 0 ? '+' : ''}{fmtEur(yearBalance)} €
          </span>
        </div>

        {byCat.length > 0 && (
          <>
            <p className={styles.annualCatTitle}>Répartition des dépenses</p>

            {/* Stacked bar */}
            <div className={styles.catStackBar}>
              {byCat.map(({ cat, total }) => (
                <div
                  key={cat.id}
                  className={styles.catStackSegment}
                  style={{ width: `${(total / catTotal) * 100}%`, background: catColor(cat) }}
                  title={`${cat.name} : ${fmtEur(total)} €`}
                />
              ))}
            </div>

            {/* Legend rows with % */}
            {byCat.map(({ cat, total }) => (
              <div key={cat.id} className={styles.annualCatRow}>
                <span className={styles.catDot} style={{ background: catColor(cat) }} />
                <span className={styles.annualCatName}>{cat.name}</span>
                <span className={styles.annualCatPct}>
                  {catTotal > 0 ? ((total / catTotal) * 100).toFixed(0) : 0}%
                </span>
                <span className={styles.annualCatVal}>{fmtEur(total)} €</span>
              </div>
            ))}
          </>
        )}
      </div>

    </div>
  )
}
