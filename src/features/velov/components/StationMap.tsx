import { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMapEvents, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import type { LatLngExpression } from 'leaflet'
import type {
  GeoLineString, RecommendedStation, RoutePoint, Station, StationAlongRoute, UserPosition,
} from '../types'
import styles from './StationMap.module.css'

// Couleurs des tracés (Leaflet exige des chaînes, pas de CSS vars)
const COLOR_ROUTE = '#E07B54'   // accent — itinéraire vélo
const COLOR_WALK = '#f97316'    // marche
const COLOR_WALKNAV = '#0d9488' // navigation à pied active
const COLOR_USER = '#3D80B8'    // info — position

function MapResizer({ visible }: { visible: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => map.invalidateSize(), 150)
      return () => clearTimeout(t)
    }
  }, [visible, map])
  return null
}

function MapClickHandler({ onClick }: { onClick?: (latlng: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) { onClick?.(e.latlng) },
  })
  return null
}

function MapCenterUpdater({ position, visible }: { position: UserPosition | null; visible: boolean }) {
  const map = useMap()
  const centeredRef = useRef(false)
  useEffect(() => {
    if (!position || centeredRef.current || !visible) return
    if (!isFinite(position.lat) || !isFinite(position.lng)) return
    const t = setTimeout(() => {
      map.flyTo([position.lat, position.lng], 15, { animate: true, duration: 1 })
      centeredRef.current = true
    }, 200)
    return () => clearTimeout(t)
  }, [position, map, visible])
  return null
}

function MapFollower({ userPosition, followMode, navActive = false, onFollowModeOff }: {
  userPosition: UserPosition | null; followMode: boolean; navActive?: boolean; onFollowModeOff?: () => void
}) {
  const map = useMap()
  useMapEvents({
    dragstart() { if (followMode) onFollowModeOff?.() },
  })
  useEffect(() => {
    if (!followMode || !userPosition) return
    if (!isFinite(userPosition.lat) || !isFinite(userPosition.lng)) return
    // En navigation active, garantit un zoom lisible (rues visibles).
    if (navActive && map.getZoom() < 16) {
      map.setView([userPosition.lat, userPosition.lng], 16, { animate: true })
    } else {
      map.panTo([userPosition.lat, userPosition.lng], { animate: true, duration: 0.5 })
    }
  }, [followMode, userPosition, navActive, map])
  return null
}

function MapFocusSetter({ focusPosition }: { focusPosition: UserPosition | null }) {
  const map = useMap()
  const prevRef = useRef<UserPosition | null>(null)
  useEffect(() => {
    if (!focusPosition || focusPosition === prevRef.current) return
    if (!isFinite(focusPosition.lat) || !isFinite(focusPosition.lng)) return
    prevRef.current = focusPosition
    map.flyTo([focusPosition.lat, focusPosition.lng], 17, { animate: true, duration: 1 })
  }, [focusPosition, map])
  return null
}

function MapRouteFitter({ routeGeometry }: { routeGeometry?: GeoLineString | null }) {
  const map = useMap()
  const prevRouteRef = useRef<GeoLineString | null>(null)
  useEffect(() => {
    if (!routeGeometry?.coordinates?.length) return
    if (routeGeometry === prevRouteRef.current) return
    prevRouteRef.current = routeGeometry
    const bounds = routeGeometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])
    map.fitBounds(bounds, { padding: [40, 40], animate: true })
  }, [routeGeometry, map])
  return null
}

