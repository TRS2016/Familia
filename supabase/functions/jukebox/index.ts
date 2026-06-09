import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const MAX_PENDING = 300 // garde-fou anti-spam

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Résout et valide un token de soirée → household_id, ou null si invalide/expiré.
  async function resolveHousehold(token: string | null): Promise<string | null> {
    if (!token) return null
    const { data } = await supabase
      .from('lecteur_party_tokens')
      .select('household_id, expires_at')
      .eq('token', token)
      .maybeSingle()
    if (!data || new Date(data.expires_at as string) < new Date()) return null
    return data.household_id as string
  }

  // ── GET : bibliothèque + file en cours ──────────────────────────────────────
  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token')
    const householdId = await resolveHousehold(token)
    if (!householdId) return json({ error: 'Lien invalide ou expiré' }, 404)

    const [tracksRes, queueRes] = await Promise.all([
      supabase
        .from('media_files')
        .select('id, title, member:members(display_name)')
        .eq('household_id', householdId)
        .order('title', { ascending: true }),
      supabase
        .from('lecteur_queue')
        .select('media_file:media_files(title), added_by_member:members!lecteur_queue_added_by_fkey(display_name), guest_name, position')
        .eq('household_id', householdId)
        .eq('played', false)
        .order('position', { ascending: true }),
    ])
    if (tracksRes.error || queueRes.error) return json({ error: 'Erreur serveur' }, 500)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracks = (tracksRes.data ?? []).map((t: any) => ({
      id: t.id, title: t.title, by: t.member?.display_name ?? null,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queue = (queueRes.data ?? []).map((q: any) => ({
      title: q.media_file?.title ?? 'Morceau', by: q.added_by_member?.display_name ?? q.guest_name ?? null,
    }))
    return json({ tracks, queue })
  }

  // ── POST : un invité ajoute un morceau ──────────────────────────────────────
  // Body : { token, guest_name, media_file_id }  (depuis la bibliothèque)
  //   ou  : { token, guest_name, external_url, title }  (lien YouTube/Spotify)
  if (req.method === 'POST') {
    let body: { token?: string; media_file_id?: string; external_url?: string; title?: string; guest_name?: string }
    try { body = await req.json() } catch { return json({ error: 'Requête invalide' }, 400) }

    const householdId = await resolveHousehold(body.token ?? null)
    if (!householdId) return json({ error: 'Lien invalide ou expiré' }, 404)

    // Garde-fou anti-spam.
    const { count } = await supabase
      .from('lecteur_queue')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .eq('played', false)
    if ((count ?? 0) >= MAX_PENDING) return json({ error: 'File pleine' }, 429)

    let mediaFileId = body.media_file_id

    if (!mediaFileId) {
      // Ajout via lien : on n'autorise que YouTube / Spotify.
      const ext = (body.external_url ?? '').trim()
      if (!ext) return json({ error: 'Morceau manquant' }, 400)
      if (!/(?:youtube\.com|youtu\.be|open\.spotify\.com)/i.test(ext)) {
        return json({ error: 'Seuls les liens YouTube ou Spotify sont acceptés.' }, 400)
      }
      const { data: created, error: cErr } = await supabase
        .from('media_files')
        .insert({
          household_id: householdId,
          member_id:    null,
          title:        (body.title ?? '').trim().slice(0, 120) || 'Morceau (invité)',
          external_url: ext,
          tags:         [],
        })
        .select('id')
        .single()
      if (cErr || !created) return json({ error: 'Ajout impossible' }, 500)
      mediaFileId = created.id as string
    } else {
      // Le morceau doit appartenir au foyer du token.
      const { data: file } = await supabase
        .from('media_files')
        .select('id')
        .eq('id', mediaFileId)
        .eq('household_id', householdId)
        .maybeSingle()
      if (!file) return json({ error: 'Morceau introuvable' }, 404)
    }

    const guestName = (body.guest_name ?? '').trim().slice(0, 40) || 'Invité'
    const { error } = await supabase.from('lecteur_queue').insert({
      household_id:  householdId,
      media_file_id: mediaFileId,
      added_by:      null,
      guest_name:    guestName,
      position:      Date.now(),
    })
    if (error) return json({ error: 'Ajout impossible' }, 500)
    return json({ ok: true })
  }

  return json({ error: 'Méthode non supportée' }, 405)
})
