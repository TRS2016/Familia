import { useState } from 'react'
import { X } from 'lucide-react'
import { catColor, catDesc, catGlyph, fmtEur, MONTH_LABELS_FR } from './kakebo.utils'
import EntryRow from './EntryRow'
import type { KakeboCategory, KakeboEntry } from './useKakebo'
import styles from './KakeboPage.module.css'

export default function CategoryDetail({
  cat, entries, trendEntries, revenus, onEdit, onDelete, onReplay, readOnly = false,
}: {
  cat: KakeboCategory
  entries: KakeboEntry[]
  trendEntries: KakeboEntry[]
  revenus: number
  onEdit: (entry: KakeboEntry) => void
  onDelete: (entry: KakeboEntry) => void
  onReplay: (entry: KakeboEntry) => void
  readOnly?: boolean
}) {
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [matchMode, setMatchMode] = useState<'any' | 'all'>('any')

  // Tags présents dans cette catégorie, triés par fréquence
  const tagCounts = new Map<string, number>()
  for (const e of entries) for (const t of (e.tags ?? [])) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  const allTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)

  function toggleTag(t: string) {
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  const filterActive = selectedTags.length > 0
  const shown = filterActive
    ? entries.filter(e => {
        const tags = e.tags ?? []
        return matchMode === 'all'
          ? selectedTags.every(t => tags.includes(t))
          : selectedTags.some(t => tags.includes(t))
      })
    : entries

  const total    = shown.reduce((s, e) => s + Number(e.amount), 0)
  const count    = shown.length
  const avg      = count > 0 ? total / count : 0
  const pctRev   = revenus > 0 ? (total / revenus) * 100 : 0
  const sorted   = [...shown].sort((a, b) => b.date.localeCompare(a.date))

  // Mini-tendance : dépenses de cette catégorie sur 12 mois glissants.
  const now = new Date()
  const trend12 = Array.from({ length: 12 }, (_, i) => {
    const d      = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const tot    = trendEntries
      .filter(e => e.date.startsWith(prefix))
      .reduce((s, e) => s + Number(e.amount), 0)
    return { label: MONTH_LABELS_FR[d.getMonth()], total: tot, isCurrent: i === 11 }
  })
  const trendMax    = Math.max(1, ...trend12.map(m => m.total))
  const trendActive = trend12.some(m => m.total > 0)
  const trendAvg    = trend12.reduce((s, m) => s + m.total, 0) / 12

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

      {trendActive && (
        <div className={styles.catTrendCard}>
          <div className={styles.catTrendHead}>
            <span className={styles.catTrendTitle}>Sur 12 mois</span>
            <span className={styles.catTrendAvg}>~{fmtEur(trendAvg)} €/mois</span>
          </div>
          <div
            className={styles.catTrendBars}
            role="img"
            aria-label={`Dépenses ${cat.name} sur 12 mois. ${trend12.map(m => `${m.label} : ${fmtEur(m.total)} €`).join('. ')}.`}
          >
            {trend12.map((m, i) => {
              const h = m.total > 0 ? Math.max(3, (m.total / trendMax) * 40) : 2
              return (
                <div key={i} className={styles.catTrendBarWrap} title={`${m.label} : ${fmtEur(m.total)} €`}>
                  <div
                    className={styles.catTrendBar}
                    style={{
                      height: h,
                      background: m.isCurrent ? catColor(cat) : 'var(--chart-neutral)',
                      opacity: m.total === 0 ? 0.4 : 1,
                    }}
                  />
                  <span className={styles.catTrendLabel}>{m.label.slice(0, 1)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {allTags.length > 0 && (
        <div className={styles.tagFilterRow}>
          {filterActive && (
            <button className={styles.tagFilterClear} onClick={() => setSelectedTags([])}>
              <X size={11} strokeWidth={2.5} /> Tag
            </button>
          )}
          {allTags.map(t => (
            <button
              key={t}
              className={[styles.tagFilterPill, selectedTags.includes(t) ? styles.tagFilterPillActive : ''].join(' ')}
              aria-pressed={selectedTags.includes(t)}
              onClick={() => toggleTag(t)}
            >
              #{t}
            </button>
          ))}
          {selectedTags.length > 1 && (
            <button
              className={styles.tagFilterMode}
              onClick={() => setMatchMode(m => m === 'any' ? 'all' : 'any')}
              title="Basculer le mode de correspondance"
            >
              {matchMode === 'any' ? 'au moins un' : 'tous les tags'}
            </button>
          )}
        </div>
      )}

      <p className={styles.sectionLabel} style={{ marginBottom: 8 }}>
        {filterActive ? `Opérations · ${selectedTags.map(t => `#${t}`).join(' ')}` : 'Toutes les opérations'}
      </p>
      {sorted.length === 0
        ? <p className={styles.detailEmpty}>Aucune dépense ce mois</p>
        : (
          <div className={styles.entryList}>
            {sorted.map((e, i) => (
              <EntryRow
                key={e.id}
                entry={e}
                showBorder={i < sorted.length - 1}
                onEdit={readOnly ? undefined : () => onEdit(e)}
                onDelete={readOnly ? undefined : () => onDelete(e)}
                onReplay={() => onReplay(e)}
              />
            ))}
          </div>
        )
      }
    </div>
  )
}
