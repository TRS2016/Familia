import { useState, useRef } from 'react'
import { Search, X, Pencil } from 'lucide-react'
import { searchAddress, type AddressFeature } from '../api'
import type { SearchPlace } from '../types'
import ui from './velovUi.module.css'
import styles from './CustomDestinationManager.module.css'

const STORAGE_KEY = 'velov-custom-places'
const LYON_BOUNDS = { minLat: 45.70, maxLat: 45.80, minLng: 4.75, maxLng: 4.95 }

function isValidCoordinate(lat: string, lng: string): boolean {
  const latNum = parseFloat(lat)
  const lngNum = parseFloat(lng)
  return (
    !isNaN(latNum) && !isNaN(lngNum) &&
    latNum >= LYON_BOUNDS.minLat && latNum <= LYON_BOUNDS.maxLat &&
    lngNum >= LYON_BOUNDS.minLng && lngNum <= LYON_BOUNDS.maxLng
  )
}

function saveCustomDestinations(destinations: SearchPlace[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(destinations))
}

export interface CustomDestinationManagerProps {
  customPlaces: SearchPlace[]
  onChange: (places: SearchPlace[]) => void
}

export function CustomDestinationManager({ customPlaces, onChange }: CustomDestinationManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [nameError, setNameError] = useState('')
  const [coordError, setCoordError] = useState('')
  const [addressQuery, setAddressQuery] = useState('')
  const [addressResults, setAddressResults] = useState<AddressFeature[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function resetForm() {
    setName(''); setLat(''); setLng(''); setEditingId(null); setNameError(''); setCoordError('')
  }

  function startEdit(dest: SearchPlace) {
    setEditingId(dest.id)
    setName(dest.name)
    setLat(dest.lat.toString())
    setLng(dest.lng.toString())
    setShowForm(true)
  }

  function handleAdd() {
    let valid = true
    if (!name.trim()) { setNameError('Le nom est requis'); valid = false } else setNameError('')
    if (!lat || !lng) { setCoordError('Latitude et longitude requises'); valid = false }
    else if (!isValidCoordinate(lat, lng)) { setCoordError('Coordonnées hors de la région lyonnaise (45.70-45.80°N, 4.75-4.95°E)'); valid = false }
    else setCoordError('')
    if (!valid) return

    const destData = { name: name.trim(), lat: parseFloat(lat), lng: parseFloat(lng) }
    const updated = editingId
      ? customPlaces.map((d) => (d.id === editingId ? { ...d, ...destData } : d))
      : [...customPlaces, { ...destData, id: `custom-${Date.now()}` }]
    saveCustomDestinations(updated)
    onChange(updated)
    resetForm()
    setShowForm(false)
  }

  function handleDelete(id: string) {
    if (editingId === id) resetForm()
    const updated = customPlaces.filter((d) => d.id !== id)
    saveCustomDestinations(updated)
    onChange(updated)
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(6))
      setLng(pos.coords.longitude.toFixed(6))
      setCoordError('')
    })
  }

  function runAddressSearch(query: string) {
    setSearching(true)
    searchAddress(query)
      .then((r) => { setAddressResults(r); setSearching(false) })
      .catch(() => { setAddressResults([]); setSearching(false) })
  }

  function handleAddressQueryChange(value: string) {
    setAddressQuery(value)
    clearTimeout(searchTimerRef.current)
    if (value.trim().length >= 3) searchTimerRef.current = setTimeout(() => runAddressSearch(value), 500)
    else setAddressResults([])
  }

  function handleSelectAddress(feature: AddressFeature) {
    const [lngCoord, latCoord] = feature.geometry.coordinates
    setName(feature.properties.label)
    setLat(latCoord.toFixed(6))
    setLng(lngCoord.toFixed(6))
    setAddressResults([])
    setAddressQuery('')
    setCoordError('')
  }

  if (!isOpen) {
    return (
      <div className={styles.collapsedWrap}>
        <button onClick={() => setIsOpen(true)} className={styles.collapsedBtn}>
          📌 Lieux personnalisés{customPlaces.length > 0 ? ` (${customPlaces.length})` : ''}
        </button>
      </div>
    )
  }

  return (
    <div className={[ui.section, ui.tintWarn].join(' ')}>
      <div className={ui.inner}>
        <div className={styles.head}>
          <h3 className={styles.title}>Lieux personnalisés</h3>
          <div className={styles.headActions}>
            <button
              onClick={() => { if (showForm && editingId) resetForm(); setShowForm(!showForm) }}
              className={styles.addBtn}
            >
              {showForm ? 'Annuler' : '+ Ajouter'}
            </button>
            <button
              onClick={() => { setIsOpen(false); setShowForm(false); resetForm() }}
              className={styles.closeBtn}
              aria-label="Fermer les lieux personnalisés"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {showForm && (
          <div className={styles.form}>
            <div className={styles.searchRow}>
              <input
                type="text"
                placeholder="Rechercher une adresse..."
                value={addressQuery}
                onChange={(e) => handleAddressQueryChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addressQuery.trim() && runAddressSearch(addressQuery)}
                className={ui.input}
              />
              <button
                onClick={() => { if (addressQuery.trim()) runAddressSearch(addressQuery) }}
                disabled={searching || !addressQuery.trim()}
                aria-label="Rechercher une adresse"
                className={styles.searchBtn}
              >
                {searching ? '...' : <Search size={16} />}
              </button>
            </div>
            {addressResults.length > 0 && (
              <div className={ui.resultsList}>
                {addressResults.map((feat) => (
                  <button key={feat.properties.id} onClick={() => handleSelectAddress(feat)} className={ui.resultItem}>
                    {feat.properties.label}
                  </button>
                ))}
              </div>
            )}
            <div className={styles.grid}>
              <div>
                <input
                  type="text"
                  placeholder="Nom (ex: Maison)"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameError('') }}
                  className={[ui.input, nameError ? ui.inputError : ''].join(' ')}
                />
                {nameError && <p className={styles.fieldError}>{nameError}</p>}
              </div>
              <input
                type="number" inputMode="decimal" step="any" placeholder="Latitude"
                value={lat}
                onChange={(e) => { setLat(e.target.value); setCoordError('') }}
                className={[ui.input, coordError ? ui.inputError : ''].join(' ')}
              />
              <input
                type="number" inputMode="decimal" step="any" placeholder="Longitude"
                value={lng}
                onChange={(e) => { setLng(e.target.value); setCoordError('') }}
                className={[ui.input, coordError ? ui.inputError : ''].join(' ')}
              />
            </div>
            {coordError && <p className={styles.fieldError}>{coordError}</p>}
            <div className={styles.formActions}>
              <button onClick={handleUseMyLocation} className={styles.locBtn}>📍 Ma position</button>
              <button onClick={handleAdd} className={styles.saveBtn}>{editingId ? 'Modifier' : 'Ajouter'}</button>
            </div>
          </div>
        )}

        {customPlaces.length > 0 && (
          <div className={styles.chips}>
            {customPlaces.map((d) => (
              <div key={d.id} className={styles.chip}>
                <span className={styles.chipName}>{d.name}</span>
                <button onClick={() => startEdit(d)} className={styles.chipEdit} aria-label={`Modifier ${d.name}`}><Pencil size={14} /></button>
                <button onClick={() => handleDelete(d.id)} className={styles.chipDelete} aria-label={`Supprimer ${d.name}`}><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
