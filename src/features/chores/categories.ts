// Catalogue statique des catégories de tâches familiales. Sert au regroupement
// visuel et propose un emoji par défaut à la création.

export interface ChoreCategory {
  value: string
  label: string
  emoji: string
  color: string
}

export const CHORE_CATEGORIES: ChoreCategory[] = [
  { value: 'cuisine',  label: 'Cuisine',   emoji: '🍳', color: '#E07B54' },
  { value: 'enfants',  label: 'Enfants',   emoji: '🧒', color: '#5B9E8F' },
  { value: 'menage',   label: 'Ménage',    emoji: '🧹', color: '#9B7AC4' },
  { value: 'courses',  label: 'Courses',   emoji: '🛒', color: '#E8B84B' },
  { value: 'animaux',  label: 'Animaux',   emoji: '🐾', color: '#7AA8C4' },
  { value: 'linge',    label: 'Linge',     emoji: '👕', color: '#C47A9B' },
  { value: 'admin',    label: 'Administratif', emoji: '📄', color: '#8F8F8F' },
  { value: 'exterieur', label: 'Extérieur', emoji: '🌿', color: '#6FA86F' },
  { value: 'autre',    label: 'Autre',     emoji: '✨', color: '#A0A0A0' },
]

export function categoryOf(value: string): ChoreCategory {
  return CHORE_CATEGORIES.find(c => c.value === value) ?? CHORE_CATEGORIES[CHORE_CATEGORIES.length - 1]
}

// Suggestions de tâches courantes (pré-remplissage rapide à la création).
export const CHORE_SUGGESTIONS: { name: string; emoji: string; category: string; points: number }[] = [
  { name: 'Cuisiner le repas',        emoji: '🍳', category: 'cuisine', points: 15 },
  { name: 'Faire la vaisselle',       emoji: '🍽️', category: 'cuisine', points: 10 },
  { name: 'Récupérer les enfants',    emoji: '🚗', category: 'enfants', points: 15 },
  { name: 'Donner le bain',           emoji: '🛁', category: 'enfants', points: 15 },
  { name: 'Donner à manger',          emoji: '🍼', category: 'enfants', points: 10 },
  { name: 'Coucher les enfants',      emoji: '🌙', category: 'enfants', points: 15 },
  { name: 'Passer l\'aspirateur',     emoji: '🧹', category: 'menage', points: 10 },
  { name: 'Sortir les poubelles',     emoji: '🗑️', category: 'menage', points: 5 },
  { name: 'Faire les courses',        emoji: '🛒', category: 'courses', points: 20 },
  { name: 'Étendre le linge',         emoji: '👕', category: 'linge', points: 10 },
  { name: 'Sortir le chien',          emoji: '🐶', category: 'animaux', points: 10 },
]
