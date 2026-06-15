import { useState, useCallback, useRef, useEffect } from 'react'
import type { NotificationSender } from '../types'

export interface ScheduledReminder {
  id: string
  stationId: string
  stationName: string
  timeStr: string
  displayTime: string
}

export function useScheduledAlerts(sendNotification: NotificationSender) {
  const [reminders, setReminders] = useState<ScheduledReminder[]>([])
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const scheduleReminder = useCallback((stationId: string, stationName: string, timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number)
    const target = new Date()
    target.setHours(h, m, 0, 0)
    if (target <= new Date()) target.setDate(target.getDate() + 1)

    const id = `${stationId}-${timeStr}`
    if (timersRef.current[id]) clearTimeout(timersRef.current[id])

    const delay = target.getTime() - Date.now()
    timersRef.current[id] = setTimeout(() => {
      sendNotification(`Rappel : ${stationName}`, {
        body: 'Heure de vérifier la disponibilité des vélos !',
        tag: `reminder-${stationId}`,
      })
      setReminders((prev) => prev.filter((r) => r.id !== id))
      delete timersRef.current[id]
    }, delay)

    const displayTime = target.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    setReminders((prev) => [
      ...prev.filter((r) => r.stationId !== stationId),
      { id, stationId, stationName, timeStr, displayTime },
    ])
  }, [sendNotification])

  const cancelReminder = useCallback((id: string) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id])
      delete timersRef.current[id]
    }
    setReminders((prev) => prev.filter((r) => r.id !== id))
  }, [])

  useEffect(() => {
    const timers = timersRef.current
    return () => { Object.values(timers).forEach(clearTimeout) }
  }, [])

  return { reminders, scheduleReminder, cancelReminder }
}
