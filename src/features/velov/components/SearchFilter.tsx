import { useState } from 'react'
import { Star, Settings, MapPin, Bike } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import styles from './SearchFilter.module.css'

export type StationFilter = 'all' | 'bikes' | 'stands'
export type StationSort = 'distance' | 'bikes' | 'name'

export interface SearchFilterProps {
  search: string
  onSearchChange: (v: string) => void
  filter: StationFilter
  onFilterChange: (v: StationFilter) => void
  showFavoritesOnly: boolean
  onToggleFavorites: () => void
  favoritesCount: number
  openOnly: boolean
  onOpenOnlyChange: (v: boolean) => void
  minBikes: number
  onMinBikesChange: (v: number) => void
  maxDistance: number
  onMaxDistanceChange: (v: number) => void
  hasLocation: boolean
  sort: StationSort
  onSortChange?: (v: StationSort) => void
}

export function SearchFilter({
  search, onSearchChange,
  filter, onFilterChange,
  showFavoritesOnly, onToggleFavorites, favoritesCount,
  openOnly, onOpenOnlyChange,
  minBikes, onMinBikesChange,
  maxDistance, onMaxDistanceChange,
  hasLocation,
  sort, onSortChange,
}: SearchFilterProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const hasActiveFilters = openOnly || minBikes > 0 || maxDistance > 0

  const sortOptions: { value: StationSort; label: string; Icon?: LucideIcon; hidden?: boolean }[] = [
    { value: 'distance', label: 'Proche', Icon: MapPin, hidden: !hasLocation },
    { value: 'bikes', label: 'Vélos', Icon: Bike },
    { value: 'name', label: 'A–Z' },
  ]

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <div className={styles.searchWrap}>
          <input
            type="text"
            placeholder="Rechercher une station..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className={styles.search}
          />
        </div>

        <div className={styles.filters}>
          <button
            onClick={() => onFilterChange('all')}
            className={[styles.chip, filter === 'all' ? styles.chipActive : ''].join(' ')}
          >
            Toutes
          </button>
          <button
            onClick={() => onFilterChange('bikes')}
            className={[styles.chip, filter === 'bikes' ? styles.chipBikes : ''].join(' ')}
          >
            Vélos dispo
          </button>
          <button
            onClick={() => onFilterChange('stands')}
            className={[styles.chip, filter === 'stands' ? styles.chipStands : ''].join(' ')}
          >
            Places dispo
          </button>

          <button
            onClick={onToggleFavorites}
            className={[styles.chip, showFavoritesOnly ? styles.chipFav : ''].join(' ')}
            title="Voir les favoris"
            aria-label="Voir les favoris"
          >
            <Star size={16} fill={showFavoritesOnly ? 'currentColor' : 'none'} /> {favoritesCount}
          </button>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={[styles.chip, styles.chipAdv, (showAdvanced || hasActiveFilters) ? styles.chipAdvActive : ''].join(' ')}
            title="Filtres avancés"
            aria-label="Filtres avancés"
          >
            <Settings size={16} />{hasActiveFilters && <span className={styles.advDot} />}
          </button>
        </div>
      </div>

      {showAdvanced && (
        <div className={styles.advanced}>
          <label className={styles.advLabel}>
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => onOpenOnlyChange(e.target.checked)}
              className={styles.checkbox}
            />
            {' '}Ouvertes seulement
          </label>

          <div className={styles.advItem}>
            <span className={styles.advLabel}>Min. vélos :</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="20"
              value={minBikes}
              onChange={(e) => onMinBikesChange(Math.max(0, parseInt(e.target.value) || 0))}
              className={styles.numInput}
            />
          </div>

          {hasLocation && (
            <div className={styles.advItem}>
              <span className={styles.advLabel}>Distance max :</span>
              <select
                value={maxDistance}
                onChange={(e) => onMaxDistanceChange(parseInt(e.target.value))}
                className={styles.select}
              >
                <option value={0}>Tout</option>
                <option value={200}>200m</option>
                <option value={500}>500m</option>
                <option value={1000}>1km</option>
                <option value={2000}>2km</option>
              </select>
            </div>
          )}

          {onSortChange && (
            <div className={styles.advItem}>
              <span className={styles.advLabel}>Trier :</span>
              {sortOptions.filter((o) => !o.hidden).map((o) => (
                <button
                  key={o.value}
                  onClick={() => onSortChange(o.value)}
                  className={[styles.sortBtn, sort === o.value ? styles.sortActive : ''].join(' ')}
                >
                  {o.Icon && <o.Icon size={14} />}{o.label}
                </button>
              ))}
            </div>
          )}

          {hasActiveFilters && (
            <button
              onClick={() => { onOpenOnlyChange(false); onMinBikesChange(0); onMaxDistanceChange(0) }}
              className={styles.reset}
            >
              Réinitialiser
            </button>
          )}
        </div>
      )}
    </div>
  )
}
