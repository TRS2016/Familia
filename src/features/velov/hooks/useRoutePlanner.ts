import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { fetchRoute, formatDuration, formatRouteDistance, findStationsAlongRoute } from '../route'
import { saveRouteToStorage, loadRouteFromStorage, clearRouteFromStorage } from '../routeStorage'
import type { ParsedRoute, RouteInfo, RoutePoint, Station, StationAlongRoute } from '../types'

const _init = loadRouteFromStorage()

export function useRoutePlanner(stations: Station[]) {
  const [showRoutePlanner, setShowRoutePlanner] = useState(!!_init)
  const [routeOrigin, setRouteOrigin] = useState<RoutePoint | null>(_init?.origin ?? null)
  const [routeDestination, setRouteDestination] = useState<RoutePoint | null>(_init?.destination ?? null)
  const [routeGeometry, setRouteGeometry] = useState(_init?.routeGeometry ?? null)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(_init?.routeInfo ?? null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [allRoutes, setAllRoutes] = useState<ParsedRoute[]>(_init?.allRoutes ?? [])
  const [activeRouteIdx, setActiveRouteIdx] = useState(0)

  const stationsAlongRoute = useMemo<StationAlongRoute[]>(() => {
    if (!routeGeometry) return []
    return findStationsAlongRoute(stations, routeGeometry)
  }, [stations, routeGeometry])

  const originRef = useRef(routeOrigin)
  const destinationRef = useRef(routeDestination)

  useEffect(() => {
    originRef.current = routeOrigin
    destinationRef.current = routeDestination
  })

  const calculateRoute = useCallback(async (onSuccess?: () => void, overrideOrigin?: RoutePoint) => {
    const origin = overrideOrigin ?? originRef.current
    const destination = destinationRef.current
    if (!origin || !destination) return
    setRouteLoading(true)
    setRouteError(null)
    try {
      const route = await fetchRoute(origin.lat, origin.lng, destination.lat, destination.lng)
      const routes: ParsedRoute[] = [route, ...(route.alternatives || [])]
      const info: RouteInfo = {
        distance: route.distance,
        duration: route.duration,
        distanceFormatted: formatRouteDistance(route.distance),
        durationFormatted: formatDuration(route.duration),
        steps: route.steps,
      }
      setAllRoutes(routes)
      setActiveRouteIdx(0)
      setRouteGeometry(route.geometry)
      setRouteInfo(info)
      saveRouteToStorage({ origin, destination, routeGeometry: route.geometry, routeInfo: info, allRoutes: routes })
      onSuccess?.()
    } catch (err) {
      setRouteGeometry(null)
      setRouteInfo(null)
      setAllRoutes([])
      setRouteError(err instanceof Error ? err.message : "Impossible de calculer l'itinéraire")
    } finally {
      setRouteLoading(false)
    }
  }, [])

  const selectAlternative = useCallback((idx: number) => {
    const r = allRoutes[idx]
    if (!r) return
    setActiveRouteIdx(idx)
    setRouteGeometry(r.geometry)
    setRouteInfo({
      distance: r.distance,
      duration: r.duration,
      distanceFormatted: formatRouteDistance(r.distance),
      durationFormatted: formatDuration(r.duration),
      steps: r.steps,
    })
  }, [allRoutes])

  const clearRoute = useCallback(() => {
    setRouteOrigin(null)
    setRouteDestination(null)
    setRouteGeometry(null)
    setRouteInfo(null)
    setRouteLoading(false)
    setRouteError(null)
    setAllRoutes([])
    setActiveRouteIdx(0)
    setShowRoutePlanner(false)
    clearRouteFromStorage()
  }, [])

  return {
    showRoutePlanner, setShowRoutePlanner,
    routeOrigin, setRouteOrigin,
    routeDestination, setRouteDestination,
    routeGeometry,
    routeInfo,
    stationsAlongRoute,
    routeLoading,
    routeError,
    calculateRoute,
    clearRoute,
    allRoutes,
    activeRouteIdx,
    selectAlternative,
  }
}
