import { calculateDistance, formatDistance } from './geo'
import type {
  GeoCoord,
  GeoLineString,
  ParsedRoute,
  RouteStep,
  RouteWithAlternatives,
  Station,
  StationAlongRoute,
} from './types'

const STEP_TYPES = new Set<string>([
  'depart', 'arrive', 'turn',
  'roundabout', 'rotary', 'exit roundabout', 'exit rotary',
  'fork', 'merge', 'end of road', 'new name',
])

// ── Types bruts OSRM ──────────────────────────────────────────────────────────

interface OsrmRoute {
  geometry: GeoLineString
  distance: number
  duration: number
  legs: { steps?: RouteStep[] }[]
}

interface OsrmResponse {
  code: string
  routes: OsrmRoute[]
}

function parseRoute(route: OsrmRoute): ParsedRoute {
  return {
    geometry: route.geometry,
    distance: route.distance,
    duration: route.duration,
    steps: route.legs[0]?.steps?.filter((s) => STEP_TYPES.has(s.maneuver?.type)) ?? [],
  }
}

// ── OSRM (primary) ────────────────────────────────────────────────────────────

const OSRM_URL = 'https://routing.openstreetmap.de/routed-bike/route/v1/driving'

async function fetchOSRM(
  startLat: number, startLng: number, endLat: number, endLng: number,
): Promise<OsrmResponse> {
  const url = `${OSRM_URL}/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true&alternatives=true`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') throw new Error('timeout', { cause: err })
    throw new Error('network', { cause: err })
  }
  clearTimeout(timer)
  if (!response.ok) throw new Error(`http:${response.status}`)
  const data = (await response.json()) as OsrmResponse
  if (data.code !== 'Ok' || !data.routes.length) throw new Error('no_route')
  return data
}

// ── Valhalla (fallback) ───────────────────────────────────────────────────────

function decodePolyline6(encoded: string): GeoCoord[] {
  const factor = 1e6
  const coords: GeoCoord[] = []
  let lat = 0, lng = 0, i = 0
  while (i < encoded.length) {
    let b: number, shift = 0, result = 0
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1
    coords.push([lng / factor, lat / factor]) // GeoJSON [lng, lat]
  }
  return coords
}

const VALHALLA_TYPE: Record<number, [string, string]> = {
  1: ['depart', ''], 2: ['depart', 'right'], 3: ['depart', 'left'],
  4: ['arrive', ''], 5: ['arrive', 'right'], 6: ['arrive', 'left'],
  7: ['new name', 'straight'],
  8: ['turn', 'straight'],
  9: ['turn', 'slight right'], 10: ['turn', 'right'], 11: ['turn', 'sharp right'],
  12: ['turn', 'uturn'], 13: ['turn', 'uturn'],
  14: ['turn', 'sharp left'], 15: ['turn', 'left'], 16: ['turn', 'slight left'],
  17: ['fork', 'straight'], 18: ['fork', 'right'], 19: ['fork', 'left'],
  20: ['merge', 'right'], 21: ['merge', 'left'],
  27: ['roundabout', 'right'],
}

interface ValhallaManeuver {
  type: number
  begin_shape_index: number
  roundabout_exit_count?: number
  street_names?: string[]
  length?: number
  time?: number
}

interface ValhallaResponse {
  trip: {
    summary: { length: number; time: number }
    legs: { shape: string; maneuvers: ValhallaManeuver[] }[]
  }
}

function parseValhallaRoute(data: ValhallaResponse): RouteWithAlternatives {
  const leg = data.trip.legs[0]
  const summary = data.trip.summary
  const coords = decodePolyline6(leg.shape)
  const steps = leg.maneuvers
    .map((m): RouteStep | null => {
      const mapped = VALHALLA_TYPE[m.type]
      if (!mapped) return null
      const loc = coords[m.begin_shape_index] ?? coords[0]
      return {
        maneuver: {
          type: mapped[0],
          modifier: mapped[1],
          location: loc,
          exit: m.roundabout_exit_count ?? undefined,
        },
        name: m.street_names?.[0] ?? '',
        distance: (m.length ?? 0) * 1000,
        duration: m.time ?? 0,
      }
    })
    .filter((s): s is RouteStep => s !== null && STEP_TYPES.has(s.maneuver.type))
  return {
    geometry: { type: 'LineString', coordinates: coords },
    distance: summary.length * 1000,
    duration: summary.time,
    steps,
    alternatives: [],
  }
}

