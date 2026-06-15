import type { Station } from './types'
import { ADDRESS_API } from './constants'

export interface AddressFeature {
  properties: { id: string; label: string }
  geometry: { coordinates: [number, number] }
}

/** Recherche d'adresse via la BAN (base adresse nationale), biaisée sur Lyon. */
export async function searchAddress(query: string): Promise<AddressFeature[]> {
  const res = await fetch(`${ADDRESS_API}${encodeURIComponent(query)}&limit=5&lat=45.764&lon=4.835`)
  const data = (await res.json()) as { features?: AddressFeature[] }
  return data.features || []
}

const GBFS_URL = import.meta.env.VITE_VELOV_GBFS_URL
  || 'https://download.data.grandlyon.com/files/rdata/jcd_jcdecaux.jcdvelov/'

interface GbfsStationStatus {
  station_id: string
  num_bikes_available: number
  num_docks_available: number
  is_renting: number | boolean
  is_returning: number | boolean
  last_reported: number
}

interface GbfsStationInfo {
  station_id: string
  name?: string
  address?: string
  lat?: number
  lon?: number
  capacity?: number
}

let currentController: AbortController | null = null

export async function fetchStations(): Promise<Station[]> {
  if (currentController) currentController.abort()
  const controller = new AbortController()
  currentController = controller
  const { signal } = controller
  const timer = setTimeout(() => controller.abort(), 20000)

  let statusRes: Response, infoRes: Response
  try {
    [statusRes, infoRes] = await Promise.all([
      fetch(`${GBFS_URL}station_status.json`, { signal }),
      fetch(`${GBFS_URL}station_information.json`, { signal }),
    ])
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Délai dépassé — vérifiez votre connexion', { cause: err })
    }
    throw err
  }
  clearTimeout(timer)

  if (!statusRes.ok) throw new Error(`Status API error: ${statusRes.status}`)
  if (!infoRes.ok) throw new Error(`Info API error: ${infoRes.status}`)

  const statusData = (await statusRes.json()) as { data?: { stations?: GbfsStationStatus[] } }
  const infoData = (await infoRes.json()) as { data?: { stations?: GbfsStationInfo[] } }

  const statusStations = statusData?.data?.stations
  const infoStations = infoData?.data?.stations
  if (!Array.isArray(statusStations) || !Array.isArray(infoStations)) {
    throw new Error('Réponse GBFS inattendue — format de données invalide')
  }

  const infoMap = new Map<string, GbfsStationInfo>()
  for (const station of infoStations) {
    infoMap.set(station.station_id, station)
  }

  return statusStations.map((status): Station => {
    const info = infoMap.get(status.station_id)
    return {
      id: status.station_id,
      name: info?.name || status.station_id,
      address: info?.address || '',
      lat: info?.lat || 0,
      lng: info?.lon || 0,
      availableBikes: status.num_bikes_available,
      availableStands: status.num_docks_available,
      capacity: info?.capacity || 0,
      isRenting: Boolean(status.is_renting),
      isReturning: Boolean(status.is_returning),
      lastUpdated: new Date(status.last_reported * 1000),
    }
  })
}
