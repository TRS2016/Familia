import { useMemo, useEffect, useRef } from 'react'
import { calculateDistance } from '../geo'
import type { NotificationSender, RoutePoint, Station, UserPosition } from '../types'

interface NearbyStation extends Station {
  distanceToDest: number
}

export interface UseProximityAlertParams {
  destination: RoutePoint | null
  radius?: number
  stations?: Station[]
  userPosition: UserPosition | null
  sendNotification: NotificationSender
  enabled?: boolean
}

export function useProximityAlert({
  destination,
  radius = 200,
  stations = [],
  userPosition,
  sendNotification,
  enabled = false,
}: UseProximityAlertParams) {
  const hasNotifiedRef = useRef(false)

  const arrived = useMemo(() => {
    if (!enabled || !userPosition || !destination) return false
    return calculateDistance(userPosition.lat, userPosition.lng, destination.lat, destination.lng) <= radius
  }, [enabled, userPosition, destination, radius])

  const nearbyStations = useMemo<NearbyStation[]>(() => {
    if (!arrived || !destination) return []
    return stations
      .map((s): NearbyStation => ({
        ...s,
        distanceToDest: calculateDistance(destination.lat, destination.lng, s.lat, s.lng),
      }))
      .filter((s) => s.distanceToDest <= radius)
      .sort((a, b) => a.distanceToDest - b.distanceToDest)
  }, [arrived, destination, stations, radius])

  useEffect(() => {
    if (!arrived) {
      hasNotifiedRef.current = false
      return
    }
    if (hasNotifiedRef.current) return
    hasNotifiedRef.current = true

    const withStands = nearbyStations.filter((s) => s.availableStands > 0)
    const withBikes = nearbyStations.filter((s) => s.availableBikes > 0)
    if (withStands.length === 0 && withBikes.length === 0) return

    const parts: string[] = []
    if (withBikes.length > 0) {
      const best = withBikes[0]
      parts.push(`${best.availableBikes} vélo${best.availableBikes > 1 ? 's' : ''} à ${best.name}`)
    }
    if (withStands.length > 0) {
      const best = withStands[0]
      parts.push(`${best.availableStands} place${best.availableStands > 1 ? 's' : ''} à ${best.name}`)
    }
    sendNotification('Vous approchez de votre destination', {
      body: parts.join('\n'),
      tag: 'proximity-alert',
    })
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
  }, [arrived, nearbyStations, sendNotification])

  return { arrived, nearbyStations }
}
