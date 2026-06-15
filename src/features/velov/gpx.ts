import type { GeoCoord, GeoLineString } from './types'

export function generateGPX(coordinates: GeoCoord[], name = "Itinéraire Vélo'v"): string {
  const points = coordinates
    .map(([lng, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Vélo'v Monitor" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`
}

export function downloadGPX(
  routeGeometry: GeoLineString | null | undefined,
  filename = 'itineraire.gpx',
): void {
  if (!routeGeometry?.coordinates?.length) return
  const gpx = generateGPX(routeGeometry.coordinates)
  const blob = new Blob([gpx], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
