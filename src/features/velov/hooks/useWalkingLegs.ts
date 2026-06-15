import { useState, useEffect } from 'react'
import { fetchWalkRoute } from '../route'
import { calculateDistance } from '../geo'
import type { ParsedRoute, RoutePoint, Station } from '../types'

const WALK_THRESHOLD_M = 300

export interface UseWalkingLegsParams {
  origin: RoutePoint | null
  startStation: Station | null
  endStation: Station | null
  destination: RoutePoint | null
}

export function useWalkingLegs({ origin, startStation, endStation, destination }: UseWalkingLegsParams) {
  const [walkToStart, setWalkToStart] = useState<ParsedRoute | null>(null)
  const [walkFromEnd, setWalkFromEnd] = useState<ParsedRoute | null>(null)

  const originLat = origin?.lat
  const originLng = origin?.lng
  const startId = startStation?.id ?? null
  const startLat = startStation?.lat
  const startLng = startStation?.lng

  const endId = endStation?.id ?? null
  const endLat = endStation?.lat
  const endLng = endStation?.lng
  const destLat = destination?.lat
  const destLng = destination?.lng

  useEffect(() => {
    let cancelled = false
    const shouldFetch = originLat != null && startLat != null && startId != null && originLng != null && startLng != null &&
      calculateDistance(originLat, originLng, startLat, startLng) > WALK_THRESHOLD_M
    const promise = shouldFetch
      ? fetchWalkRoute(originLat, originLng, startLat, startLng)
      : Promise.resolve(null)
    void promise.then((r) => { if (!cancelled) setWalkToStart(r) })
    return () => { cancelled = true }
  }, [originLat, originLng, startId, startLat, startLng])

  useEffect(() => {
    let cancelled = false
    const shouldFetch = endLat != null && destLat != null && endId != null && endLng != null && destLng != null &&
      calculateDistance(endLat, endLng, destLat, destLng) > WALK_THRESHOLD_M
    const promise = shouldFetch
      ? fetchWalkRoute(endLat, endLng, destLat, destLng)
      : Promise.resolve(null)
    void promise.then((r) => { if (!cancelled) setWalkFromEnd(r) })
    return () => { cancelled = true }
  }, [endId, endLat, endLng, destLat, destLng])

  return { walkToStart, walkFromEnd }
}
