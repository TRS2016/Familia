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
  const q     = (url.searchParams.get('q') ?? '').trim()
  const token = url.searchParams.get('token')
  if (!q) return json({ results: [] })

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

  return json({ results })
})
