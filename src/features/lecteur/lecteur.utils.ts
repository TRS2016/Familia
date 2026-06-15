import type { LecteurSmartFilters, MediaFileKind } from './useLecteur'

export const KIND_META: Record<MediaFileKind, { emoji: string; label: string }> = {
  audio:  { emoji: '🎵', label: 'Audio'  },
  vidéo:  { emoji: '🎬', label: 'Vidéo'  },
  lien:   { emoji: '🔗', label: 'Lien'   },
}

// Vignette YouTube (mqdefault) déduite de l'URL externe, ou null si non YouTube.
// Sert d'artwork pour le now-playing et les lignes de bibliothèque.
export function youtubeThumb(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:v=|vi=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/|\/v\/)([a-zA-Z0-9_-]{11})/)
  return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : null
}

export function smartFilterLabel(f: LecteurSmartFilters): string {
  const parts: string[] = []
  if (f.kind)     parts.push(KIND_META[f.kind].emoji + ' ' + f.kind)
  if (f.tag)      parts.push('#' + f.tag)
  if (f.favorite) parts.push('★ Favoris')
  if (f.sort === 'az')     parts.push('A→Z')
  if (f.sort === 'oldest') parts.push('Plus anciens')
  return parts.length > 0 ? parts.join(' · ') : 'Tous les médias'
}

// Mélange Fisher-Yates (copie, ne mute pas l'original).
export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 225 → « 3:45 », 3753 → « 1:02:33 »
export function fmtDuration(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = Math.floor(total % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// Durée d'un fichier audio/vidéo local, lue via loadedmetadata avant upload.
// Résout null (jamais de rejet) : la durée est un bonus, pas un bloqueur.
export function probeDuration(file: File): Promise<number | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const el  = document.createElement(file.type.startsWith('audio/') ? 'audio' : 'video')
    let settled = false
    const done = (d: number | null) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(d)
    }
    el.preload = 'metadata'
    el.onloadedmetadata = () =>
      done(isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration) : null)
    el.onerror = () => done(null)
    setTimeout(() => done(null), 10_000)
    el.src = url
  })
}
