import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchWalkRoute } from '../route'
import { calculateDistance } from '../geo'
import type { GeoLineString, RoutePoint, Station, UserPosition, VoiceNavApi } from '../types'
import { useRouteProgress } from './useRouteProgress'
import { useVoiceNavigation } from './useVoiceNavigation'
import { useRouteDeviation } from './useRouteDeviation'

// Machine à états du trajet complet marche → vélo → marche, extraite de VelovPage.
// Déplacement à l'identique : mêmes effets, mêmes seuils, mêmes notifications.

export type JourneyPhase = 'idle' | 'walk-to-start' | 'biking' | 'walk-to-end' | 'arrived'
export type WalkTarget = Station | RoutePoint

// Seuils de proximité (mètres).
const ARRIVAL_RADIUS = 50      // station/destination atteinte
const DROP_BIKE_RADIUS = 100   // approche station d'arrivée à vélo
const WALK_ANNOUNCE_FAR = 300  // 1re annonce vocale d'approche
const WALK_ANNOUNCE_NEAR = 80  // 2e annonce vocale d'approche

interface SavedJourney { phase: JourneyPhase; walkNavStation: WalkTarget | null }
const _savedJourney: SavedJourney | null = (() => {
  try { return JSON.parse(sessionStorage.getItem('velov-journey') ?? 'null') as SavedJourney | null } catch { return null }
})()

function trimWalkGeometry(geometry: GeoLineString | null, userPos: { lat: number; lng: number } | null): GeoLineString | null {
  if (!geometry?.coordinates?.length || !userPos) return geometry
  const coords = geometry.coordinates
  let minDist = Infinity, minIdx = 0
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i]
    const d = calculateDistance(userPos.lat, userPos.lng, lat, lng)
    if (d < minDist) { minDist = d; minIdx = i }
    if (d < 15) break
  }
  const sliced = coords.slice(minIdx)
  return sliced.length < 2 ? null : { ...geometry, coordinates: sliced }
}

export interface UseJourneyParams {
  userLocation: UserPosition | null
  stations: Station[]
  recommendedStartStations: Station[]
  recommendedEndStations: Station[]
  routeDestination: RoutePoint | null
  sendNotification: (title: string, options?: NotificationOptions) => void
  ensureWatching: () => void
  startWatching: () => void
  setMapFollowMode: (v: boolean) => void
  setActiveTab: (t: 'stations' | 'map' | 'route') => void
  isDesktop: boolean
  setMapSheetStation: (s: Station | null) => void
  voiceNav: VoiceNavApi
}

