import { useMemo, useEffect, useRef, useState } from 'react'
import { calculateDistance } from '../geo'
import { fetchWalkRoute } from '../route'
import type { NotificationSender, RecommendedStation, RoutePoint, Station } from '../types'

const MAX_WALK_DISTANCE = 1500
const WALK_SPEED_MPS = 1.4

// Classe les stations les plus proches d'un point d'ancrage qui satisfont `predicate`
// (vélos dispo au départ, places dispo à l'arrivée).
function rankStations(
  anchor: RoutePoint | null,
  stations: Station[],
  predicate: (s: Station) => boolean,
): RecommendedStation[] {
  if (!anchor || stations.length === 0) return []
  return stations
    .filter(predicate)
    .map((s): RecommendedStation => {
      const distance = calculateDistance(anchor.lat, anchor.lng, s.lat, s.lng)
      return { ...s, distance, walkTime: Math.round(distance / WALK_SPEED_MPS) }
    })
    .filter((s) => s.distance <= MAX_WALK_DISTANCE)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
}

// Durée de marche réelle (OSRM) jusqu'à la station recommandée principale, débattue.
function useWalkSeconds(anchor: RoutePoint | null, topStation: RecommendedStation | null): number | null {
  const [seconds, setSeconds] = useState<number | null>(null)
  const topId = topStation?.id ?? null
  useEffect(() => {
    if (!anchor || !topStation) {
      void Promise.resolve().then(() => setSeconds(null))
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      fetchWalkRoute(anchor.lat, anchor.lng, topStation.lat, topStation.lng)
        .then((route) => { if (!cancelled && route) setSeconds(Math.round(route.duration)) })
        .catch(() => {})
    }, 600)
    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.lat, anchor?.lng, topId])
  return seconds
}

export interface UseRecommendedStationsParams {
  routeOrigin: RoutePoint | null
  routeDestination: RoutePoint | null
  stations: Station[]
  sendNotification: NotificationSender
  permission: NotificationPermission
}

export function useRecommendedStations({
  routeOrigin, routeDestination, stations, sendNotification, permission,
}: UseRecommendedStationsParams) {
  const recommendedStartStations = useMemo(
    () => rankStations(routeOrigin, stations, (s) => s.availableBikes > 0),
    [routeOrigin, stations],
  )

  const recommendedEndStations = useMemo(
    () => rankStations(routeDestination, stations, (s) => s.availableStands > 0),
    [routeDestination, stations],
  )

  const startWalkSeconds = useWalkSeconds(routeOrigin, recommendedStartStations[0] ?? null)
  const endWalkSeconds = useWalkSeconds(routeDestination, recommendedEndStations[0] ?? null)

  // On suit la station de tête PAR ID dans les `stations` brutes : une fois passée
  // à 0 vélo / 0 place, elle sort de la liste recommandée (filtrée), donc surveiller
  // la liste filtrée seule ne détecterait jamais la bascule.
  const prevStartRef = useRef<{ id: string; bikes: number } | null>(null)
  useEffect(() => {
    const prev = prevStartRef.current
    if (prev && permission === 'granted') {
      const live = stations.find((s) => s.id === prev.id)
      if (live && prev.bikes > 0 && live.availableBikes === 0) {
        sendNotification('Vélo pris', {
          body: `Le dernier vélo à ${live.name} a été pris`,
          tag: `velov-start-${live.id}`,
        })
      }
    }
    const top = recommendedStartStations[0]
    if (!top) { prevStartRef.current = null; return }
    const liveTop = stations.find((s) => s.id === top.id)
    prevStartRef.current = { id: top.id, bikes: liveTop?.availableBikes ?? top.availableBikes }
  }, [recommendedStartStations, stations, permission, sendNotification])

  const prevEndRef = useRef<{ id: string; stands: number } | null>(null)
  useEffect(() => {
    const prev = prevEndRef.current
    if (prev && permission === 'granted') {
      const live = stations.find((s) => s.id === prev.id)
      if (live && prev.stands > 0 && live.availableStands === 0) {
        sendNotification('Station pleine', {
          body: `Plus de place à ${live.name} — une autre station d'arrivée sera proposée`,
          tag: `velov-end-${live.id}`,
        })
      }
    }
    const top = recommendedEndStations[0]
    if (!top) { prevEndRef.current = null; return }
    const liveTop = stations.find((s) => s.id === top.id)
    prevEndRef.current = { id: top.id, stands: liveTop?.availableStands ?? top.availableStands }
  }, [recommendedEndStations, stations, permission, sendNotification])

  return { recommendedStartStations, recommendedEndStations, startWalkSeconds, endWalkSeconds }
}
