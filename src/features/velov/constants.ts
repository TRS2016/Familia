import type { SearchPlace } from './types'

export const ADDRESS_API = 'https://api-adresse.data.gouv.fr/search/?q='

/** Destinations prédéfinies (Lyon). */
export const DESTINATIONS: SearchPlace[] = [
  { id: 'part-dieu', name: 'Gare Part-Dieu', lat: 45.7603, lng: 4.8594 },
  { id: 'perrache', name: 'Gare Perrache', lat: 45.7495, lng: 4.8267 },
  { id: 'hotel-de-ville', name: 'Hôtel de Ville', lat: 45.7640, lng: 4.8357 },
  { id: 'bellecour', name: 'Place Bellecour', lat: 45.7578, lng: 4.8320 },
]
