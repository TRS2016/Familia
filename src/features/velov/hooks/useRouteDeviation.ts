import { useEffect, useState } from 'react'
import { calculateDistance } from '../geo'
import type { GeoLineString, UserPosition } from '../types'

const DEVIATION_THRESHOLD = 100

export interface UseRouteDeviationParams {
  routeGeometry: GeoLineString | null
  userPosition: UserPosition | null
}

export function useRouteDeviation({ routeGeometry, userPosition }: UseRouteDeviationParams) {
  const [deviated, setDeviated] = useState(false)

  useEffect(() => {
    if (!routeGeometry?.coordinates?.length || !userPosition) {
      const t = setTimeout(() => setDeviated(false), 0)
      return () => clearTimeout(t)
    }

    const coords = routeGeometry.coordinates
    let minDist = Infinity
    for (let i = 0; i < coords.length; i++) {
      const [lng, lat] = coords[i]
      const d = calculateDistance(userPosition.lat, userPosition.lng, lat, lng)
      if (d < minDist) minDist = d
      if (minDist < 30) break
    }

    const t = setTimeout(() => setDeviated(minDist > DEVIATION_THRESHOLD), 0)
    return () => clearTimeout(t)
  }, [userPosition, routeGeometry])

  return { deviated }
}
