// Catalogue statique des badges + courbe de niveaux. Aucune table de
// définition : seuls les badges débloqués sont stockés (member_achievements).

// ── Niveaux ───────────────────────────────────────────────────────────────────
// Coût croissant : niveau L (≥1) coûte 100 + (L-1)*50 XP. Le niveau 1 démarre à 0.

export interface LevelInfo {
  level: number
  intoLevel: number      // XP acquis dans le niveau courant
  neededForNext: number  // XP total du palier courant
  progress: number       // 0..1
  toNext: number         // XP restants pour le niveau suivant
}

function levelCost(level: number): number {
  return 100 + (level - 1) * 50
}

export function levelForXp(xp: number): LevelInfo {
  let level = 1
  let remaining = Math.max(0, xp)
  let cost = levelCost(1)
  while (remaining >= cost) {
    remaining -= cost
    level += 1
    cost = levelCost(level)
  }
  return {
    level,
    intoLevel: remaining,
    neededForNext: cost,
    progress: cost > 0 ? remaining / cost : 0,
    toNext: cost - remaining,
  }
}

export function levelEmoji(level: number): string {
  if (level >= 20) return '👑'
  if (level >= 15) return '🏆'
  if (level >= 10) return '💎'
  if (level >= 7) return '🥇'
  if (level >= 4) return '🥈'
  if (level >= 2) return '🥉'
  return '🌱'
}

// ── Badges ────────────────────────────────────────────────────────────────────

export interface AchievementCtx {
  totalXp: number
  totalChores: number
  byCategory: Record<string, number>
  streakDays: number     // jours consécutifs avec au moins une tâche faite
  weekShare: number      // part (0..1) des points du foyer cette semaine
  weekHasActivity: boolean
  thanksSent: number     // mercis envoyés (à vie)
}

export interface Achievement {
  key: string
  label: string
  emoji: string
  description: string
  earned: (c: AchievementCtx) => boolean
}

export const ACHIEVEMENTS: Achievement[] = [
  { key: 'first',     label: 'Premier pas',   emoji: '✅', description: 'Première tâche validée',            earned: c => c.totalChores >= 1 },
  { key: 'ten',       label: 'En rythme',     emoji: '🔟', description: '10 tâches validées',               earned: c => c.totalChores >= 10 },
  { key: 'fifty',     label: 'Pilier',        emoji: '🏛️', description: '50 tâches validées',               earned: c => c.totalChores >= 50 },
  { key: 'streak7',   label: 'Semaine pleine', emoji: '🔥', description: '7 jours d\'affilée',              earned: c => c.streakDays >= 7 },
  { key: 'streak30',  label: 'Increvable',    emoji: '⚡', description: '30 jours d\'affilée',              earned: c => c.streakDays >= 30 },
  { key: 'xp100',     label: 'Centurion',     emoji: '💯', description: '100 XP cumulés',                   earned: c => c.totalXp >= 100 },
  { key: 'xp500',     label: 'Vétéran',       emoji: '🎖️', description: '500 XP cumulés',                   earned: c => c.totalXp >= 500 },
  { key: 'xp1000',    label: 'Légende',       emoji: '🏆', description: '1000 XP cumulés',                  earned: c => c.totalXp >= 1000 },
  { key: 'chef',      label: 'Chef',          emoji: '🍳', description: '10 tâches « Cuisine »',            earned: c => (c.byCategory.cuisine ?? 0) >= 10 },
  { key: 'parent',    label: 'Super-parent',  emoji: '🧒', description: '10 tâches « Enfants »',            earned: c => (c.byCategory.enfants ?? 0) >= 10 },
  { key: 'clean',     label: 'Maison nickel', emoji: '🧹', description: '10 tâches « Ménage »',             earned: c => (c.byCategory.menage ?? 0) >= 10 },
  { key: 'fairshare', label: 'Équipier',      emoji: '🤝', description: 'Part équitable cette semaine (≥40%)', earned: c => c.weekHasActivity && c.weekShare >= 0.4 },
  { key: 'grateful',  label: 'Reconnaissant·e', emoji: '💛', description: '50 mercis envoyés',               earned: c => c.thanksSent >= 50 },
]
