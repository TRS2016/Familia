import { useState, useEffect } from 'react'
import type { GeoLineString } from '../types'

const MAX_POINTS = 50

interface OpenTopoResult { elevation: number | null }

export function useElevationProfile(routeGeometry: GeoLineString | null) {
  const [elevations, setElevations] = useState<number[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!routeGeometry?.coordinates?.length) {
      const t = setTimeout(() => setElevations(null), 0)
      return () => clearTimeout(t)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    setTimeout(() => setLoading(true), 0)

    const coords = routeGeometry.coordinates
    const step = Math.max(1, Math.floor(coords.length / MAX_POINTS))
    const sampled: typeof coords = []
    for (let i = 0; i < coords.length; i += step) sampled.push(coords[i])

    const locations = sampled.map(([lng, lat]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join('|')

    fetch(`https://api.opentopodata.org/v1/eudem25m?locations=${locations}`, { signal: controller.signal })
      .then((r) => r.json() as Promise<{ results?: OpenTopoResult[] }>)
      .then((data) => {
        clearTimeout(timer)
        if (controller.signal.aborted) return
        const elev = data.results?.map((r) => r.elevation).filter((e): e is number => e != null) ?? []
        setTimeout(() => { setElevations(elev.length >= 2 ? elev : null); setLoading(false) }, 0)
      })
      .catch(() => {
        clearTimeout(timer)
        if (!controller.signal.aborted) setTimeout(() => { setElevations(null); setLoading(false) }, 0)
      })

    return () => { clearTimeout(timer); controller.abort() }
  }, [routeGeometry])

  return { elevations, loading }
}
