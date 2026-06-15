import { useMemo } from 'react'
import { calculateDistance } from '../geo'
import type { GeoLineString, UserPosition } from '../types'

export interface UseRouteProgressParams {
  routeGeometry: GeoLineString | null
  userPosition: UserPosition | null
}

export function useRouteProgress({ routeGeometry, userPosition }: UseRouteProgressParams): number | null {
  return useMemo(() => {
    if (!routeGeometry?.coordinates?.length || !userPosition) return null
    const coords = routeGeometry.coordinates
    let minDist = Infinity
    let closestIdx = 0
    for (let i = 0; i < coords.length; i++) {
      const [lng, lat] = coords[i]
      const d = calculateDistance(userPosition.lat, userPosition.lng, lat, lng)
      if (d < minDist) { minDist = d; closestIdx = i }
      if (minDist < 10) break
    }
    return Math.round((closestIdx / Math.max(coords.length - 1, 1)) * 100)
  }, [routeGeometry, userPosition])
}
