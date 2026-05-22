import Spinner from '../../components/Spinner'
import { catColor, fmtEur, MONTH_LABELS_FR } from './kakebo.utils'
import type { KakeboCategory, KakeboEntry } from './useKakebo'
import styles from './KakeboPage.module.css'

export default function TrendView({ entries, isLoading, categories }: {
  entries: KakeboEntry[]
  isLoading: boolean
  categories: KakeboCategory[]
}) {
  if (isLoading) {
    return <div className={styles.spinnerWrap}><Spinner size={32} /></div>
  }

  const now = new Date()
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      prefix: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: MONTH_LABELS_FR[d.getMonth()],
      isCurrent: i === 11,
    }
  })

  const byMonth = months.map(m => {
    const mes = entries.filter(e => e.date.startsWith(m.prefix))
    const depenses = mes.filter(e => e.category?.type !== 'income').reduce((s, e) => s + Number(e.amount), 0)
    const revenus  = mes.filter(e => e.category?.type === 'income').reduce((s, e) => s + Number(e.amount), 0)
    return { ...m, depenses, revenus }
  })

  const maxVal = Math.max(1, ...byMonth.flatMap(m => [m.depenses, m.revenus]))
  const BAR_H  = 100

  // Annual summary
  const year = now.getFullYear()
  const yearEntries  = entries.filter(e => e.date.startsWith(`${year}-`))
  const yearExpenses = yearEntries.filter(e => e.category?.type !== 'income').reduce((s, e) => s + Number(e.amount), 0)
  const yearIncome   = yearEntries.filter(e => e.category?.type === 'income').reduce((s, e) => s + Number(e.amount), 0)
  const yearBalance  = yearIncome - yearExpenses
  const spendCats    = categories.filter(c => c.type !== 'income')
  const byCat = spendCats
    .map(cat => ({
      cat,
      total: yearEntries.filter(e => e.category_id === cat.id).reduce((s, e) => s + Number(e.amount), 0),
    }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total)

  return (
    <div className={styles.scrollArea}>
      <div className={styles.trendCard}>
        <p className={styles.trendTitle}>Dépenses sur 12 mois</p>
        <div className={styles.trendBars}>
          {byMonth.map(m => {
            const depH = Math.max(2, (m.depenses / maxVal) * BAR_H)
            const revH = m.revenus > 0 ? Math.max(2, (m.revenus / maxVal) * BAR_H) : 0
            return (
              <div key={m.prefix} className={styles.trendBarGroup}>
                <div className={styles.trendBarStack}>
                  {revH > 0 && <div className={styles.trendBarRev} style={{ height: revH }} />}
                  <div
                    className={[styles.trendBarDep, m.isCurrent ? styles.trendBarDepCurrent : ''].join(' ')}
                    style={{ height: depH }}
                  />
                </div>
                <span className={styles.trendMonthLabel}>{m.label}</span>
                {m.depenses > 0 && <span className={styles.trendAmountLabel}>{fmtEur(m.depenses)}</span>}
              </div>
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

      {/* Annual summary */}
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
            {byCat.map(({ cat, total }) => (
              <div key={cat.id} className={styles.annualCatRow}>
                <span className={styles.catDot} style={{ background: catColor(cat) }} />
                <span className={styles.annualCatName}>{cat.name}</span>
                <span className={styles.annualCatVal}>{fmtEur(total)} €</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
