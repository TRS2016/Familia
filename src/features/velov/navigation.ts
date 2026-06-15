import type { RouteStep } from './types'

const DIR_TEXT: Record<string, string> = {
  left: 'à gauche',
  right: 'à droite',
  straight: 'tout droit',
  'slight left': 'légèrement à gauche',
  'slight right': 'légèrement à droite',
  'sharp left': 'à gauche serré',
  'sharp right': 'à droite serré',
  uturn: 'demi-tour',
}

export function maneuverIcon(step: RouteStep): string {
  const { type, modifier = '' } = step.maneuver
  if (type === 'depart') return '🚲'
  if (type === 'arrive') return '🏁'
  if (type === 'roundabout' || type === 'rotary') return '🔄'
  if (type === 'exit roundabout' || type === 'exit rotary') return '↗'
  if (type === 'fork') return modifier.includes('left') ? '↙' : '↘'
  if (type === 'merge') return '⤵'
  if (type === 'end of road') return modifier.includes('left') ? '←' : '→'
  if (type === 'new name') return '↑'
  if (modifier === 'uturn') return '↩'
  if (modifier.includes('sharp left')) return '↩'
  if (modifier.includes('sharp right')) return '↪'
  if (modifier.includes('slight left')) return '↖'
  if (modifier.includes('slight right')) return '↗'
  if (modifier.includes('left')) return '←'
  if (modifier.includes('right')) return '→'
  return '↑'
}

export function maneuverLabel(step: RouteStep): string {
  const { type, modifier = '', exit } = step.maneuver
  if (type === 'depart') return 'Départ'
  if (type === 'arrive') return 'Arrivée'

  if (type === 'roundabout' || type === 'rotary') {
    if (exit) return `Rond-point — ${exit}${ordinalSuffix(exit)} sortie`
    return 'Rond-point'
  }
  if (type === 'exit roundabout' || type === 'exit rotary') return 'Quittez le rond-point'

  if (type === 'fork') {
    if (modifier.includes('left')) return 'Gardez la gauche'
    if (modifier.includes('right')) return 'Gardez la droite'
    return 'Continuez tout droit'
  }
  if (type === 'merge') {
    if (modifier.includes('left')) return 'Rejoignez par la gauche'
    if (modifier.includes('right')) return 'Rejoignez par la droite'
    return 'Rejoignez la voie'
  }
  if (type === 'end of road') {
    const dir = DIR_TEXT[modifier] || ''
    return `Fin de route — tournez ${dir}`
  }
  if (type === 'new name') return 'Continuez'

  const dir = DIR_TEXT[modifier] || ''
  return `Tournez ${dir}`
}

function ordinalSuffix(n: number): string {
  return n === 1 ? 'ère' : 'ème'
}
