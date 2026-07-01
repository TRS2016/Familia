import { useMemo, useState } from 'react'
import { catColor, catGlyph, fmtEur, MONTH_LABELS_FR } from './kakebo.utils'
import EntryRow from './EntryRow'
import type { KakeboCategory, KakeboEntry } from './useKakebo'
import styles from './KakeboPage.module.css'

export default function DetailView({
  categories, entries, onEdit, onDelete, onReplay, readOnly = false,
}: {
  categories: KakeboCategory[]
  entries: KakeboEntry[]
  onEdit: (entry: KakeboEntry) => void
  onDelete: (id: string) => void
  onReplay: (entry: KakeboEntry) => void
  readOnly?: boolean
}) {
  const [groupMode, setGroupMode] = useState<'cat' | 'date'>('cat')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [matchMode, setMatchMode] = useState<'any' | 'all'>('any')

  // Tous les tags présents ce mois (triés), pour la barre de filtre.
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) for (const t of e.tags ?? []) set.add(t)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [entries])

  // Filtrage multi-tags : « au moins un » (union) ou « tous » (intersection).
  const filtered = useMemo(() => {
    if (selectedTags.length === 0) return entries
    return entries.filter(e => {
      const tags = e.tags ?? []
      return matchMode === 'all'
        ? selectedTags.every(t => tags.includes(t))
        : selectedTags.some(t => tags.includes(t))
    })
  }, [entries, selectedTags, matchMode])

  function toggleTag(t: string) {
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  const filterActive = selectedTags.length > 0
  const filteredExpense = filtered
    .filter(e => e.category?.type !== 'income')
    .reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className={styles.scrollArea}>
      {/* Filtre par tags (multi-sélection) */}
      {allTags.length > 0 && (
        <div className={styles.tagFilterBar}>
          <div className={styles.tagFilterChips}>
            {allTags.map(t => (
              <button
                key={t}
                type="button"
                className={[styles.tagFilterChip, selectedTags.includes(t) ? styles.tagFilterChipActive : ''].join(' ')}
                onClick={() => toggleTag(t)}
                aria-pressed={selectedTags.includes(t)}
              >#{t}</button>
            ))}
          </div>
          {filterActive && (
            <div className={styles.tagFilterFoot}>
              <button
                type="button"
                className={styles.tagFilterMode}
                onClick={() => setMatchMode(m => m === 'any' ? 'all' : 'any')}
                title="Basculer le mode de correspondance"
              >{matchMode === 'any' ? 'au moins un' : 'tous les tags'}</button>
              <span className={styles.tagFilterCount}>{filtered.length} op. · {fmtEur(filteredExpense)} €</span>
              <button type="button" className={styles.tagFilterClear} onClick={() => setSelectedTags([])}>Effacer</button>
            </div>
          )}
        </div>
      )}

      {/* Toggle */}
      <div className={styles.detailToggle}>
        <button
          className={[styles.detailToggleBtn, groupMode === 'cat' ? styles.detailToggleBtnActive : ''].join(' ')}
          onClick={() => setGroupMode('cat')}
        >Par catégorie</button>
        <button
          className={[styles.detailToggleBtn, groupMode === 'date' ? styles.detailToggleBtnActive : ''].join(' ')}
          onClick={() => setGroupMode('date')}
        >Par date</button>
      </div>

      {groupMode === 'cat' && categories.map(cat => {
        const catEntries = filtered
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
                      onEdit={readOnly ? undefined : () => onEdit(e)}
                      onDelete={readOnly ? undefined : () => onDelete(e.id)}
                      onReplay={() => onReplay(e)}
                    />
                  ))}
                </div>
              )
            }
          </div>
        )
      })}

      {groupMode === 'date' && (() => {
        const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date))
        const byDate = new Map<string, KakeboEntry[]>()
        for (const e of sorted) {
          if (!byDate.has(e.date)) byDate.set(e.date, [])
          byDate.get(e.date)!.push(e)
        }
        if (sorted.length === 0) return <p className={styles.detailEmpty}>Aucune opération ce mois.</p>
        return [...byDate.entries()].map(([date, dayEntries]) => {
          const dayTotal = dayEntries
            .filter(e => e.category?.type !== 'income')
            .reduce((s, e) => s + Number(e.amount), 0)
          return (
            <div key={date} className={styles.dateGroup}>
              <div className={styles.dateGroupHeader}>
                <span className={styles.dateGroupDate}>
                  {date.slice(8)} {MONTH_LABELS_FR[parseInt(date.slice(5, 7)) - 1]}
                </span>
                {dayTotal > 0 && (
                  <span className={styles.dateGroupTotal}>{fmtEur(dayTotal)} €</span>
                )}
              </div>
              <div className={styles.entryList}>
                {dayEntries.map((e, i) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    showBorder={i < dayEntries.length - 1}
                    onEdit={readOnly ? undefined : () => onEdit(e)}
                    onDelete={readOnly ? undefined : () => onDelete(e.id)}
                    onReplay={() => onReplay(e)}
                  />
                ))}
              </div>
            </div>
          )
        })
      })()}
    </div>
  )
}
