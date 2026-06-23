const R = 6371e3

/** Distance haversine en mètres entre deux points (lat/lng en degrés). */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const lat1Rad = (lat1 * Math.PI) / 180
  const lat2Rad = (lat2 * Math.PI) / 180
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

// Distance (m) d'un point au segment AB, en projection équirectangulaire locale
// (précise à l'échelle d'une rue). Évite les faux positifs de « distance au
// sommet le plus proche » sur les longs segments droits.
function distToSegment(
  plat: number, plng: number,
  alat: number, alng: number,
  blat: number, blng: number,
): number {
  const toRad = Math.PI / 180
  const mPerDegLat = 111320
  const mPerDegLng = 111320 * Math.cos(plat * toRad)
  const ax = (alng - plng) * mPerDegLng, ay = (alat - plat) * mPerDegLat
  const bx = (blng - plng) * mPerDegLng, by = (blat - plat) * mPerDegLat
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.hypot(cx, cy)
}

/** Distance (m) d'un point à une polyline GeoJSON ([lng,lat]), au plus proche segment. */
export function distanceToPolyline(
  lat: number, lng: number, coords: [number, number][], step = 1,
): number {
  if (coords.length === 0) return Infinity
  if (coords.length === 1) return calculateDistance(lat, lng, coords[0][1], coords[0][0])
  let min = Infinity
  for (let i = 0; i + step < coords.length; i += step) {
    const [alng, alat] = coords[i]
    const [blng, blat] = coords[i + step]
    const d = distToSegment(lat, lng, alat, alng, blat, blng)
    if (d < min) min = d
  }
  return min
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters.toFixed(0)}m`
  return `${(meters / 1000).toFixed(1)}km`
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return "À l'instant"
  if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)}min`
  return `Il y a ${Math.floor(seconds / 3600)}h`
}

export function formatWalkTime(secs: number | null | undefined): string {
  if (!secs || secs < 60) return "moins d'1 min"
  const mins = Math.round(secs / 60)
  return `${mins} min de marche`
}
