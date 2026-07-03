import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Recherche YouTube. Accessible :
//  - aux invités via un token de soirée valide (?token=)
//  - aux membres connectés via leur JWT (Authorization: Bearer …)
// La clé API reste côté serveur.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'GET')     return json({ error: 'Méthode non supportée' }, 405)

  const apiKey = Deno.env.get('YOUTUBE_API_KEY')
  if (!apiKey) return json({ error: 'Recherche non configurée (clé YouTube manquante).' }, 503)

  const url = new URL(req.url)
  const q          = (url.searchParams.get('q') ?? '').trim()
  const playlistId = (url.searchParams.get('playlist') ?? '').trim()
  const token = url.searchParams.get('token')
  if (!q && !playlistId) return json({ results: [] })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Autorisation : token de soirée OU membre connecté ──
  let authorized = false
  if (token) {
    const { data } = await supabase
      .from('lecteur_party_tokens')
      .select('expires_at')
      .eq('token', token)
      .maybeSingle()
    authorized = !!data && new Date(data.expires_at as string) >= new Date()
  } else {
    const auth = req.headers.get('Authorization') ?? ''
    const jwt = auth.replace(/^Bearer\s+/i, '')
    if (jwt) {
      const { data } = await supabase.auth.getUser(jwt)
      authorized = !!data.user
    }
  }
  if (!authorized) return json({ error: 'Non autorisé' }, 401)

  // ── Mode playlist : titre + items (import d'une playlist YouTube entière).
  // Coût quota négligeable (1 unité/appel playlistItems vs 100 pour search) →
  // ni cache ni throttle. Plafond 200 morceaux (4 pages de 50).
  if (playlistId) {
    if (!/^[\w-]+$/.test(playlistId)) return json({ error: 'Playlist invalide' }, 400)
    const plRes = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`,
    )
    if (!plRes.ok) return json({ error: 'Playlist introuvable' }, 502)
    const plData = await plRes.json() as { items?: { snippet?: { title?: string } }[] }
    const title = plData.items?.[0]?.snippet?.title
    if (!title) return json({ error: 'Playlist introuvable ou privée' }, 404)

    interface PlItem { snippet?: { title?: string; videoOwnerChannelTitle?: string; resourceId?: { videoId?: string } } }
    const items: PlItem[] = []
    let pageToken = ''
    for (let page = 0; page < 4; page++) {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}${pageToken ? `&pageToken=${pageToken}` : ''}&key=${apiKey}`,
      )
      if (!r.ok) return json({ error: 'Lecture de la playlist impossible' }, 502)
      const d = await r.json() as { items?: PlItem[]; nextPageToken?: string }
      items.push(...(d.items ?? []))
      pageToken = d.nextPageToken ?? ''
      if (!pageToken) break
    }

    const videos = items
      .filter(it => it.snippet?.resourceId?.videoId
        && it.snippet.title
        && it.snippet.title !== 'Private video'
        && it.snippet.title !== 'Deleted video')
      .map(it => ({
        videoId: it.snippet!.resourceId!.videoId!,
        title:   it.snippet!.title!,
        channel: it.snippet!.videoOwnerChannelTitle ?? '',
      }))
    return json({ title, items: videos, truncated: !!pageToken })
  }

  // ── Cache 24 h : chaque appel API coûte 100 unités de quota (10 000/jour),
  // soit 100 recherches/jour au total — les requêtes identiques ne doivent
  // compter qu'une fois.
  const qNorm = q.toLowerCase()
  const { data: cached } = await supabase
    .from('yt_search_cache')
    .select('results, created_at')
    .eq('q', qNorm)
    .maybeSingle()
  if (cached && Date.now() - new Date(cached.created_at as string).getTime() < 24 * 3600 * 1000) {
    return json({ results: cached.results })
  }

  // ── Throttle global : chaque cache miss insère/rafraîchit une ligne, donc
  // le nombre de lignes récentes ≈ le nombre d'appels API récents.
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { count: recentCalls } = await supabase
    .from('yt_search_cache')
    .select('q', { count: 'exact', head: true })
    .gte('created_at', tenMinAgo)
  if ((recentCalls ?? 0) >= 30) {
    return json({ error: 'Trop de recherches d’un coup — réessaie dans quelques minutes.' }, 429)
  }

  // ── Appel YouTube Data API v3 ──
  const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&videoEmbeddable=true&q=${encodeURIComponent(q)}&key=${apiKey}`
  const r = await fetch(ytUrl)
  if (!r.ok) return json({ error: 'Recherche YouTube indisponible' }, 502)
  const data = await r.json() as {
    items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } } }[]
  }

  const results = (data.items ?? [])
    .filter(it => it.id?.videoId)
    .map(it => ({
      videoId:   it.id!.videoId!,
      title:     it.snippet?.title ?? '',
      channel:   it.snippet?.channelTitle ?? '',
      thumbnail: it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url ?? '',
    }))

  await supabase
    .from('yt_search_cache')
    .upsert({ q: qNorm, results, created_at: new Date().toISOString() })

  return json({ results })
})
