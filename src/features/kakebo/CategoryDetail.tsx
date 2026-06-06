import { useState } from 'react'
import { X } from 'lucide-react'
import { catColor, catDesc, catGlyph, fmtEur } from './kakebo.utils'
import EntryRow from './EntryRow'
import type { KakeboCategory, KakeboEntry } from './useKakebo'
import styles from './KakeboPage.module.css'

export default function CategoryDetail({
  cat, entries, revenus, onEdit, onDelete, onReplay,
}: {
  cat: KakeboCategory
  entries: KakeboEntry[]
  revenus: number
  onEdit: (entry: KakeboEntry) => void
  onDelete: (id: string) => void
  onReplay: (entry: KakeboEntry) => void
}) {
  const [filterTag, setFilterTag] = useState<string | null>(null)

  // Tags présents dans cette catégorie, triés par fréquence
  const tagCounts = new Map<string, number>()
  for (const e of entries) for (const t of (e.tags ?? [])) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
  const allTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)

  const shown = filterTag ? entries.filter(e => (e.tags ?? []).includes(filterTag)) : entries

  const total    = shown.reduce((s, e) => s + Number(e.amount), 0)
  const count    = shown.length
  const avg      = count > 0 ? total / count : 0
  const pctRev   = revenus > 0 ? (total / revenus) * 100 : 0
  const sorted   = [...shown].sort((a, b) => b.date.localeCompare(a.date))

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

      {allTags.length > 0 && (
        <div className={styles.tagFilterRow}>
          {filterTag && (
            <button className={styles.tagFilterClear} onClick={() => setFilterTag(null)}>
              <X size={11} strokeWidth={2.5} /> Tag
            </button>
          )}
          {allTags.map(t => (
            <button
              key={t}
              className={[styles.tagFilterPill, filterTag === t ? styles.tagFilterPillActive : ''].join(' ')}
              onClick={() => setFilterTag(cur => cur === t ? null : t)}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      <p className={styles.sectionLabel} style={{ marginBottom: 8 }}>
        {filterTag ? `Opérations · #${filterTag}` : 'Toutes les opérations'}
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
                onEdit={() => onEdit(e)}
                onDelete={() => onDelete(e.id)}
                onReplay={() => onReplay(e)}
              />
            ))}
          </div>
        )
      }
    </div>
  )
}
