// Recherche de livres via OpenLibrary (sans clé API). Sert l'auto-complétion
// de la watchlist (type « livre »).

export interface BookSuggestion {
  title: string
  author: string | null
  year: number | null
  url: string | null
}

interface OlDoc {
  title?: string
  author_name?: string[]
  first_publish_year?: number
  key?: string // ex. "/works/OL12345W"
}

export async function searchBooks(query: string, signal?: AbortSignal): Promise<BookSuggestion[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(q)}&limit=6&fields=title,author_name,first_publish_year,key`
  const res = await fetch(url, { signal })
  if (!res.ok) return []
  const data = (await res.json()) as { docs?: OlDoc[] }
  return (data.docs ?? [])
    .filter(d => d.title)
    .map(d => ({
      title: d.title!,
      author: d.author_name?.[0] ?? null,
      year: d.first_publish_year ?? null,
      url: d.key ? `https://openlibrary.org${d.key}` : null,
    }))
}