function makeClusterIcon(count: number, hasBikes: boolean) {
  const bg = hasBikes ? '#4F7D3A' : '#C0392B'
  return new L.DivIcon({
    className: '',
    html: `<div style="background:${bg};color:#fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">${count}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

interface ClusterCell { lat: number; lng: number; count: number; bikes: number }

function BoundedStations({ stations, onStationClick }: {
  stations: Station[]
  onStationClick?: (s: Station) => void
}) {
  const map = useMap()
  const stationsRef = useRef(stations)
  const [visible, setVisible] = useState<Station[]>([])
  const [zoom, setZoom] = useState(map.getZoom())

  useEffect(() => { stationsRef.current = stations })

  const computeVisible = useCallback(() => {
    const bounds = map.getBounds().pad(0.2)
    return stationsRef.current
      .filter((s) => s.lat && s.lng && bounds.contains([s.lat, s.lng]))
      .slice(0, 60)
  }, [map])

  useMapEvents({
    moveend: () => { setVisible(computeVisible()); setZoom(map.getZoom()) },
    zoomend: () => { setVisible(computeVisible()); setZoom(map.getZoom()) },
  })

  useEffect(() => {
    const timer = setTimeout(() => { setVisible(computeVisible()); setZoom(map.getZoom()) }, 0)
    return () => clearTimeout(timer)
  }, [stations, computeVisible, map])

  if (zoom < 14) {
    const precision = zoom < 12 ? 100 : 1000
    const grid = new Map<string, ClusterCell>()
    for (const s of visible) {
      const gridLat = Math.round(s.lat * precision) / precision
      const gridLng = Math.round(s.lng * precision) / precision
      const key = `${gridLat},${gridLng}`
      let cell = grid.get(key)
      if (!cell) { cell = { lat: 0, lng: 0, count: 0, bikes: 0 }; grid.set(key, cell) }
      cell.lat += s.lat
      cell.lng += s.lng
      cell.count++
      cell.bikes += s.availableBikes
    }
    return (
      <>
        {[...grid.entries()].map(([key, cell]) => (
          <Marker
            key={key}
            position={[cell.lat / cell.count, cell.lng / cell.count]}
            icon={makeClusterIcon(cell.count, cell.bikes > 0)}
          >
            <Popup>
              <div className={styles.popup}>
                <strong>{cell.count} station{cell.count > 1 ? 's' : ''}</strong><br />
                {cell.bikes} vélo{cell.bikes > 1 ? 's' : ''} disponible{cell.bikes > 1 ? 's' : ''}
              </div>
            </Popup>
          </Marker>
        ))}
      </>
    )
  }

  return (
    <>
      {visible.map((station) => (
        <Marker
          key={station.id}
          position={[station.lat, station.lng]}
          icon={pickStationIcon(station)}
          eventHandlers={onStationClick ? { click: () => onStationClick(station) } : undefined}
        >
          {!onStationClick && (
            <Popup>
              <div className={styles.popup}>
                <strong>{station.name}</strong><br />
                Vélos: {station.availableBikes} / Places: {station.availableStands}
              </div>
            </Popup>
          )}
        </Marker>
      ))}
    </>
  )
}

const CDN = 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img'
const SHADOW = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'

function colorIcon(name: string, big = false): L.Icon {
  return new L.Icon({
    iconUrl: `${CDN}/${name}.png`,
    shadowUrl: SHADOW,
    iconSize: big ? [35, 51] : [25, 41],
    iconAnchor: big ? [17, 51] : [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  })
}

const bikeIcon = colorIcon('marker-icon-green')
const lowIcon = colorIcon('marker-icon-orange')
const emptyIcon = colorIcon('marker-icon-red')
const userIcon = colorIcon('marker-icon-blue')

// Flèche orientée selon le cap GPS (uniquement en mouvement).
function headingIcon(heading: number): L.DivIcon {
  return new L.DivIcon({
    className: '',
    html: `<div style="transform:rotate(${Math.round(heading)}deg);width:34px;height:34px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.4))"><svg viewBox="0 0 34 34" width="34" height="34"><path d="M17 2 L24.5 16 A8.6 8.6 0 1 1 9.5 16 Z" fill="${COLOR_USER}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 19],
  })
}

// Couleur d'occupation : vide (rouge), peu de vélos 1-2 (orange), dispo (vert).
function pickStationIcon(s: Station): L.Icon {
  if (s.availableBikes === 0) return emptyIcon
  if (s.availableBikes <= 2) return lowIcon
  return bikeIcon
}
const destIcon = colorIcon('marker-icon-2x-red')
const recommendedStartIcon = colorIcon('marker-icon-2x-green', true)
const recommendedEndIcon = colorIcon('marker-icon-2x-blue', true)

const finishIcon = new L.DivIcon({
  className: '',
  html: '<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))">🏁</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 28],
  popupAnchor: [0, -30],
})

