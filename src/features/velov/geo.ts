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
