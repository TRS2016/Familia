// Partagé entre la recherche YouTube des membres (Lecteur) et la page invité.

export interface YtResult {
  videoId: string
  title: string
  channel: string
  thumbnail: string
}

// L'API YouTube renvoie les titres avec entités HTML (&amp;, &#39;…).
export function decodeHtml(s: string): string {
  const t = document.createElement('textarea')
  t.innerHTML = s
  return t.value
}

// Extrait l'ID 11 caractères d'une URL YouTube (toutes formes courantes), ou ''.
// Source unique partagée (lecteur, MediaPlayer, watchlist) pour éviter une
// dépendance inter-features (media → lecteur).
export function youtubeId(url: string | null | undefined): string {
  if (!url) return ''
  const m = url.match(/(?:v=|vi=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/|\/v\/)([a-zA-Z0-9_-]{11})/)
  return m?.[1] ?? ''
}

// Vignette YouTube (mqdefault) déduite de l'URL externe, ou null si non YouTube.
export function youtubeThumb(url: string | null | undefined): string | null {
  const id = youtubeId(url)
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null
}
