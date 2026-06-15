import { useState, useEffect } from 'react'
import type { GeoLineString } from '../types'

export interface RouteWeather {
  precipProb: number
}

export function useRouteWeather(routeGeometry: GeoLineString | null): RouteWeather | null {
  const [weather, setWeather] = useState<RouteWeather | null>(null)

  useEffect(() => {
    if (!routeGeometry?.coordinates?.length) {
      const t = setTimeout(() => setWeather(null), 0)
      return () => clearTimeout(t)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const coords = routeGeometry.coordinates
    const [lng, lat] = coords[Math.floor(coords.length / 2)]

    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&hourly=precipitation_probability,weathercode&forecast_days=1&timezone=auto`,
      { signal: controller.signal },
    )
      .then((r) => r.json() as Promise<{ hourly?: { precipitation_probability?: number[] } }>)
      .then((data) => {
        clearTimeout(timer)
        if (controller.signal.aborted) return
        const hours = data.hourly?.precipitation_probability ?? []
        const h = new Date().getHours()
        const next3 = hours.slice(h, h + 3)
        const maxProb = next3.length ? Math.max(...next3) : 0
        setTimeout(() => setWeather({ precipProb: maxProb }), 0)
      })
      .catch(() => { clearTimeout(timer) })

    return () => { clearTimeout(timer); controller.abort() }
  }, [routeGeometry])

  return weather
}