export function useJourney({
  userLocation, stations, recommendedStartStations, recommendedEndStations, routeDestination,
  sendNotification, ensureWatching, startWatching, setMapFollowMode, setActiveTab, isDesktop,
  setMapSheetStation, voiceNav,
}: UseJourneyParams) {
  const [walkNavStation, setWalkNavStation] = useState<WalkTarget | null>(_savedJourney?.walkNavStation ?? null)
  const [walkNavRoute, setWalkNavRoute] = useState<Awaited<ReturnType<typeof fetchWalkRoute>>>(null)
  const [walkNavLoading, setWalkNavLoading] = useState(false)
  const [journeyPhase, setJourneyPhase] = useState<JourneyPhase>(_savedJourney?.phase ?? 'idle')
  const [journeyStartTime, setJourneyStartTime] = useState<number | null>(null)
  const [journeyElapsedMins, setJourneyElapsedMins] = useState<number | null>(null)
  const journeyRestoredRef = useRef(_savedJourney != null && _savedJourney.phase !== 'idle')

  const walkNavProgress = useRouteProgress({ routeGeometry: walkNavRoute?.geometry ?? null, userPosition: userLocation })
  const walkVoiceNav = useVoiceNavigation({ steps: walkNavRoute?.steps ?? null, userPosition: userLocation })
  const walkVoiceActive = walkVoiceNav.active
  const walkVoiceSpeakFn = walkVoiceNav.speak
  const { deviated: walkDeviated } = useRouteDeviation({ routeGeometry: walkNavRoute?.geometry ?? null, userPosition: userLocation })

  const journeyUnderway = journeyPhase === 'biking' || journeyPhase === 'walk-to-end'

  const distToWalkNavStation = walkNavStation && userLocation
    ? calculateDistance(userLocation.lat, userLocation.lng, walkNavStation.lat, walkNavStation.lng) : null
  const walkNavStationName = walkNavStation?.name ?? ''
  const endStationForJourney = recommendedEndStations.find((s) => s.availableStands > 0) ?? recommendedEndStations[0] ?? null
  const endStationIsFallback = recommendedEndStations.length > 0 && endStationForJourney?.id !== recommendedEndStations[0]?.id
  const distToEndStation = journeyPhase === 'biking' && endStationForJourney && userLocation
    ? calculateDistance(userLocation.lat, userLocation.lng, endStationForJourney.lat, endStationForJourney.lng) : null
  const trimmedWalkNavGeometry = useMemo(
    () => trimWalkGeometry(walkNavRoute?.geometry ?? null, userLocation),
    [walkNavRoute, userLocation],
  )
  const liveWalkStationBikes = useMemo(() => {
    if (journeyPhase !== 'walk-to-start' || !walkNavStation) return null
    return stations.find((s) => s.id === walkNavStation.id)?.availableBikes ?? null
  }, [journeyPhase, walkNavStation, stations])
  const walkApproachAnnouncedRef = useRef({ t300: false, t80: false })
  const startStationEmptyNotifiedRef = useRef(false)

  useEffect(() => {
    if (distToWalkNavStation === null || distToWalkNavStation > ARRIVAL_RADIUS) return
    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
    if (journeyPhase === 'walk-to-start') {
      sendNotification('Prenez un vélo !', { body: `Station ${walkNavStationName} atteinte — votre trajet à vélo commence.`, tag: 'velov-journey' })
      void Promise.resolve().then(() => { setJourneyPhase('biking'); setWalkNavStation(null); setWalkNavRoute(null) })
    } else if (journeyPhase === 'walk-to-end') {
      sendNotification('Vous êtes arrivé !', { body: 'Vous avez atteint votre destination. Bravo !', tag: 'velov-journey' })
      void Promise.resolve().then(() => {
        setJourneyPhase('arrived')
        setJourneyElapsedMins(journeyStartTime ? Math.round((Date.now() - journeyStartTime) / 60000) : null)
        setWalkNavStation(null); setWalkNavRoute(null)
      })
    } else {
      sendNotification('Vous êtes arrivé !', { body: `Station ${walkNavStationName} à portée.`, tag: 'velov-walk' })
      void Promise.resolve().then(() => { setWalkNavStation(null); setWalkNavRoute(null) })
    }
  }, [distToWalkNavStation, walkNavStationName, sendNotification, journeyPhase, journeyStartTime])

  useEffect(() => {
    if (!walkNavStation) return
    walkApproachAnnouncedRef.current = { t300: false, t80: false }
    startStationEmptyNotifiedRef.current = false
    void Promise.resolve().then(() => setMapFollowMode(true))
  }, [walkNavStation, setMapFollowMode])

  useEffect(() => {
    if (journeyPhase !== 'biking' || distToEndStation === null || distToEndStation > DROP_BIKE_RADIUS) return
    const station = endStationForJourney
    const dest = routeDestination
    const pos = userLocation
    if (!station || !dest || !pos) return
    let cancelled = false
    sendNotification('Déposez le vélo', { body: `Station ${station.name} à portée — continuez à pied.`, tag: 'velov-journey' })
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
    void Promise.resolve().then(() => {
      if (cancelled) return
      setJourneyPhase('walk-to-end'); setWalkNavStation(dest); setWalkNavRoute(null); setWalkNavLoading(true)
    })
    fetchWalkRoute(pos.lat, pos.lng, dest.lat, dest.lng)
      .then((route) => { if (!cancelled) setWalkNavRoute(route) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setWalkNavLoading(false) })
    return () => { cancelled = true }
  }, [journeyPhase, distToEndStation, endStationForJourney, routeDestination, userLocation, sendNotification])

  useEffect(() => {
    if (journeyPhase === 'idle') sessionStorage.removeItem('velov-journey')
    else sessionStorage.setItem('velov-journey', JSON.stringify({ phase: journeyPhase, walkNavStation }))
  }, [journeyPhase, walkNavStation])

  useEffect(() => {
    if (journeyPhase !== 'arrived') return
    const timer = setTimeout(() => {
      setJourneyPhase('idle'); setJourneyStartTime(null); setJourneyElapsedMins(null); setWalkNavStation(null); setWalkNavRoute(null)
    }, 8000)
    return () => clearTimeout(timer)
  }, [journeyPhase])

  useEffect(() => {
    if (journeyRestoredRef.current) startWatching()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!journeyRestoredRef.current || !walkNavStation || !userLocation) return
    if (journeyPhase !== 'walk-to-start' && journeyPhase !== 'walk-to-end') return
    journeyRestoredRef.current = false
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) setWalkNavLoading(true) })
    fetchWalkRoute(userLocation.lat, userLocation.lng, walkNavStation.lat, walkNavStation.lng)
      .then((route) => { if (!cancelled) setWalkNavRoute(route) })
      .catch(() => {})
      .finally(() => { if (!cancelled) void Promise.resolve().then(() => setWalkNavLoading(false)) })
    return () => { cancelled = true }
  }, [journeyPhase, walkNavStation, userLocation])

  useEffect(() => {
    if (!walkDeviated || !walkNavStation || !userLocation) return
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      fetchWalkRoute(userLocation.lat, userLocation.lng, walkNavStation.lat, walkNavStation.lng)
        .then((route) => { if (!cancelled && route) setWalkNavRoute(route) })
        .catch(() => {})
    }, 5000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [walkDeviated, walkNavStation, userLocation])

  useEffect(() => {
    if (!walkVoiceActive || distToWalkNavStation === null || !walkNavStation) return
    const isStation = (walkNavStation as Station).availableBikes != null
    const label = isStation ? `station ${walkNavStation.name}` : (walkNavStation.name ?? 'destination')
    if (distToWalkNavStation <= WALK_ANNOUNCE_NEAR && !walkApproachAnnouncedRef.current.t80) {
      walkApproachAnnouncedRef.current.t80 = true
      const dist = Math.round(distToWalkNavStation / 10) * 10
      walkVoiceSpeakFn(`${label.charAt(0).toUpperCase()}${label.slice(1)} dans ${dist} mètres.`)
    } else if (distToWalkNavStation <= WALK_ANNOUNCE_FAR && !walkApproachAnnouncedRef.current.t300) {
      walkApproachAnnouncedRef.current.t300 = true
      const dist = Math.round(distToWalkNavStation / 25) * 25
      walkVoiceSpeakFn(`Dans ${dist} mètres, ${label}.`)
    }
  }, [walkVoiceActive, distToWalkNavStation, walkNavStation, walkVoiceSpeakFn])

  useEffect(() => {
    if (liveWalkStationBikes === null || liveWalkStationBikes > 0 || !walkNavStation || !userLocation) return
    if (startStationEmptyNotifiedRef.current) return
    const nextStation = recommendedStartStations.find((s) => s.id !== walkNavStation.id && s.availableBikes > 0)
    startStationEmptyNotifiedRef.current = true
    if (!nextStation) {
      sendNotification('Plus de vélos !', { body: `La station ${walkNavStation.name} est vide. Aucune alternative proche.`, tag: 'velov-redirect' })
      return
    }
    sendNotification('Station vide', { body: `Redirection vers ${nextStation.name}.`, tag: 'velov-redirect' })
    const pos = { lat: userLocation.lat, lng: userLocation.lng }
    const newStation = { ...nextStation }
    void Promise.resolve().then(() => {
      setWalkNavStation(newStation); setWalkNavRoute(null); setWalkNavLoading(true)
      fetchWalkRoute(pos.lat, pos.lng, newStation.lat, newStation.lng)
        .then((route) => { if (route) setWalkNavRoute(route) })
        .catch(() => {})
        .finally(() => setWalkNavLoading(false))
    })
  }, [liveWalkStationBikes, walkNavStation, recommendedStartStations, userLocation, sendNotification])

  async function startJourney() {
    if (!userLocation || !recommendedStartStations[0]) return
    const startStation = recommendedStartStations[0]
    setJourneyPhase('walk-to-start'); setJourneyStartTime(Date.now()); setWalkNavStation(startStation); setWalkNavRoute(null)
    walkVoiceNav.startNavigation(); setWalkNavLoading(true); setMapSheetStation(null)
    if (!isDesktop) setActiveTab('map')
    setMapFollowMode(true); ensureWatching()
    try { setWalkNavRoute(await fetchWalkRoute(userLocation.lat, userLocation.lng, startStation.lat, startStation.lng)) }
    catch { /* route unavailable */ } finally { setWalkNavLoading(false) }
  }

  function cancelJourney() {
    setJourneyPhase('idle'); setJourneyStartTime(null); setJourneyElapsedMins(null); setWalkNavStation(null); setWalkNavRoute(null)
    walkVoiceNav.stopNavigation(); voiceNav.stopNavigation()
  }

  async function walkToStation(station: Station) {
    if (!userLocation) return
    setWalkNavStation(station); setWalkNavRoute(null); setWalkNavLoading(true); setMapSheetStation(null)
    if (!isDesktop) setActiveTab('map')
    ensureWatching()
    try { setWalkNavRoute(await fetchWalkRoute(userLocation.lat, userLocation.lng, station.lat, station.lng)) }
    finally { setWalkNavLoading(false) }
  }

  function stopWalkNav() {
    walkVoiceNav.stopNavigation(); setWalkNavStation(null); setWalkNavRoute(null); setJourneyPhase('idle')
  }

  return {
    journeyPhase, journeyUnderway,
    walkNavStation, walkNavRoute, walkNavLoading, walkNavProgress, walkVoiceNav,
    trimmedWalkNavGeometry, distToWalkNavStation,
    endStationForJourney, endStationIsFallback, distToEndStation, journeyElapsedMins,
    startJourney, cancelJourney, walkToStation, stopWalkNav,
  }
}
