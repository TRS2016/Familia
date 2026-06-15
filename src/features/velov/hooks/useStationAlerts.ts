import { useState, useCallback, useEffect, useRef } from 'react'
import type { NotificationSender, Station } from '../types'

const STORAGE_KEY = 'velov-alerts'
const THRESHOLD_KEY = 'velov-alert-thresholds'

function loadThresholds(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(THRESHOLD_KEY) || '{}') as Record<string, number> }
  catch { return {} }
}

export interface UseStationAlertsParams {
  stations: Station[]
  sendNotification: NotificationSender
  permission: NotificationPermission
}

export function useStationAlerts({ stations, sendNotification, permission }: UseStationAlertsParams) {
  const [alertedStationIds, setAlertedStationIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as string[])
    } catch {
      return new Set()
    }
  })
  const [thresholds, setThresholdsState] = useState<Record<string, number>>(loadThresholds)

  const prevBikesRef = useRef<Record<string, number>>({})
  const thresholdsRef = useRef(thresholds)
  useEffect(() => { thresholdsRef.current = thresholds })

  useEffect(() => {
    if (alertedStationIds.size === 0) return
    stations.forEach((station) => {
      if (!alertedStationIds.has(station.id)) return
      const prev = prevBikesRef.current[station.id]
      const threshold = thresholdsRef.current[station.id]
      if (prev !== undefined && permission === 'granted') {
        const plural = station.availableBikes > 1 ? 's' : ''
        if (threshold != null) {
          if (prev > threshold && station.availableBikes <= threshold) {
            sendNotification(station.name, {
              body: `Plus que ${station.availableBikes} vélo${plural} disponible${plural}`,
              tag: `alert-${station.id}`,
            })
            if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
          }
        } else if (prev === 0 && station.availableBikes > 0) {
          sendNotification(station.name, {
            body: `${station.availableBikes} vélo${plural} disponible${plural}`,
            tag: `alert-${station.id}`,
          })
          if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
        }
      }
      prevBikesRef.current[station.id] = station.availableBikes
    })
  }, [stations, alertedStationIds, sendNotification, permission])

  const toggleAlert = useCallback((stationId: string) => {
    setAlertedStationIds((prev) => {
      const next = new Set(prev)
      if (next.has(stationId)) next.delete(stationId)
      else next.add(stationId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  const setThreshold = useCallback((stationId: string, value: number | string | null) => {
    setThresholdsState((prev) => {
      const next = { ...prev }
      if (value == null || value === '') delete next[stationId]
      else next[stationId] = Number(value)
      localStorage.setItem(THRESHOLD_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { alertedStationIds, toggleAlert, thresholds, setThreshold }
}
