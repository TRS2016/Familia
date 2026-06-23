import { useEffect, useState } from 'react'
import { distanceToPolyline } from '../geo'
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

    // Distance au plus proche segment (et non sommet) → pas de fausse déviation
    // sur les longs segments droits.
    const minDist = distanceToPolyline(userPosition.lat, userPosition.lng, routeGeometry.coordinates)

    const t = setTimeout(() => setDeviated(minDist > DEVIATION_THRESHOLD), 0)
    return () => clearTimeout(t)
  }, [userPosition, routeGeometry])

  return { deviated }
}
