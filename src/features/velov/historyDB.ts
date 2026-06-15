const DB_NAME = 'velov-history'
const STORE_NAME = 'station-snapshots'
const DB_VERSION = 1
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface StationSnapshot {
  id?: number
  stationId: string
  availableBikes: number
  availableStands: number
  timestamp: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
          store.createIndex('stationId', 'stationId', { unique: false })
          store.createIndex('timestamp', 'timestamp', { unique: false })
          store.createIndex('stationId_timestamp', ['stationId', 'timestamp'], { unique: false })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        dbPromise = null
        reject(request.error)
      }
    })
  }
  return dbPromise
}

const prevSnapshots = new Map<string, { bikes: number; stands: number }>()

export async function saveSnapshot(
  stationId: string, availableBikes: number, availableStands: number,
): Promise<void> {
  const prev = prevSnapshots.get(stationId)
  if (prev && prev.bikes === availableBikes && prev.stands === availableStands) return
  prevSnapshots.set(stationId, { bikes: availableBikes, stands: availableStands })
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add({ stationId, availableBikes, availableStands, timestamp: Date.now() })
  } catch {
    // non critique
  }
}

export async function getStationHistory(
  stationId: string, maxAge = MAX_AGE_MS,
): Promise<StationSnapshot[]> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const index = tx.objectStore(STORE_NAME).index('stationId_timestamp')
    const range = IDBKeyRange.bound([stationId, Date.now() - maxAge], [stationId, Date.now()])

    return new Promise<StationSnapshot[]>((resolve) => {
      const request = index.getAll(range)
      request.onsuccess = () =>
        resolve((request.result as StationSnapshot[]).sort((a, b) => a.timestamp - b.timestamp))
      request.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

export async function cleanupOldEntries(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const index = tx.objectStore(STORE_NAME).index('timestamp')
    const range = IDBKeyRange.upperBound(Date.now() - MAX_AGE_MS)
    const request = index.openCursor(range)
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) { cursor.delete(); cursor.continue() }
    }
  } catch {
    // non critique
  }
}

/** Profil horaire moyen de vélos disponibles (24 entrées), ou null si trop peu de données. */
export async function getHourlyPattern(stationId: string): Promise<(number | null)[] | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const index = tx.objectStore(STORE_NAME).index('stationId')
    return new Promise<(number | null)[] | null>((resolve) => {
      const request = index.getAll(IDBKeyRange.only(stationId))
      request.onsuccess = () => {
        const entries = request.result as StationSnapshot[]
        if (entries.length < 5) { resolve(null); return }
        const byHour = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }))
        for (const e of entries) {
          const h = new Date(e.timestamp).getHours()
          byHour[h].sum += e.availableBikes
          byHour[h].count++
        }
        resolve(byHour.map(({ sum, count }) => (count >= 2 ? Math.round(sum / count) : null)))
      }
      request.onerror = () => resolve(null)
    })
  } catch { return null }
}

const CLEANUP_KEY = 'velov-db-cleaned'
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const lastClean = parseInt(localStorage.getItem(CLEANUP_KEY) || '0', 10)
if (Date.now() - lastClean > ONE_DAY_MS) {
  void cleanupOldEntries().then(() => localStorage.setItem(CLEANUP_KEY, Date.now().toString()))
}
