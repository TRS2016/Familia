import { useState, useRef } from 'react'
import { Search, ArrowLeftRight, X, ChevronUp, ChevronDown, Share2, Check } from 'lucide-react'
import { DESTINATIONS } from '../constants'
import { searchAddress, type AddressFeature } from '../api'
import type { FavoriteRoute, RoutePoint, SearchPlace } from '../types'
import ui from './velovUi.module.css'
import styles from './RoutePlanner.module.css'

function placeFromFeature(feature: AddressFeature): SearchPlace {
  const [lng, lat] = feature.geometry.coordinates
  return { id: 'addr-' + feature.properties.id, name: feature.properties.label, lat, lng }
}

interface AddressSearchProps {
  value: string
  onChange: (v: string) => void
  onSearch: () => void
  searching: boolean
  results: AddressFeature[]
  onSelect: (f: AddressFeature) => void
  placeholder: string
  inputId: string
  history?: SearchPlace[]
  onHistorySelect?: (p: SearchPlace) => void
}

function AddressSearch({
  value, onChange, onSearch, searching, results, onSelect, placeholder, inputId,
  history = [], onHistorySelect,
}: AddressSearchProps) {
  return (
    <div className={ui.stackTight}>
      <div className={styles.searchRow}>
        <input
          id={inputId}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          className={ui.input}
        />
        <button onClick={onSearch} disabled={searching || !value.trim()} aria-label="Rechercher une adresse" className={styles.searchBtn}>
          {searching ? '...' : <Search size={16} />}
        </button>
      </div>
      {results.length > 0 && (
        <div className={ui.resultsList}>
          {results.map((feat) => (
            <button key={feat.properties.id} onClick={() => onSelect(feat)} className={ui.resultItem}>
              {feat.properties.label}
            </button>
          ))}
        </div>
      )}
      {results.length === 0 && history.length > 0 && (
        <div className={styles.historyRow}>
          <span className={styles.historyLabel}>Récents :</span>
          {history.map((place) => (
            <button key={place.id} onClick={() => onHistorySelect?.(place)} className={ui.chip}>
              {place.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export interface RoutePlannerProps {
  origin: RoutePoint | null
  destination: RoutePoint | null
  onOriginChange: (p: RoutePoint | null) => void
  onDestinationChange: (p: RoutePoint | null) => void
  onCalculate: () => void
  onClear?: () => void
  /** Position déjà connue (GPS actif ou position manuelle) : évite un re-prompt. */
  currentPosition?: RoutePoint | null
  customPlaces?: SearchPlace[]
  loading?: boolean
  error?: string | null
  searchHistory?: SearchPlace[]
  onHistoryAdd?: (p: SearchPlace) => void
  favoriteRoutes?: FavoriteRoute[]
  onFavoriteRemove?: (id: string) => void
  onFavoriteSelect?: (route: FavoriteRoute) => void
}

export function RoutePlanner({
  origin, destination, onOriginChange, onDestinationChange, onCalculate, onClear,
  currentPosition = null, customPlaces = [], loading = false, error = null,
  searchHistory = [], onHistoryAdd,
  favoriteRoutes = [], onFavoriteRemove, onFavoriteSelect,
}: RoutePlannerProps) {
  const [manualOrigin, setManualOrigin] = useState('')
  const [originResults, setOriginResults] = useState<AddressFeature[]>([])
  const [searchingOrigin, setSearchingOrigin] = useState(false)
  const [manualDest, setManualDest] = useState('')
  const [destResults, setDestResults] = useState<AddressFeature[]>([])
  const [searchingDest, setSearchingDest] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const originTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const destTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const allPlaces = [...DESTINATIONS, ...customPlaces]

  function handleUseMyLocation() {
    if (currentPosition) {
      setLocationError(null)
      onOriginChange({ id: 'my-location', name: 'Ma position', lat: currentPosition.lat, lng: currentPosition.lng })
      return
    }
    if (!navigator.geolocation) {
      setLocationError('Géolocalisation non supportée par votre navigateur')
      return
    }
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => onOriginChange({ id: 'my-location', name: 'Ma position', lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setLocationError(err.code === 1 ? 'Accès à la position refusé' : "Impossible d'obtenir la position"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  function handleSwap() {
    onOriginChange(destination)
    onDestinationChange(origin)
    setManualOrigin(''); setOriginResults([]); setManualDest(''); setDestResults([])
  }

  function runOriginSearch(query: string) {
    setSearchingOrigin(true)
    searchAddress(query)
      .then((r) => { setOriginResults(r); setSearchingOrigin(false) })
      .catch(() => { setOriginResults([]); setSearchingOrigin(false) })
  }

  function handleOriginQueryChange(value: string) {
    setManualOrigin(value)
    clearTimeout(originTimerRef.current)
    if (value.trim().length >= 3) originTimerRef.current = setTimeout(() => runOriginSearch(value), 500)
    else setOriginResults([])
  }

  function runDestSearch(query: string) {
    setSearchingDest(true)
    searchAddress(query)
      .then((r) => { setDestResults(r); setSearchingDest(false) })
      .catch(() => { setDestResults([]); setSearchingDest(false) })
  }

  function handleDestQueryChange(value: string) {
    setManualDest(value)
    clearTimeout(destTimerRef.current)
    if (value.trim().length >= 3) destTimerRef.current = setTimeout(() => runDestSearch(value), 500)
    else setDestResults([])
  }

  function handleSelectOrigin(feature: AddressFeature) {
    const place = placeFromFeature(feature)
    onOriginChange(place); onHistoryAdd?.(place); setManualOrigin(''); setOriginResults([])
  }

  function handleSelectDest(feature: AddressFeature) {
    const place = placeFromFeature(feature)
    onDestinationChange(place); onHistoryAdd?.(place); setManualDest(''); setDestResults([])
  }

  function handleSelectFavorite(route: FavoriteRoute) {
    onFavoriteSelect?.(route)
    setShowFavorites(false)
  }

  // Partage d'un trajet favori : lien profond (Velov sait parser ?from/?to) via
  // Web Share, sinon copie dans le presse-papier.
  const [sharedId, setSharedId] = useState<string | null>(null)
  async function shareFavorite(route: FavoriteRoute) {
    const base = `${window.location.origin}${window.location.pathname}`
    const url = `${base}?tab=route&from=${route.origin.lat},${route.origin.lng}&to=${route.destination.lat},${route.destination.lng}`
    const title = `Trajet Vélo'v : ${route.origin.name} → ${route.destination.name}`
    try {
      if (navigator.share) { await navigator.share({ title, text: title, url }); return }
      await navigator.clipboard.writeText(url)
      setSharedId(route.id)
      setTimeout(() => setSharedId(null), 2000)
    } catch { /* partage annulé / indisponible */ }
  }

  return (
    <div className={[ui.section, ui.tintInfo].join(' ')}>
      <div className={[ui.inner, ui.stack].join(' ')}>

        {favoriteRoutes.length > 0 && (
          <div>
            <button onClick={() => setShowFavorites(!showFavorites)} className={styles.favToggle}>
              ⭐ Itinéraires favoris ({favoriteRoutes.length}) {showFavorites ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {showFavorites && (
              <div className={styles.favList}>
                {favoriteRoutes.map((route) => (
                  <div key={route.id} className={styles.favRow}>
                    <button onClick={() => handleSelectFavorite(route)} className={styles.favSelect}>
                      {route.origin.name} → {route.destination.name}
                    </button>
                    <button onClick={() => shareFavorite(route)} aria-label="Partager cet itinéraire avec le foyer" className={styles.favRemove}>
                      {sharedId === route.id ? <Check size={14} /> : <Share2 size={14} />}
                    </button>
                    <button onClick={() => onFavoriteRemove?.(route.id)} aria-label="Supprimer cet itinéraire favori" className={styles.favRemove}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Départ */}
        <div className={styles.endpoint}>
          <span className={[styles.dot, styles.dotStart].join(' ')} aria-hidden="true" />
          <label htmlFor="route-origin-select" className={styles.endpointLabel}>Départ</label>
          {origin ? (
            <div className={ui.pill} style={{ flex: 1 }}>
              <span className={ui.pillText}>{origin.name}</span>
              <button onClick={() => onOriginChange(null)} aria-label="Supprimer le point de départ" className={styles.removeX}><X size={14} /></button>
            </div>
          ) : (
            <div className={ui.field}>
              <select
                id="route-origin-select"
                aria-label="Lieu de départ"
                onChange={(e) => {
                  if (e.target.value === 'use-my-location') handleUseMyLocation()
                  else {
                    const place = allPlaces.find((d) => d.id === e.target.value)
                    if (place) { onOriginChange(place); onHistoryAdd?.(place) }
                  }
                }}
                className={ui.select}
                value=""
              >
                <option value="">Sélectionner un lieu de départ...</option>
                <option value="use-my-location">📍 Ma position</option>
                <optgroup label="Gares & Lieux">
                  {DESTINATIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </optgroup>
                {customPlaces.length > 0 && (
                  <optgroup label="Mes lieux">
                    {customPlaces.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </optgroup>
                )}
              </select>
              <AddressSearch
                inputId="route-origin-address"
                value={manualOrigin}
                onChange={handleOriginQueryChange}
                onSearch={() => { if (manualOrigin.trim()) runOriginSearch(manualOrigin) }}
                searching={searchingOrigin}
                results={originResults}
                onSelect={handleSelectOrigin}
                placeholder="Ou rechercher une adresse..."
                history={searchHistory}
                onHistorySelect={(place) => onOriginChange(place)}
              />
            </div>
          )}
        </div>

        <div className={styles.swapRow}>
          <button onClick={handleSwap} aria-label="Inverser le départ et l'arrivée" className={styles.swapBtn}>
            <ArrowLeftRight size={16} />
          </button>
        </div>

        {/* Arrivée */}
        <div className={styles.endpoint}>
          <span className={[styles.dot, styles.dotEnd].join(' ')} aria-hidden="true" />
          <label htmlFor="route-dest-select" className={styles.endpointLabel}>Arrivée</label>
          {destination ? (
            <div className={ui.pill} style={{ flex: 1 }}>
              <span className={ui.pillText}>{destination.name}</span>
              <button onClick={() => onDestinationChange(null)} aria-label="Supprimer la destination" className={styles.removeX}><X size={14} /></button>
            </div>
          ) : (
            <div className={ui.field}>
              <select
                id="route-dest-select"
                aria-label="Destination"
                onChange={(e) => {
                  const dest = allPlaces.find((d) => d.id === e.target.value)
                  if (dest) { onDestinationChange(dest); onHistoryAdd?.(dest) }
                }}
                className={ui.select}
                value=""
              >
                <option value="">Sélectionner une destination...</option>
                <optgroup label="Gares & Lieux">
                  {DESTINATIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </optgroup>
                {customPlaces.length > 0 && (
                  <optgroup label="Mes lieux">
                    {customPlaces.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </optgroup>
                )}
              </select>
              <AddressSearch
                inputId="route-dest-address"
                value={manualDest}
                onChange={handleDestQueryChange}
                onSearch={() => { if (manualDest.trim()) runDestSearch(manualDest) }}
                searching={searchingDest}
                results={destResults}
                onSelect={handleSelectDest}
                placeholder="Ou rechercher une adresse..."
                history={searchHistory}
                onHistorySelect={(place) => onDestinationChange(place)}
              />
            </div>
          )}
        </div>

        {locationError && <p role="alert" className={ui.warnBox}>📍 {locationError}</p>}
        {error && (
          <div role="alert" className={ui.errorBox}>
            <span style={{ flex: 1 }}>⚠️ {error}</span>
            <button onClick={onCalculate} disabled={!origin || !destination} className={ui.btnPrimary}>Réessayer</button>
          </div>
        )}

        <div className={styles.actions}>
          {onClear && <button onClick={onClear} className={ui.btnGhost}>Effacer</button>}
          <button onClick={onCalculate} disabled={!origin || !destination || loading} className={ui.btnPrimary}>
            {loading && <span className={ui.spinner} aria-hidden="true" />}
            {loading ? 'Calcul...' : "Calculer l'itinéraire"}
          </button>
        </div>
      </div>
    </div>
  )
}
