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

  const prevStartBikesRef = useRef<number | null>(null)
  useEffect(() => {
    if (recommendedStartStations.length === 0) { prevStartBikesRef.current = null; return }
    const currentBikes = recommendedStartStations[0].availableBikes
    if (prevStartBikesRef.current !== null && prevStartBikesRef.current > 0 && currentBikes === 0 && permission === 'granted') {
      sendNotification('Vélo pris', { body: `Le dernier vélo à ${recommendedStartStations[0].name} a été pris` })
    }
    prevStartBikesRef.current = currentBikes
  }, [recommendedStartStations, permission, sendNotification])

  const prevEndStandsRef = useRef<number | null>(null)
  useEffect(() => {
    if (recommendedEndStations.length === 0) { prevEndStandsRef.current = null; return }
    const currentStands = recommendedEndStations[0].availableStands
    if (prevEndStandsRef.current !== null && prevEndStandsRef.current === 0 && currentStands > 0 && permission === 'granted') {
      sendNotification('Place libérée', { body: `Une place s'est libérée à ${recommendedEndStations[0].name}` })
    }
    prevEndStandsRef.current = currentStands
  }, [recommendedEndStations, permission, sendNotification])

  return { recommendedStartStations, recommendedEndStations, startWalkSeconds, endWalkSeconds }
}
