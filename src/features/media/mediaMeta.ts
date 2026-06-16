// Métadonnées d'affichage des médias (emoji/label par type, style de statut).
// Extrait de MediaRow pour que ce dernier n'exporte que son composant
// (contrainte react-refresh/only-export-components).

export const TYPE_META: Record<string, { emoji: string; label: string }> = {
  film:  { emoji: '🎬', label: 'Film'  },
  série: { emoji: '📺', label: 'Série' },
  livre: { emoji: '📚', label: 'Livre' },
  jeu:   { emoji: '🎮', label: 'Jeu'   },
}

export const STATUS_STYLE: Record<string, { background: string; color: string; borderColor: string }> = {
  'à voir':   { background: 'transparent',              color: 'var(--text-muted)', borderColor: 'var(--border)' },
  'en cours': { background: 'rgba(224,123,84,0.12)',    color: 'var(--accent)',     borderColor: 'var(--accent)' },
  'terminé':  { background: 'rgba(91,158,143,0.12)',    color: '#5B9E8F',           borderColor: '#5B9E8F' },
  'abandonné':{ background: 'rgba(192,57,43,0.10)',     color: 'var(--danger)',           borderColor: 'rgba(192,57,43,0.5)' },
}