async function fetchValhalla(
  startLat: number, startLng: number, endLat: number, endLng: number,
  costing: 'bicycle' | 'pedestrian' = 'bicycle',
): Promise<RouteWithAlternatives> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  let response: Response
  try {
    response = await fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [{ lon: startLng, lat: startLat }, { lon: endLng, lat: endLat }],
        costing,
        directions_options: { language: 'fr-FR' },
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') throw new Error('timeout', { cause: err })
    throw new Error('network', { cause: err })
  }
  clearTimeout(timer)
  if (!response.ok) throw new Error(`http:${response.status}`)
  const data = (await response.json()) as ValhallaResponse
  if (!data.trip?.legs?.length) throw new Error('no_route')
  return parseValhallaRoute(data)
}

// ── OSRM foot ─────────────────────────────────────────────────────────────────

const OSRM_FOOT_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving'

async function fetchOSRMFoot(
  startLat: number, startLng: number, endLat: number, endLng: number,
): Promise<ParsedRoute> {
  const url = `${OSRM_FOOT_URL}/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  let response: Response
  try {
    response = await fetch(url, { signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    throw new Error('network', { cause: err })
  }
  clearTimeout(timer)
  if (!response.ok) throw new Error(`http:${response.status}`)
  const data = (await response.json()) as OsrmResponse
  if (data.code !== 'Ok' || !data.routes.length) throw new Error('no_route')
  return parseRoute(data.routes[0])
}

/** Itinéraire piéton, best-effort : renvoie null en cas d'échec. */
export async function fetchWalkRoute(
  startLat: number, startLng: number, endLat: number, endLng: number,
): Promise<ParsedRoute | null> {
  try {
    return await fetchOSRMFoot(startLat, startLng, endLat, endLng)
  } catch {
    try {
      return await fetchValhalla(startLat, startLng, endLat, endLng, 'pedestrian')
    } catch {
      return null
    }
  }
}

// ── API publique ──────────────────────────────────────────────────────────────

export async function fetchRoute(
  startLat: number, startLng: number, endLat: number, endLng: number,
): Promise<RouteWithAlternatives> {
  let osrmErr: Error | undefined
  try {
    const data = await fetchOSRM(startLat, startLng, endLat, endLng)
    const primary = parseRoute(data.routes[0])
    const alternatives = data.routes.slice(1).map(parseRoute)
    return { ...primary, alternatives }
  } catch (err) {
    osrmErr = err instanceof Error ? err : new Error(String(err))
    // Inutile de réessayer avec Valhalla si l'itinéraire n'existe simplement pas
    if (osrmErr.message === 'no_route') throw new Error('Aucun itinéraire trouvé pour ce trajet', { cause: err })
    // 4xx = requête invalide, pas une panne transitoire
    if (osrmErr.message.startsWith('http:4')) throw new Error(`Erreur de calcul d'itinéraire (${osrmErr.message.replace('http:', '')})`, { cause: err })
  }

  // OSRM injoignable ou 5xx — on tente Valhalla
  try {
    return await fetchValhalla(startLat, startLng, endLat, endLng)
  } catch (err) {
    const valhallaErr = err instanceof Error ? err : new Error(String(err))
    const isTimeout = osrmErr?.message === 'timeout' || valhallaErr.message === 'timeout'
    const isNetwork = osrmErr?.message === 'network' || valhallaErr.message === 'network'
    if (isTimeout) throw new Error('Délai dépassé — vérifiez votre connexion', { cause: err })
    if (isNetwork) throw new Error('Erreur réseau — vérifiez votre connexion internet', { cause: err })
    throw new Error('Service de calcul temporairement indisponible — réessayez dans quelques instants', { cause: err })
  }
}

export function findStationsAlongRoute(
  stations: Station[],
  routeGeometry: GeoLineString | null | undefined,
  maxDistance = 200,
): StationAlongRoute[] {
  if (!routeGeometry || !routeGeometry.coordinates) return []

  const coords = routeGeometry.coordinates
  const step = Math.max(1, Math.floor(coords.length / 200))

  function distanceToRoute(stationLat: number, stationLng: number): number {
    let min = Infinity
    for (let i = 0; i < coords.length; i += step) {
      const [rlng, rlat] = coords[i]
      const d = calculateDistance(stationLat, stationLng, rlat, rlng)
      if (d < min) min = d
    }
    return min
  }

  return stations
    .map((s): StationAlongRoute => ({ ...s, distanceToRoute: distanceToRoute(s.lat, s.lng) }))
    .filter((s) => s.distanceToRoute <= maxDistance)
    .sort((a, b) => {
      if (a.availableBikes > 0 && b.availableBikes <= 0) return -1
      if (b.availableBikes > 0 && a.availableBikes <= 0) return 1
      return a.distanceToRoute - b.distanceToRoute
    })
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

// Alias conservé pour l'UI de routing — identique à formatDistance de geo.
export { formatDistance as formatRouteDistance }
