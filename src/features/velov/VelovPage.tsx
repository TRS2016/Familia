import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { Bike, Map as MapIcon, Navigation, ParkingSquare, Star, MapPin, Bell, RefreshCw, X, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { StationCard } from './components/StationCard'
import { SearchFilter, type StationFilter, type StationSort } from './components/SearchFilter'
import { ProximityAlertBanner } from './components/ProximityAlertBanner'
import { CustomDestinationManager } from './components/CustomDestinationManager'
import { RoutePlanner } from './components/RoutePlanner'
import { RouteInfoBanner } from './components/RouteInfoBanner'
import { StationBottomSheet } from './components/StationBottomSheet'
import { NavigationPanel } from './components/NavigationPanel'
import { FloatingNavBanner } from './components/FloatingNavBanner'
import { WalkNavOverlay } from './components/WalkNavOverlay'
import { SystemBanners } from './components/SystemBanners'
import { NotifExplainerModal } from './components/NotifExplainerModal'
import { DeviationBanner } from './components/DeviationBanner'
import { useStations } from './hooks/useStations'
import { useGeolocation } from './hooks/useGeolocation'
import { useNotifications } from './hooks/useNotifications'
import { useProximityAlert } from './hooks/useProximityAlert'
import { useFavorites } from './hooks/useFavorites'
import { useRoutePlanner } from './hooks/useRoutePlanner'
import { useRecommendedStations } from './hooks/useRecommendedStations'
import { useStationAlerts } from './hooks/useStationAlerts'
import { useSearchHistory } from './hooks/useSearchHistory'
import { useFavoriteRoutes } from './hooks/useFavoriteRoutes'
import { useRouteDeviation } from './hooks/useRouteDeviation'
import { useRouteProgress } from './hooks/useRouteProgress'
import { useVoiceNavigation } from './hooks/useVoiceNavigation'
import { usePullToRefresh } from './hooks/usePullToRefresh'
import { useWalkingLegs } from './hooks/useWalkingLegs'
import { useJourney } from './hooks/useJourney'
import { calculateDistance, formatWalkTime, timeAgo } from './geo'
import { useTheme } from '../../lib/useTheme'
import type { FavoriteRoute, RoutePoint, SearchPlace, Station } from './types'
import styles from './VelovPage.module.css'

const StationMap = lazy(() => import('./components/StationMap').then((m) => ({ default: m.StationMap })))

const PAGE_SIZE = 30
type Tab = 'stations' | 'map' | 'route'

const TABS: { id: Tab; Icon: typeof Bike; label: string }[] = [
  { id: 'stations', Icon: Bike, label: 'Stations' },
  { id: 'map', Icon: MapIcon, label: 'Carte' },
  { id: 'route', Icon: Navigation, label: 'Itinéraire' },
]

export default function VelovPage() {
  const { stations, loading, error, refresh, isFromCache, fetchedAt } = useStations()
  const {
    position: userLocation, accuracy: geoAccuracy, heading: geoHeading,
    error: geoError, startWatching, stopWatching,
  } = useGeolocation()
  const { permission, requestPermission, sendNotification } = useNotifications()
  const { favorites, toggleFavorite } = useFavorites()
  const { history: searchHistory, addToHistory } = useSearchHistory()
  const { favoriteRoutes, saveRoute, removeRoute } = useFavoriteRoutes()

  const { theme } = useTheme()
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = () => setSystemDark(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  const dark = theme === 'dark' || (theme === 'system' && systemDark)

  // Desktop (≥1024px) : carte affichée en permanence à droite, l'onglet
  // « Carte » disparaît (les onglets restants pilotent la colonne de gauche).
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const h = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  const {
    setShowRoutePlanner,
    routeOrigin, setRouteOrigin,
    routeDestination, setRouteDestination,
    routeGeometry, routeInfo, stationsAlongRoute,
    routeLoading, routeError, calculateRoute, clearRoute,
    allRoutes, activeRouteIdx, selectAlternative,
  } = useRoutePlanner(stations)

  const { deviated } = useRouteDeviation({ routeGeometry, userPosition: userLocation })
  const routeProgress = useRouteProgress({ routeGeometry, userPosition: userLocation })
  const voiceNav = useVoiceNavigation({ steps: routeInfo?.steps ?? null, userPosition: userLocation })

  const { recommendedStartStations, recommendedEndStations, startWalkSeconds, endWalkSeconds } = useRecommendedStations({
    routeOrigin, routeDestination, stations, sendNotification, permission,
  })

  const { walkToStart, walkFromEnd } = useWalkingLegs({
    origin: routeOrigin,
    startStation: recommendedStartStations[0] ?? null,
    endStation: recommendedEndStations[0] ?? null,
    destination: routeDestination,
  })

  const { alertedStationIds, toggleAlert, thresholds, setThreshold } = useStationAlerts({ stations, sendNotification, permission })

  const availableBikes = useMemo(() => stations.reduce((sum, s) => sum + s.availableBikes, 0), [stations])

  const [mapSheetStation, setMapSheetStation] = useState<Station | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    return (['stations', 'map', 'route'] as const).includes(tab as Tab) ? (tab as Tab) : 'stations'
  })
  const [showPlannerForm, setShowPlannerForm] = useState(true)
  const [mapPlanStep, setMapPlanStep] = useState(0)
  const [mapPlanOrigin, setMapPlanOrigin] = useState<RoutePoint | null>(null)

  // Sur desktop l'onglet Carte n'existe pas (carte permanente) : on corrige la
  // sélection pendant le rendu plutôt qu'en effet (React re-rend aussitôt, pas de flash).
  if (isDesktop && activeTab === 'map') setActiveTab('stations')

  const ensureWatching = useCallback(() => { startWatching() }, [startWatching])
  const routeInfoRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StationFilter>('all')
  const [openOnly, setOpenOnly] = useState(false)
  const [minBikes, setMinBikes] = useState(0)
  const [maxDistance, setMaxDistance] = useState(0)
  const [destination, setDestination] = useState<RoutePoint | null>(null)
  const [proximityEnabled, setProximityEnabled] = useState(false)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [sort, setSort] = useState<StationSort>('distance')
  const [mapFollowMode, setMapFollowMode] = useState(false)
  const [mapFilter, setMapFilter] = useState<'all' | 'bikes' | 'stands' | 'favorites'>('all')
  const [eta, setEta] = useState<string | null>(null)
  const [autoRecalcCountdown, setAutoRecalcCountdown] = useState<number | null>(null)
  const [notifDenied, setNotifDenied] = useState(false)
  const [showNotifExplainer, setShowNotifExplainer] = useState(false)
  const pendingNotifActionRef = useRef<(() => void) | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('velov-onboarded'))
  const [showHomeMenu, setShowHomeMenu] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [customPlaces, setCustomPlaces] = useState<SearchPlace[]>(() => {
    try {
      const stored = localStorage.getItem('velov-custom-places')
      return stored ? (JSON.parse(stored) as SearchPlace[]) : []
    } catch { return [] }
  })

  // Machine à états du trajet complet (marche → vélo → marche) extraite dans useJourney.
  const {
    journeyPhase, journeyUnderway,
    walkNavStation, walkNavRoute, walkNavLoading, walkNavProgress, walkVoiceNav,
    trimmedWalkNavGeometry, distToWalkNavStation,
    endStationForJourney, endStationIsFallback, distToEndStation, journeyElapsedMins,
    startJourney, cancelJourney, walkToStation, stopWalkNav,
  } = useJourney({
    userLocation, stations, recommendedStartStations, recommendedEndStations, routeDestination,
    sendNotification, ensureWatching, startWatching, setMapFollowMode, setActiveTab, isDesktop,
    setMapSheetStation, voiceNav,
  })

  const [urlParams] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const from = params.get('from'); const to = params.get('to')
      if (!from || !to) return null
      const [fromLat, fromLng] = from.split(',').map(Number)
      const [toLat, toLng] = to.split(',').map(Number)
      if ([fromLat, fromLng, toLat, toLng].some(isNaN)) return null
      return {
        origin: { id: 'shared-origin', name: 'Départ (partagé)', lat: fromLat, lng: fromLng },
        destination: { id: 'shared-dest', name: 'Destination (partagée)', lat: toLat, lng: toLng },
      }
    } catch { return null }
  })

  const urlParamsApplied = useRef(false)
  useEffect(() => {
    if (urlParamsApplied.current || !urlParams) return
    urlParamsApplied.current = true
    const t = setTimeout(() => {
      setRouteOrigin(urlParams.origin)
      setRouteDestination(urlParams.destination)
      setShowRoutePlanner(true)
      setActiveTab('route')
    }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setVisibleCount(PAGE_SIZE), 0)
    return () => clearTimeout(t)
  }, [search, filter, showFavoritesOnly, openOnly, minBikes, maxDistance])

  const [dataAgeMs, setDataAgeMs] = useState<number | null>(null)
  useEffect(() => {
    const update = () => setDataAgeMs(fetchedAt ? Date.now() - fetchedAt.getTime() : null)
    update()
    const interval = setInterval(update, 30000)
    return () => clearInterval(interval)
  }, [fetchedAt])

  const startWalkSecs = startWalkSeconds ?? (recommendedStartStations[0]?.walkTime ?? 0)
  const endWalkSecs = endWalkSeconds ?? (recommendedEndStations[0]?.walkTime ?? 0)
  const totalJourneyMins = (routeInfo && recommendedStartStations.length && recommendedEndStations.length)
    ? Math.round((startWalkSecs + routeInfo.duration + endWalkSecs) / 60)
    : null

  useEffect(() => {
    const compute = () => {
      if (!totalJourneyMins) { setEta(null); return }
      const arr = new Date(Date.now() + totalJourneyMins * 60000)
      setEta(arr.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
    }
    compute()
    const interval = setInterval(compute, 60000)
    return () => clearInterval(interval)
  }, [totalJourneyMins])

  const filteredStations = useMemo(() => {
    let result: (Station & { distance?: number })[] = showFavoritesOnly ? stations.filter((s) => favorites.includes(s.id)) : stations
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((s) => s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q))
    }
    if (filter === 'bikes') result = result.filter((s) => s.availableBikes > 0)
    else if (filter === 'stands') result = result.filter((s) => s.availableStands > 0)
    if (openOnly) result = result.filter((s) => s.isRenting)
    if (minBikes > 0) result = result.filter((s) => s.availableBikes >= minBikes)
    if (userLocation) {
      result = result.map((s) => ({ ...s, distance: calculateDistance(userLocation.lat, userLocation.lng, s.lat, s.lng) }))
      if (maxDistance > 0) result = result.filter((s) => (s.distance ?? 0) <= maxDistance)
    }
    if (sort === 'bikes') result = [...result].sort((a, b) => b.availableBikes - a.availableBikes)
    else if (sort === 'name') result = [...result].sort((a, b) => a.name.localeCompare(b.name))
    else if (userLocation) result = [...result].sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    return result
  }, [stations, favorites, showFavoritesOnly, search, filter, openOnly, minBikes, maxDistance, userLocation, sort])

  const mapFilteredStations = useMemo(() => (
    mapFilter === 'bikes' ? stations.filter((s) => s.availableBikes > 0)
      : mapFilter === 'stands' ? stations.filter((s) => s.availableStands > 0)
      : mapFilter === 'favorites' ? stations.filter((s) => favorites.includes(s.id))
      : stations
  ), [mapFilter, stations, favorites])

  // Badge OS : vélos à la station la plus proche si localisé, sinon nb de favoris
  // (le total de vélos sur tout Lyon n'a aucun sens en badge — saturerait à 99+).
  // Vraie station la plus proche, indépendamment du tri de la liste affichée.
  const nearestBikes = useMemo(() => {
    if (!userLocation || stations.length === 0) return null
    let best: Station | null = null, bestD = Infinity
    for (const s of stations) {
      const d = calculateDistance(userLocation.lat, userLocation.lng, s.lat, s.lng)
      if (d < bestD) { bestD = d; best = s }
    }
    return best?.availableBikes ?? null
  }, [userLocation, stations])
  const badgeCount = nearestBikes ?? favorites.length
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    navigator.setAppBadge(badgeCount).catch(() => {})
    return () => { navigator.clearAppBadge?.().catch(() => {}) }
  }, [badgeCount])

  useEffect(() => {
    let cancelled = false
    if (!deviated || !userLocation || journeyUnderway) {
      void Promise.resolve().then(() => { if (!cancelled) setAutoRecalcCountdown(null) })
      return () => { cancelled = true }
    }
    const { lat, lng } = userLocation
    let count = 10
    void Promise.resolve().then(() => { if (!cancelled) setAutoRecalcCountdown(count) })
    const id = setInterval(() => {
      if (cancelled) return
      count--
      if (count <= 0) {
        clearInterval(id)
        setAutoRecalcCountdown(null)
        const posOrigin = { id: 'my-location', name: 'Ma position', lat, lng }
        setRouteOrigin(posOrigin)
        void calculateRoute(() => {}, posOrigin)
      } else setAutoRecalcCountdown(count)
    }, 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [deviated, userLocation, journeyUnderway, setRouteOrigin, calculateRoute])

  useEffect(() => {
    const t = setTimeout(() => setShowPlannerForm(!routeInfo), 0)
    return () => clearTimeout(t)
  }, [routeInfo])

  useEffect(() => {
    if (!routeInfo || !routeInfoRef.current) return
    const t = setTimeout(() => routeInfoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    return () => clearTimeout(t)
  }, [routeInfo])

  const { arrived, nearbyStations } = useProximityAlert({
    destination, radius: 200, stations, userPosition: userLocation, sendNotification, enabled: proximityEnabled,
  })

  const lastUpdated = useMemo(() => {
    if (!stations.length) return null
    return stations.reduce((max, s) => (s.lastUpdated > max ? s.lastUpdated : max), stations[0].lastUpdated)
  }, [stations])

  const distanceToDest = useMemo(() => {
    if (!userLocation || !destination) return null
    return calculateDistance(userLocation.lat, userLocation.lng, destination.lat, destination.lng)
  }, [userLocation, destination])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE) },
      { rootMargin: '300px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [filteredStations.length])

  const handleToggleAlert = useCallback((stationId: string) => {
    if (permission === 'denied') { setNotifDenied(true); setTimeout(() => setNotifDenied(false), 4000); return }
    if (permission === 'default') { pendingNotifActionRef.current = () => toggleAlert(stationId); setShowNotifExplainer(true); return }
    toggleAlert(stationId)
  }, [permission, toggleAlert])

  const handleDisableProximity = useCallback(() => {
    setProximityEnabled(false); setDestination(null); stopWatching()
  }, [stopWatching])

  const handleClearAll = useCallback(() => {
    clearRoute(); setDestination(null); setProximityEnabled(false)
    cancelJourney(); stopWatching()
  }, [clearRoute, stopWatching, cancelJourney])

  const doEnableProximity = useCallback(() => {
    if (recommendedEndStations.length > 0) {
      const station = recommendedEndStations[0]
      setDestination({ id: `recommended-end-${station.id}`, name: `🅿️ ${station.name}`, lat: station.lat, lng: station.lng })
    } else if (routeDestination) setDestination(routeDestination)
    else return
    setProximityEnabled(true); ensureWatching()
  }, [recommendedEndStations, routeDestination, ensureWatching])

  const handleEnableRouteProximity = useCallback(() => {
    if (permission === 'denied') { setNotifDenied(true); setTimeout(() => setNotifDenied(false), 4000); return }
    if (permission === 'default') { pendingNotifActionRef.current = doEnableProximity; setShowNotifExplainer(true); return }
    doEnableProximity()
  }, [permission, doEnableProximity])

  const handleFavoriteSelect = useCallback((route: FavoriteRoute) => {
    setRouteOrigin(route.origin); setRouteDestination(route.destination); setShowRoutePlanner(true); setActiveTab('route')
  }, [setRouteOrigin, setRouteDestination, setShowRoutePlanner])

  const handleGoHome = useCallback((place: SearchPlace) => {
    setShowHomeMenu(false)
    const applyDest = (origin: RoutePoint | null) => {
      setRouteOrigin(origin); setRouteDestination(place); setShowRoutePlanner(true); setActiveTab('route')
    }
    // Position déjà connue (GPS actif ou position manuelle) : pas de re-prompt.
    if (userLocation) {
      applyDest({ id: 'my-location', name: 'Ma position', lat: userLocation.lat, lng: userLocation.lng })
      return
    }
    if (!navigator.geolocation) { applyDest(null); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyDest({ id: 'my-location', name: 'Ma position', lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => applyDest(null),
    )
  }, [setRouteOrigin, setRouteDestination, setShowRoutePlanner, userLocation])

  // Démarrer la navigation vocale (vélo) bascule sur la carte, active le suivi
  // et lance le GPS — sans quoi les annonces automatiques ne partent jamais.
  const voiceNavActive = voiceNav.active
  const prevVoiceActiveRef = useRef(false)
  useEffect(() => {
    if (voiceNavActive && !prevVoiceActiveRef.current) {
      ensureWatching()
      // Réaction à un événement (front montant de l'activation vocale) : les setState
      // sont différés d'un micro-tick, comme ailleurs dans ce fichier, pour ne pas
      // déclencher de rendu en cascade synchrone depuis l'effet.
      void Promise.resolve().then(() => {
        setMapFollowMode(true)
        if (!isDesktop) setActiveTab('map')
      })
    }
    prevVoiceActiveRef.current = voiceNavActive
  }, [voiceNavActive, isDesktop, ensureWatching])

  const handleMapPlanClick = useCallback((latlng: { lat: number; lng: number }) => {
    if (mapPlanStep === 1) {
      setMapPlanOrigin({ id: 'map-origin', name: `Départ (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`, lat: latlng.lat, lng: latlng.lng })
      setMapPlanStep(2)
    } else if (mapPlanStep === 2) {
      const origin = mapPlanOrigin
      const dest = { id: 'map-dest', name: `Arrivée (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`, lat: latlng.lat, lng: latlng.lng }
      setRouteOrigin(origin); setRouteDestination(dest); setShowRoutePlanner(true); setShowPlannerForm(true)
      setMapPlanStep(0); setMapPlanOrigin(null); setActiveTab('route')
    }
  }, [mapPlanStep, mapPlanOrigin, setRouteOrigin, setRouteDestination, setShowRoutePlanner])

  const {
    containerRef: pullRef, pullY, isPulling: pullIsPulling, isTriggered: pullIsTriggered,
    onTouchStart: onPullTouchStart, onTouchMove: onPullTouchMove, onTouchEnd: onPullTouchEnd,
  } = usePullToRefresh(refresh)

  const [shareCopied, setShareCopied] = useState(false)

  const handleShareRoute = useCallback(async () => {
    if (!routeOrigin || !routeDestination) return
    const url = `${window.location.origin}${window.location.pathname}?from=${routeOrigin.lat},${routeOrigin.lng}&to=${routeDestination.lat},${routeDestination.lng}`
    if (navigator.share) {
      try { await navigator.share({ title: `Vélo'v : ${routeOrigin.name} → ${routeDestination.name}`, url }) } catch { /* dismissed */ }
    } else {
      await navigator.clipboard.writeText(url)
      setShareCopied(true); setTimeout(() => setShareCopied(false), 2500)
    }
  }, [routeOrigin, routeDestination])

  const handlePlanRouteFromStation = useCallback((station: Station) => {
    setRouteDestination({ id: `station-${station.id}`, name: station.name, lat: station.lat, lng: station.lng })
    setShowRoutePlanner(true); setMapSheetStation(null); setActiveTab('route')
  }, [setRouteDestination, setShowRoutePlanner])

  function dismissOnboarding() { setShowOnboarding(false); localStorage.setItem('velov-onboarded', '1') }

  async function handleConfirmNotif() {
    setShowNotifExplainer(false)
    const granted = await requestPermission()
    if (granted) pendingNotifActionRef.current?.()
    pendingNotifActionRef.current = null
  }

  const handleRecalculateFromPosition = () => {
    if (!userLocation) return
    const posOrigin = { id: 'my-location', name: 'Ma position', lat: userLocation.lat, lng: userLocation.lng }
    setRouteOrigin(posOrigin)
    void calculateRoute(() => {}, posOrigin)
  }

  const ageCls = dataAgeMs == null ? '' : dataAgeMs < 90000 ? styles.ageGood : dataAgeMs < 300000 ? styles.ageMed : styles.ageBad

  return (
    <div className={styles.shell}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Vélo'v</h1>
          <p className={styles.sub}>{stations.length > 0 ? `${stations.length} stations · ${availableBikes} vélos dispo` : 'Lyon — temps réel'}</p>
        </div>
        <div className={styles.headerActions}>
          <button onClick={refresh} className={styles.iconBtn} title="Actualiser" aria-label="Actualiser les données">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <SystemBanners isFromCache={isFromCache} />
      <FloatingNavBanner voiceNav={voiceNav} />
      <ProximityAlertBanner
        destination={destination}
        proximityEnabled={proximityEnabled}
        distanceToDest={distanceToDest}
        arrived={arrived}
        nearbyStations={nearbyStations}
        onDisable={handleDisableProximity}
      />

      {/* Tabs — sur desktop la carte est permanente, son onglet disparaît */}
      <div className={styles.tabs} role="tablist" aria-label="Vues Vélo'v">
        {(isDesktop ? TABS.filter((t) => t.id !== 'map') : TABS).map(({ id, Icon, label }) => (
          <button
            key={id}
            role="tab"
            id={`velov-tab-${id}`}
            aria-selected={activeTab === id}
            aria-controls={`velov-panel-${id}`}
            onClick={() => setActiveTab(id)}
            className={[styles.tab, activeTab === id ? styles.tabActive : ''].join(' ')}
          >
            <Icon size={18} /> {label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {/* ── STATIONS ── */}
        <div role="tabpanel" id="velov-panel-stations" aria-labelledby="velov-tab-stations" className={[styles.pane, activeTab !== 'stations' ? styles.hidden : ''].join(' ')}>
          <SearchFilter
            search={search} onSearchChange={setSearch}
            filter={filter} onFilterChange={setFilter}
            showFavoritesOnly={showFavoritesOnly} onToggleFavorites={() => setShowFavoritesOnly(!showFavoritesOnly)}
            favoritesCount={favorites.length}
            openOnly={openOnly} onOpenOnlyChange={setOpenOnly}
            minBikes={minBikes} onMinBikesChange={setMinBikes}
            maxDistance={maxDistance} onMaxDistanceChange={setMaxDistance}
            hasLocation={!!userLocation}
            sort={sort} onSortChange={setSort}
          />

          {favorites.length > 0 && !showFavoritesOnly && (
            <div className={styles.strip}>
              <div className={styles.stripInner}>
                <p className={[styles.stripTitle, styles.stripTitleFav].join(' ')}>★ Favoris</p>
                <div className={styles.stripRow}>
                  {stations.filter((s) => favorites.includes(s.id)).map((s) => (
                    <div key={s.id} className={styles.stripCard}>
                      <span className={[styles.stripStat, s.availableBikes > 0 ? styles.stripBikes : styles.stripEmpty].join(' ')}>
                        {s.availableBikes}<Bike size={14} />
                      </span>
                      <span className={[styles.stripStat, s.availableStands > 0 ? styles.stripStands : styles.stripEmpty].join(' ')}>
                        {s.availableStands}<ParkingSquare size={14} />
                      </span>
                      <p className={styles.stripName}>{s.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {userLocation && !search && filter === 'all' && !showFavoritesOnly && filteredStations.length > 3 && (
            <div className={styles.strip}>
              <div className={styles.stripInner}>
                <p className={[styles.stripTitle, styles.stripTitleNear].join(' ')}>Stations proches</p>
                <div className={styles.stripRow}>
                  {filteredStations.slice(0, 5).map((s) => (
                    <div key={s.id} className={styles.stripCard}>
                      <span className={[styles.stripStat, s.availableBikes > 0 ? styles.stripBikes : styles.stripEmpty].join(' ')}>
                        {s.availableBikes}<Bike size={14} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p className={styles.stripName}>{s.name}</p>
                        <p className={styles.stripMeta}>{s.distance?.toFixed(0)}m</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!userLocation && !search && filter === 'all' && !showFavoritesOnly && stations.length > 0 && (
            <div className={styles.locateWrap}>
              <div className={styles.locateCard}>
                <div style={{ minWidth: 0 }}>
                  <p className={styles.locateTitle}>Stations non triées</p>
                  <p className={styles.locateSub}>Activez la localisation pour voir les stations proches en premier</p>
                </div>
                <div className={styles.locateActions}>
                  <button onClick={startWatching} className={styles.locateBtn}><MapPin size={16} /> Localiser</button>
                </div>
              </div>
              {geoError && <p role="alert" className={styles.geoError}>📍 {geoError}</p>}
            </div>
          )}

          <div
            className={styles.scrollArea}
            ref={pullRef}
            onTouchStart={onPullTouchStart}
            onTouchMove={onPullTouchMove}
            onTouchEnd={onPullTouchEnd}
          >
            {pullIsPulling && (
              <div className={styles.pull} style={{ height: `${pullY}px` }}>
                <div className={[styles.pullText, pullIsTriggered ? styles.pullReady : ''].join(' ')}>
                  <span className={[styles.pullArrow, pullIsTriggered ? styles.pullArrowReady : ''].join(' ')}>↓</span>
                  {pullIsTriggered ? 'Relâcher pour actualiser' : 'Tirer pour actualiser'}
                </div>
              </div>
            )}
            <div className={styles.listWrap}>
              {loading && stations.length === 0 ? (
                <div className={styles.grid} aria-busy="true" aria-label="Chargement des stations">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className={styles.skelCard} />)}
                </div>
              ) : error ? (
                <div role="alert" className={styles.errorCard}>
                  <p className={styles.errorTitle}>Erreur de chargement</p>
                  <p className={styles.errorMsg}>{error}</p>
                  <button onClick={refresh} className={styles.locateBtn} style={{ marginTop: 12 }}>Réessayer</button>
                </div>
              ) : filteredStations.length === 0 ? null : (
                <>
                  {notifDenied && <div role="alert" className={styles.denied}>Notifications bloquées par le navigateur. Autorisez-les dans les paramètres.</div>}
                  <div className={styles.listHead}>
                    <p className={styles.listCount}>
                      {filteredStations.length} station{filteredStations.length > 1 ? 's' : ''}
                      {showFavoritesOnly && ` • ${favorites.length} favori${favorites.length > 1 ? 's' : ''}`}
                    </p>
                    {dataAgeMs !== null && (
                      <span className={[styles.age, ageCls].join(' ')}>
                        {Math.floor(dataAgeMs / 60000) < 1 ? 'À jour' : `${Math.floor(dataAgeMs / 60000)} min`}
                      </span>
                    )}
                  </div>
                  <div className={styles.grid}>
                    {filteredStations.slice(0, visibleCount).map((station) => (
                      <StationCard
                        key={station.id}
                        station={station}
                        distance={station.distance}
                        isAlerted={alertedStationIds.has(station.id)}
                        onToggleAlert={handleToggleAlert}
                        isFavorite={favorites.includes(station.id)}
                        onToggleFavorite={toggleFavorite}
                        alertThreshold={thresholds[station.id]}
                        onSetThreshold={setThreshold}
                      />
                    ))}
                  </div>
                  {filteredStations.length > visibleCount && (
                    <div ref={sentinelRef} className={styles.sentinel}><div className={styles.smallSpinner} /></div>
                  )}
                  <p className={styles.footerNote}>
                    Données ouvertes • Métropole de Lyon{lastUpdated && ` • ${timeAgo(lastUpdated)}`}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── MAP ── */}
        <div role="tabpanel" id="velov-panel-map" aria-labelledby="velov-tab-map" className={[styles.paneMap, activeTab !== 'map' ? styles.hidden : ''].join(' ')}>
          <Suspense fallback={<div className={styles.mapLoading}><div className={styles.bigSpinner} /> Chargement de la carte…</div>}>
            <StationMap
              stations={mapFilteredStations}
              userPosition={userLocation}
              userAccuracy={geoAccuracy}
              userHeading={geoHeading}
              navActive={walkNavStation != null || voiceNav.active || journeyPhase === 'biking'}
              followMode={mapFollowMode}
              onFollowModeOff={() => setMapFollowMode(false)}
              destination={journeyUnderway ? null : (routeDestination || destination)}
              journeyDestination={journeyUnderway ? routeDestination : null}
              routeGeometry={routeGeometry}
              walkToStartGeometry={walkToStart?.geometry ?? null}
              walkFromEndGeometry={walkFromEnd?.geometry ?? null}
              walkNavGeometry={trimmedWalkNavGeometry}
              stationsAlongRoute={routeGeometry ? stationsAlongRoute : []}
              recommendedStartStations={recommendedStartStations}
              recommendedEndStations={recommendedEndStations}
              onMapClick={
                mapPlanStep > 0 ? handleMapPlanClick
                : (mapSheetStation ? () => setMapSheetStation(null) : undefined)
              }
              onStationClick={mapPlanStep === 0 ? setMapSheetStation : undefined}
              planOrigin={mapPlanOrigin}
              dark={dark}
              fullHeight
              visible={activeTab === 'map' || isDesktop}
            />
          </Suspense>

          <StationBottomSheet
            station={mapSheetStation}
            onClose={() => setMapSheetStation(null)}
            distance={mapSheetStation && userLocation ? calculateDistance(userLocation.lat, userLocation.lng, mapSheetStation.lat, mapSheetStation.lng) : undefined}
            isFavorite={mapSheetStation ? favorites.includes(mapSheetStation.id) : false}
            onToggleFavorite={toggleFavorite}
            isAlerted={mapSheetStation ? alertedStationIds.has(mapSheetStation.id) : false}
            onToggleAlert={handleToggleAlert}
            onPlanRoute={handlePlanRouteFromStation}
            onWalkToStation={walkToStation}
            hasLocation={!!userLocation}
          />

          <div className={styles.overlayLeft}>
            {mapPlanStep === 1 && <div className={[styles.hint, styles.hintStart].join(' ')}>Appuyez pour choisir le <strong>point de départ</strong></div>}
            {mapPlanStep === 2 && <div className={[styles.hint, styles.hintEnd].join(' ')}>Appuyez pour choisir la <strong>destination</strong></div>}
            {mapPlanStep === 0 && (
                <div className={styles.mapFilters}>
                  {([
                    { value: 'all' as const, label: 'Tout', text: 'Tout' },
                    { value: 'bikes' as const, label: 'Vélos disponibles', Icon: Bike },
                    { value: 'stands' as const, label: 'Places disponibles', Icon: ParkingSquare },
                    ...(favorites.length > 0 ? [{ value: 'favorites' as const, label: 'Favoris', Icon: Star }] : []),
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setMapFilter(opt.value)}
                      aria-label={opt.label}
                      title={opt.label}
                      className={[styles.mapFilterBtn, mapFilter === opt.value ? styles.mapFilterActive : ''].join(' ')}
                    >
                      {opt.Icon ? <opt.Icon size={16} /> : opt.text}
                    </button>
                  ))}
                </div>
            )}
          </div>

          {journeyPhase === 'biking' && (
            <div className={styles.bottomBanner}>
              <div className={[styles.bottomInner, styles.bannerBike].join(' ')}>
                <Bike size={28} className={styles.bannerIcon} />
                <div className={styles.bannerMain}>
                  <p className={styles.bannerKicker}>Trajet en cours</p>
                  <p className={styles.bannerTitle}>
                    Descendez à <span className={endStationIsFallback ? styles.bannerAlt : styles.bannerAccent}>{endStationForJourney?.name ?? '…'}</span>
                    {endStationIsFallback && <span className={styles.bannerAlt}> (alt.)</span>}
                  </p>
                  {distToEndStation != null && (
                    <p className={styles.bannerSub}>
                      {distToEndStation < 1000 ? `${Math.round(distToEndStation)}m` : `${(distToEndStation / 1000).toFixed(1)}km`} restant{distToEndStation <= 100 ? ' — préparez-vous !' : ''}
                    </p>
                  )}
                </div>
                <span className={styles.bannerStands}>{endStationForJourney?.availableStands ?? '?'} <ParkingSquare size={14} /></span>
                <button onClick={cancelJourney} aria-label="Annuler le trajet" className={styles.bannerClose}><X size={16} /></button>
              </div>
            </div>
          )}

          {walkNavStation && (
            <WalkNavOverlay
              station={walkNavStation}
              route={walkNavRoute}
              loading={walkNavLoading}
              progress={walkNavProgress}
              distToStation={distToWalkNavStation}
              voiceNav={walkVoiceNav}
              onStop={stopWalkNav}
            />
          )}

          {deviated && routeGeometry && userLocation && !journeyUnderway && !walkNavStation && (
            <DeviationBanner
              floating
              countdown={autoRecalcCountdown}
              loading={routeLoading}
              onCancel={() => setAutoRecalcCountdown(null)}
              onRecalc={() => { setAutoRecalcCountdown(null); handleRecalculateFromPosition() }}
            />
          )}

          {journeyPhase === 'arrived' && (
            <div className={styles.bottomBanner}>
              <div className={[styles.bottomInner, styles.bannerArrived].join(' ')}>
                <span className={styles.bannerEmoji}>🎉</span>
                <div className={styles.bannerMain}>
                  <p className={styles.bannerTitle} style={{ color: 'var(--success)' }}>Vous êtes arrivé !</p>
                  {routeDestination?.name && <p className={styles.bannerSub}>{routeDestination.name}</p>}
                  {journeyElapsedMins != null && (
                    <p className={styles.bannerSub}>{journeyElapsedMins} min{routeInfo?.distanceFormatted && ` · ${routeInfo.distanceFormatted} à vélo`}</p>
                  )}
                </div>
                <button onClick={cancelJourney} className={styles.bannerDone}>Terminer</button>
              </div>
            </div>
          )}

          {!walkNavStation && routeProgress !== null && routeInfo && (
            <div className={styles.progressPill}>
              {routeProgress}% · {(() => { const rem = routeInfo.distance * (1 - routeProgress / 100); return rem < 1000 ? `${Math.round(rem)}m` : `${(rem / 1000).toFixed(1)}km` })()} restant
            </div>
          )}

          <div className={styles.overlayRight}>
            {userLocation && mapPlanStep === 0 && (
              <button onClick={() => setMapFollowMode((v) => !v)} className={[styles.mapBtn, mapFollowMode ? styles.mapBtnActive : ''].join(' ')}>
                <MapPin size={16} /> {mapFollowMode ? <>Suivi <Check size={14} /></> : 'Suivre'}
              </button>
            )}
            {mapPlanStep === 0 ? (
              <button onClick={() => setMapPlanStep(1)} className={styles.mapBtn}><MapIcon size={16} /> Planifier</button>
            ) : mapPlanStep > 0 && (
              <button onClick={() => { setMapPlanStep(0); setMapPlanOrigin(null) }} className={[styles.mapBtn, styles.mapBtnDanger].join(' ')}><X size={14} /> Annuler</button>
            )}
          </div>
        </div>

        {/* ── ROUTE ── */}
        <div role="tabpanel" id="velov-panel-route" aria-labelledby="velov-tab-route" className={[styles.paneScroll, activeTab !== 'route' ? styles.hidden : ''].join(' ')}>
          {customPlaces.length > 0 && (
            <div className={styles.routeTop}>
              <div className={styles.homeWrap}>
                <button onClick={() => setShowHomeMenu(!showHomeMenu)} className={styles.homeBtn}>
                  🏠 Rentrer {showHomeMenu ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showHomeMenu && (
                  <div className={styles.homeMenu}>
                    {customPlaces.map((place) => (
                      <button key={place.id} onClick={() => handleGoHome(place)} className={styles.homeMenuItem}>{place.name}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <CustomDestinationManager customPlaces={customPlaces} onChange={setCustomPlaces} />

          {showPlannerForm || !routeInfo ? (
            <RoutePlanner
              origin={routeOrigin}
              destination={routeDestination}
              onOriginChange={setRouteOrigin}
              onDestinationChange={setRouteDestination}
              onCalculate={() => void calculateRoute()}
              onClear={handleClearAll}
              currentPosition={userLocation}
              customPlaces={customPlaces}
              loading={routeLoading}
              error={routeError}
              searchHistory={searchHistory}
              onHistoryAdd={addToHistory}
              favoriteRoutes={favoriteRoutes}
              onFavoriteRemove={removeRoute}
              onFavoriteSelect={handleFavoriteSelect}
            />
          ) : (
            <div className={styles.summaryBar}>
              <div className={styles.summaryInner}>
                <span className={[styles.dot, styles.dotStart].join(' ')} aria-hidden="true" />
                <span className={styles.summaryText}>{routeOrigin?.name}</span>
                <span className={styles.summaryArrow}>→</span>
                <span className={[styles.dot, styles.dotEnd].join(' ')} aria-hidden="true" />
                <span className={styles.summaryText} style={{ flex: 1 }}>{routeDestination?.name}</span>
                <button onClick={() => setShowPlannerForm(true)} className={styles.summaryEdit}>Modifier</button>
                <button onClick={handleClearAll} aria-label="Effacer l'itinéraire" className={styles.summaryClear}><X size={14} /></button>
              </div>
            </div>
          )}

          {routeInfo && (
            <div ref={routeInfoRef}>
              <RouteInfoBanner
                route={routeInfo}
                origin={routeOrigin}
                destination={routeDestination}
                routeGeometry={routeGeometry}
                allRoutes={allRoutes}
                activeRouteIdx={activeRouteIdx}
                onSelectAlternative={selectAlternative}
                onViewOnMap={() => setActiveTab('map')}
              />
            </div>
          )}

          {(recommendedStartStations.length > 0 || recommendedEndStations.length > 0 || (routeOrigin && stations.length > 0)) && (
            <div className={styles.recoWrap}>
              <div className={styles.recoCard}>
                <div className={styles.recoGrid}>
                  <div className={[styles.recoBox, recommendedStartStations.length === 0 ? styles.recoBoxWarn : ''].join(' ')}>
                    <p className={[styles.recoLabel, styles.recoLabelStart].join(' ')}><Bike size={14} /> Départ</p>
                    {recommendedStartStations.length > 0 ? (
                      <>
                        <p className={styles.recoName}>{recommendedStartStations[0].name}</p>
                        <p className={styles.recoMeta}>
                          {recommendedStartStations[0].availableBikes} vélo{recommendedStartStations[0].availableBikes > 1 ? 's' : ''} · 🚶 {formatWalkTime(startWalkSecs)}
                        </p>
                      </>
                    ) : routeOrigin ? <p className={styles.recoWarnText}>⚠️ Aucun vélo à 500m</p> : <p className={styles.recoEmpty}>—</p>}
                  </div>
                  <div className={[styles.recoBox, recommendedEndStations.length === 0 ? styles.recoBoxWarn : ''].join(' ')}>
                    <p className={[styles.recoLabel, styles.recoLabelEnd].join(' ')}><ParkingSquare size={14} /> Arrivée</p>
                    {recommendedEndStations.length > 0 ? (
                      <>
                        <p className={styles.recoName}>{recommendedEndStations[0].name}</p>
                        <p className={styles.recoMeta}>
                          {recommendedEndStations[0].availableStands} place{recommendedEndStations[0].availableStands > 1 ? 's' : ''} · 🚶 {formatWalkTime(endWalkSecs)}
                        </p>
                      </>
                    ) : routeDestination ? <p className={styles.recoWarnText}>⚠️ Aucune place à 500m</p> : <p className={styles.recoEmpty}>—</p>}
                  </div>
                </div>

                {totalJourneyMins !== null && (
                  <div className={styles.journeyLine}>
                    <p className={styles.journeyTotal}>
                      🚶 {Math.round(startWalkSecs / 60)}min + 🚲 {routeInfo?.durationFormatted} + 🚶 {Math.round(endWalkSecs / 60)}min = <strong>{totalJourneyMins} min</strong>
                      {eta && <span style={{ opacity: 0.75 }}> · 🕐 {eta}</span>}
                    </p>
                    <button onClick={handleEnableRouteProximity} disabled={permission === 'denied'} className={styles.ctaGreen}>
                      {permission === 'default' && <Bell size={14} />} Activer l'alerte
                    </button>
                  </div>
                )}

                {totalJourneyMins === null && recommendedEndStations.length > 0 && (
                  <button onClick={handleEnableRouteProximity} disabled={permission === 'denied'} className={[styles.ctaGreen, styles.ctaFull].join(' ')}>
                    {permission === 'default' && <Bell size={14} />} Activer l'alerte d'arrivée
                  </button>
                )}

                {userLocation && routeInfo && recommendedStartStations.length > 0 && recommendedEndStations.length > 0 && journeyPhase === 'idle' && (
                  <>
                    {showOnboarding && (
                      <div className={styles.tip}>
                        <span style={{ flexShrink: 0 }}>💡</span>
                        <p className={styles.tipText}>Navigation voix complète : marche jusqu'à la station, trajet vélo, puis marche jusqu'à destination.</p>
                        <button onClick={dismissOnboarding} aria-label="Fermer" className={styles.tipClose}><X size={14} /></button>
                      </div>
                    )}
                    <button onClick={() => { dismissOnboarding(); void startJourney() }} className={styles.journeyCta}>
                      <Navigation size={16} /> Démarrer le trajet complet
                    </button>
                  </>
                )}

                {journeyPhase !== 'idle' && (
                  <div className={styles.journeyStatus}>
                    <p className={styles.journeyStatusText}>
                      {journeyPhase === 'walk-to-start' && '🚶 En route vers la station de départ…'}
                      {journeyPhase === 'biking' && `🚲 À vélo — descendez à ${endStationForJourney?.name ?? '…'}`}
                      {journeyPhase === 'walk-to-end' && '🚶 À pied jusqu\'à la destination…'}
                      {journeyPhase === 'arrived' && '✅ Vous êtes arrivé à destination !'}
                    </p>
                    <button onClick={cancelJourney} aria-label="Annuler le trajet" className={styles.journeyStatusClose}><X size={14} /></button>
                  </div>
                )}
              </div>
            </div>
          )}

          {routeInfo && routeOrigin && routeDestination && (
            <div className={styles.saveShare}>
              <button onClick={() => saveRoute(routeOrigin, routeDestination)} className={styles.saveBtn}><Star size={14} /> Sauvegarder</button>
              <button onClick={() => void handleShareRoute()} className={styles.shareBtn}>{shareCopied ? <><Check size={14} /> Lien copié !</> : '🔗 Partager'}</button>
            </div>
          )}

          {routeInfo?.steps && routeInfo.steps.length > 0 && (
            <NavigationPanel
              steps={routeInfo.steps}
              walkToStartSteps={walkToStart?.steps ?? undefined}
              walkFromEndSteps={walkFromEnd?.steps ?? undefined}
              routeProgress={routeProgress}
              voiceNav={voiceNav}
            />
          )}

          {deviated && routeGeometry && userLocation && !journeyUnderway && (
            <DeviationBanner
              countdown={autoRecalcCountdown}
              loading={routeLoading}
              onCancel={() => setAutoRecalcCountdown(null)}
              onRecalc={() => { setAutoRecalcCountdown(null); handleRecalculateFromPosition() }}
            />
          )}

          <div className={styles.spacer} />
        </div>
      </div>

      {showNotifExplainer && (
        <NotifExplainerModal
          onConfirm={() => void handleConfirmNotif()}
          onDismiss={() => { setShowNotifExplainer(false); pendingNotifActionRef.current = null }}
        />
      )}
    </div>
  )
}
