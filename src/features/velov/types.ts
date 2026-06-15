// Types partagés de la feature Velov.
// Velov reste sans backend (localStorage + APIs externes GBFS/OSRM/Valhalla).

/** Station Vélo'v telle que normalisée depuis le flux GBFS Grand Lyon. */
export interface Station {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  availableBikes: number
  availableStands: number
  capacity: number
  isRenting: boolean
  isReturning: boolean
  lastUpdated: Date
}

/** Station enrichie de sa distance à un itinéraire (en mètres). */
export interface StationAlongRoute extends Station {
  distanceToRoute: number
}

/** Coordonnée GeoJSON [lng, lat]. */
export type GeoCoord = [number, number]

export interface GeoLineString {
  type: 'LineString'
  coordinates: GeoCoord[]
}

export interface ManeuverType {
  type: string
  modifier?: string
  location?: GeoCoord
  exit?: number
}

export interface RouteStep {
  maneuver: ManeuverType
  name?: string
  distance?: number
  duration?: number
}

/** Itinéraire normalisé (OSRM ou Valhalla). */
export interface ParsedRoute {
  geometry: GeoLineString
  distance: number
  duration: number
  steps: RouteStep[]
}

/** Itinéraire principal accompagné de ses alternatives. */
export interface RouteWithAlternatives extends ParsedRoute {
  alternatives: ParsedRoute[]
}

/** Point d'origine ou de destination d'un trajet (lieu recherché ou station). */
export interface RoutePoint {
  id?: string
  lat: number
  lng: number
  name?: string
}

/** Lieu issu de la recherche d'adresse (historique). */
export interface SearchPlace {
  id: string
  name: string
  lat: number
  lng: number
}

/** Résumé d'itinéraire prêt pour l'affichage. */
export interface RouteInfo {
  distance: number
  duration: number
  distanceFormatted: string
  durationFormatted: string
  steps: RouteStep[]
}

/** Trajet favori enregistré (origine → destination). */
export interface FavoriteRoute {
  id: string
  origin: RoutePoint
  destination: RoutePoint
}

/** Station recommandée autour d'un point d'ancrage. */
export interface RecommendedStation extends Station {
  distance: number
  walkTime: number
}

/** Position GPS de l'utilisateur. */
export interface UserPosition {
  lat: number
  lng: number
}

/** Émetteur de notification injecté (implémenté par le hook plateforme, lot 3). */
export type NotificationSender = (title: string, options?: NotificationOptions) => void

/** Surface du hook useVoiceNavigation consommée par les composants de navigation. */
export interface VoiceNavApi {
  supported: boolean
  active: boolean
  currentStep: number
  startNavigation: () => void
  stopNavigation: () => void
  next: () => void
  prev: () => void
  repeatCurrent: () => void
  currentStepData: RouteStep | null
  nextStepData: RouteStep | null
  totalSteps: number
  distToNextManeuver: number | null
  frenchVoiceMissing: boolean
}

/** Trajet persisté en localStorage (cf. routeStorage). */
export interface StoredRoute {
  origin: RoutePoint
  destination: RoutePoint
  routeGeometry: GeoLineString
  routeInfo: RouteInfo | null
  allRoutes: ParsedRoute[]
  savedAt: number
}
