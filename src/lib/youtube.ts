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
