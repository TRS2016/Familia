import { DESTINATIONS } from '../constants'
import type { SearchPlace } from '../types'
import ui from './velovUi.module.css'
import styles from './DestinationSelector.module.css'

export interface DestinationSelectorProps {
  selected: SearchPlace | null
  onSelect: (place: SearchPlace | null) => void
  onEnable: () => void
  customPlaces?: SearchPlace[]
  radius?: number
  onRadiusChange?: (r: number) => void
}

export function DestinationSelector({
  selected, onSelect, onEnable, customPlaces = [], radius = 200, onRadiusChange,
}: DestinationSelectorProps) {
  const allDestinations = [...DESTINATIONS, ...customPlaces]

  return (
    <div className={[ui.section, ui.tintInfo].join(' ')}>
      <div className={ui.inner}>
        <label className={[ui.label, styles.label].join(' ')}>Votre destination</label>
        <div className={styles.row}>
          <select
            aria-label="Destination pour l'alerte de proximité"
            value={selected?.id || ''}
            onChange={(e) => onSelect(allDestinations.find((d) => d.id === e.target.value) ?? null)}
            className={ui.select}
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

          <button onClick={() => onEnable()} disabled={!selected} className={ui.btnPrimary} style={{ flexShrink: 0 }}>
            Activer l'alerte
          </button>
        </div>

        {onRadiusChange && (
          <div className={styles.radiusRow}>
            <span className={styles.radiusLabel}>Rayon d'alerte :</span>
            {[100, 200, 500].map((r) => (
              <button
                key={r}
                onClick={() => onRadiusChange(r)}
                className={[ui.chip, radius === r ? ui.chipActive : ''].join(' ')}
              >
                {r}m
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
