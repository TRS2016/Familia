import styles from './ElevationChart.module.css'

const COLOR = '#E07B54' // accent

export interface ElevationChartProps {
  elevations: number[] | null
  loading: boolean
}

export function ElevationChart({ elevations, loading }: ElevationChartProps) {
  if (loading) {
    return (
      <div className={styles.loading}>
        <span className={styles.loadingText}>Chargement du profil altimétrique...</span>
      </div>
    )
  }
  if (!elevations || elevations.length < 2) return null

  const min = Math.min(...elevations)
  const max = Math.max(...elevations)
  const range = max - min || 1
  const W = 300
  const H = 56

  const pts = elevations.map((e, i) => {
    const x = (i / (elevations.length - 1)) * W
    const y = H - ((e - min) / range) * (H - 4)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const totalAscent = elevations.reduce((acc, e, i) => {
    if (i === 0) return 0
    const diff = e - elevations[i - 1]
    return acc + (diff > 0 ? diff : 0)
  }, 0)

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span>Profil altimétrique</span>
        <span>↑ {Math.round(totalAscent)}m • {Math.round(min)}–{Math.round(max)}m</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.svg} aria-label="Profil altimétrique de l'itinéraire">
        <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={COLOR} fillOpacity="0.15" />
        <polyline points={pts.join(' ')} fill="none" stroke={COLOR} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
