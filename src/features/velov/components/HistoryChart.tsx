import { useEffect, useState } from 'react'
import { getStationHistory, getHourlyPattern, type StationSnapshot } from '../historyDB'
import styles from './HistoryChart.module.css'

const ACCENT = 'var(--success)'
const INFO = 'var(--info)'

export function HistoryChart({ stationId }: { stationId: string }) {
  const [history, setHistory] = useState<StationSnapshot[]>([])
  const [hourly, setHourly] = useState<(number | null)[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'recent' | 'hourly'>('recent')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [data, pattern] = await Promise.all([
        getStationHistory(stationId),
        getHourlyPattern(stationId),
      ])
      if (!cancelled) {
        setHistory(data)
        setHourly(pattern)
        setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [stationId])

  if (loading) return <div className={styles.placeholder}>Chargement...</div>

  const hasHourly = hourly && hourly.some((v) => v !== null)

  if (view === 'hourly' && hasHourly && hourly) {
    const currentHour = new Date().getHours()
    const maxHourly = Math.max(...hourly.filter((v): v is number => v !== null), 1)
    return (
      <div className={styles.wrap}>
        <div className={styles.head}>
          <p className={styles.title}>Habitudes par heure</p>
          <button onClick={() => setView('recent')} className={styles.link}>← Récent</button>
        </div>
        <div className={styles.bars}>
          {hourly.map((val, h) => {
            const barH = val !== null ? Math.max(2, Math.round((val / maxHourly) * 44)) : 0
            const isNow = h === currentHour
            const cls = isNow ? styles.barNow : val !== null ? styles.bar : styles.barEmpty
            return (
              <div key={h} title={`${h}h — ${val !== null ? `${val} vélos` : 'pas de données'}`} className={styles.barCol}>
                <div style={{ height: `${barH}px` }} className={[styles.bar, cls].join(' ')} />
              </div>
            )
          })}
        </div>
        <p className={styles.caption}>Vélos typiques · heure actuelle en couleur d'accent</p>
      </div>
    )
  }

  if (history.length === 0) {
    return <div className={styles.placeholder}>Aucun historique</div>
  }

  const bikeDelta = history[history.length - 1].availableBikes - history[0].availableBikes
  const trendIcon = bikeDelta > 2 ? '↑' : bikeDelta < -2 ? '↓' : '→'
  const trendCls = bikeDelta > 2 ? styles.trendUp : bikeDelta < -2 ? styles.trendDown : styles.trendFlat

  const maxVal = Math.max(...history.map((h) => Math.max(h.availableBikes, h.availableStands)), 1)
  const width = 200
  const height = 60
  const padding = 4

  function pointsFor(key: 'availableBikes' | 'availableStands') {
    return history
      .map((h, i) => {
        const x = padding + (i / (history.length - 1 || 1)) * (width - padding * 2)
        const y = height - padding - (h[key] / maxVal) * (height - padding * 2)
        return `${x},${y}`
      })
      .join(' ')
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.title}>Historique (24h)</p>
        {hasHourly && (
          <button onClick={() => setView('hourly')} className={styles.link}>Habitudes →</button>
        )}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.svg}>
        <polyline points={pointsFor('availableBikes')} fill="none" stroke={ACCENT} strokeWidth="1.5" />
        <polyline points={pointsFor('availableStands')} fill="none" stroke={INFO} strokeWidth="1.5" />
      </svg>
      <div className={styles.legend}>
        <span className={styles.legendBikes}>● Vélos</span>
        <span className={styles.legendStands}>● Places</span>
        <span className={[styles.trend, trendCls].join(' ')}>{trendIcon} vélos</span>
      </div>
    </div>
  )
}