export interface StationMapProps {
  stations: Station[]
  userPosition: UserPosition | null
  userAccuracy?: number | null
  userHeading?: number | null
  userIsManual?: boolean
  navActive?: boolean
  followMode?: boolean
  onFollowModeOff?: () => void
  destination?: RoutePoint | null
  journeyDestination?: RoutePoint | null
  routeGeometry?: GeoLineString | null
  walkToStartGeometry?: GeoLineString | null
  walkFromEndGeometry?: GeoLineString | null
  walkNavGeometry?: GeoLineString | null
  stationsAlongRoute?: StationAlongRoute[]
  recommendedStartStations?: RecommendedStation[]
  recommendedEndStations?: RecommendedStation[]
  onMapClick?: (latlng: { lat: number; lng: number }) => void
  onStationClick?: (s: Station) => void
  planOrigin?: RoutePoint | null
  focusPosition?: UserPosition | null
  dark?: boolean
  fullHeight?: boolean
  visible?: boolean
}

export function StationMap({
  stations, userPosition, userAccuracy, userHeading = null, userIsManual = false,
  navActive = false, followMode = false, onFollowModeOff,
  destination, journeyDestination = null, routeGeometry,
  walkToStartGeometry, walkFromEndGeometry, walkNavGeometry = null,
  stationsAlongRoute = [], recommendedStartStations = [], recommendedEndStations = [],
  onMapClick, onStationClick, planOrigin = null, focusPosition = null,
  dark = false, fullHeight = false, visible = true,
}: StationMapProps) {
  const toLatLng = (g?: GeoLineString | null) =>
    g?.coordinates?.map(([lng, lat]) => [lat, lng] as [number, number])

  const routeCoords = toLatLng(routeGeometry)
  const walkToStartCoords = toLatLng(walkToStartGeometry)
  const walkFromEndCoords = toLatLng(walkFromEndGeometry)
  const walkNavCoords = toLatLng(walkNavGeometry)

  const center: LatLngExpression = userPosition
    ? [userPosition.lat, userPosition.lng]
    : [45.7640, 4.8357]
  const tileUrl = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const tileAttrib = dark
    ? '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'

  const alongIds = new Set(stationsAlongRoute.map((s) => s.id))
  const recIds = new Set([
    ...recommendedStartStations.map((s) => s.id),
    ...recommendedEndStations.map((s) => s.id),
  ])
  const otherStations = stations.filter((s) => !alongIds.has(s.id) && !recIds.has(s.id))

  const gpsCls = userAccuracy == null ? ''
    : userAccuracy <= 20 ? styles.gpsGood
    : userAccuracy <= 50 ? styles.gpsMed : styles.gpsBad
  const gpsDot = userAccuracy == null ? ''
    : userAccuracy <= 20 ? styles.dotGood
    : userAccuracy <= 50 ? styles.dotMed : styles.dotBad

  return (
    <div className={[styles.wrap, fullHeight ? styles.wrapFull : styles.wrapBoxed].join(' ')}>
      <MapContainer center={center} zoom={13} scrollWheelZoom className={styles.map}>
        <MapResizer visible={visible} />
        <TileLayer attribution={tileAttrib} url={tileUrl} />
        <MapClickHandler onClick={onMapClick} />
        <MapCenterUpdater position={userPosition} visible={visible} />
        <MapRouteFitter routeGeometry={routeGeometry} />
        <MapFollower userPosition={userPosition} followMode={followMode} navActive={navActive} onFollowModeOff={onFollowModeOff} />
        <MapFocusSetter focusPosition={focusPosition} />

        {walkNavCoords && walkNavCoords.length > 1 && (
          <Polyline positions={walkNavCoords} pathOptions={{ color: COLOR_WALKNAV, weight: 5, opacity: 0.9 }} />
        )}
        {walkToStartCoords && walkToStartCoords.length > 1 && (
          <Polyline positions={walkToStartCoords} pathOptions={{ color: COLOR_WALK, weight: 4, opacity: 0.85, dashArray: '6, 8' }} />
        )}
        {routeCoords && routeCoords.length > 1 && (
          <Polyline positions={routeCoords} pathOptions={{ color: COLOR_ROUTE, weight: 5, opacity: 0.85, dashArray: '10, 6' }} />
        )}
        {walkFromEndCoords && walkFromEndCoords.length > 1 && (
          <Polyline positions={walkFromEndCoords} pathOptions={{ color: COLOR_WALK, weight: 4, opacity: 0.85, dashArray: '6, 8' }} />
        )}

        {userPosition && (
          <>
            <Marker
              position={[userPosition.lat, userPosition.lng]}
              icon={userHeading != null ? headingIcon(userHeading) : userIcon}
            >
              <Popup>{userIsManual ? 'Position définie manuellement' : 'Vous êtes ici'}</Popup>
            </Marker>
            {!userIsManual && (
              <Circle
                center={[userPosition.lat, userPosition.lng]}
                radius={userAccuracy ?? 200}
                pathOptions={{ color: COLOR_USER, fillColor: COLOR_USER, fillOpacity: 0.08 }}
              />
            )}
          </>
        )}

        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={destIcon}>
            <Popup>Destination: {destination.name}</Popup>
          </Marker>
        )}

        {journeyDestination && (
          <Marker position={[journeyDestination.lat, journeyDestination.lng]} icon={finishIcon}>
            <Popup>🏁 {journeyDestination.name}</Popup>
          </Marker>
        )}

        {planOrigin && (
          <Marker position={[planOrigin.lat, planOrigin.lng]} icon={bikeIcon}>
            <Popup>Départ sélectionné</Popup>
          </Marker>
        )}

        {stationsAlongRoute.map((station) => (
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            icon={pickStationIcon(station)}
            eventHandlers={onStationClick ? { click: () => onStationClick(station) } : undefined}
          >
            {!onStationClick && (
              <Popup>
                <div className={styles.popup}>
                  <strong>{station.name}</strong><br />
                  Vélos: {station.availableBikes} / Places: {station.availableStands}<br />
                  <span className={styles.popupHint}>Proche itinéraire ({station.distanceToRoute.toFixed(0)}m)</span>
                </div>
              </Popup>
            )}
          </Marker>
        ))}

        {recommendedStartStations.map((station) => (
          <Marker
            key={`start-${station.id}`}
            position={[station.lat, station.lng]}
            icon={recommendedStartIcon}
            eventHandlers={onStationClick ? { click: () => onStationClick(station) } : undefined}
          >
            {!onStationClick && (
              <Popup>
                <div className={styles.popup}>
                  <strong>🚲 Départ: {station.name}</strong><br />
                  Vélos: {station.availableBikes} • {station.distance?.toFixed(0)}m du départ
                </div>
              </Popup>
            )}
          </Marker>
        ))}

        {recommendedEndStations.map((station) => (
          <Marker
            key={`end-${station.id}`}
            position={[station.lat, station.lng]}
            icon={recommendedEndIcon}
            eventHandlers={onStationClick ? { click: () => onStationClick(station) } : undefined}
          >
            {!onStationClick && (
              <Popup>
                <div className={styles.popup}>
                  <strong>🅿️ Arrivée: {station.name}</strong><br />
                  Places: {station.availableStands} • {station.distance?.toFixed(0)}m de l'arrivée
                </div>
              </Popup>
            )}
          </Marker>
        ))}

        <BoundedStations stations={otherStations} onStationClick={onStationClick} />
      </MapContainer>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={[styles.legendDot, styles.dotBikes].join(' ')} />Vélos dispo
        </div>
        <div className={styles.legendItem}>
          <span className={[styles.legendDot, styles.dotLow].join(' ')} />Peu de vélos
        </div>
        <div className={styles.legendItem}>
          <span className={[styles.legendDot, styles.dotEmpty].join(' ')} />Station vide
        </div>
        {userPosition && (
          <div className={styles.legendItem}>
            <span className={[styles.legendDot, styles.dotUser].join(' ')} />Ma position
          </div>
        )}
        {userIsManual ? (
          <div className={styles.legendItem}>📌 Position manuelle</div>
        ) : userAccuracy != null && (
          <div className={[styles.legendItem, gpsCls].join(' ')}>
            <span className={[styles.legendDot, gpsDot].join(' ')} />
            GPS ±{userAccuracy}m
          </div>
        )}
      </div>
    </div>
  )
}
