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

  // Résout et valide un token de soirée → { household, modération }, ou null si invalide/expiré.
  async function resolveParty(token: string | null): Promise<{ householdId: string; moderated: boolean } | null> {
    if (!token) return null
    const { data } = await supabase
      .from('lecteur_party_tokens')
      .select('household_id, expires_at, moderated')
      .eq('token', token)
      .maybeSingle()
    if (!data || new Date(data.expires_at as string) < new Date()) return null
    return { householdId: data.household_id as string, moderated: data.moderated === true }
  }

  // ── GET : bibliothèque + file en cours ──────────────────────────────────────
  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token')
    const party = await resolveParty(token)
    if (!party) return json({ error: 'Lien invalide ou expiré' }, 404)
    const householdId = party.householdId

    const [tracksRes, queueRes, nowRes] = await Promise.all([
      supabase
        .from('media_files')
        .select('id, title, member:members(display_name)')
        .eq('household_id', householdId)
        .order('title', { ascending: true }),
      supabase
        .from('lecteur_queue')
        .select('id, votes, media_file:media_files(title), added_by_member:members!lecteur_queue_added_by_fkey(display_name), guest_name, position')
        .eq('household_id', householdId)
        .eq('played', false)
        .eq('approved', true)
        .order('position', { ascending: true }),
      supabase
        .from('lecteur_now_playing')
        .select('queue_item_id, title, requested_by, updated_at')
        .eq('household_id', householdId)
        .maybeSingle(),
    ])
    if (tracksRes.error || queueRes.error) return json({ error: 'Erreur serveur' }, 500)

    // Now-playing publié par l'appareil DJ. Garde-fou anti-stale (6 h) au cas où
    // le DJ aurait quitté sans nettoyage (crash, onglet fermé).
    const nowRow = nowRes.data as { queue_item_id: string | null; title: string; requested_by: string | null; updated_at: string } | null
    const nowPlaying = nowRow && Date.now() - new Date(nowRow.updated_at).getTime() < 6 * 3600 * 1000
      ? { id: nowRow.queue_item_id, title: nowRow.title, by: nowRow.requested_by }
      : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracks = (tracksRes.data ?? []).map((t: any) => ({
      id: t.id, title: t.title, by: t.member?.display_name ?? null,
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queue = (queueRes.data ?? []).map((q: any) => ({
      id: q.id, votes: q.votes ?? 0,
      title: q.media_file?.title ?? 'Morceau', by: q.added_by_member?.display_name ?? q.guest_name ?? null,
    }))
    return json({ tracks, queue, now: nowPlaying })
  }

  // ── POST : un invité ajoute un morceau ──────────────────────────────────────
  // Body : { token, guest_name, media_file_id }  (depuis la bibliothèque)
  //   ou  : { token, guest_name, external_url, title }  (lien YouTube/Spotify)
  if (req.method === 'POST') {
    let body: { token?: string; action?: string; queue_item_id?: string; voter_key?: string; media_file_id?: string; external_url?: string; title?: string; guest_name?: string }
    try { body = await req.json() } catch { return json({ error: 'Requête invalide' }, 400) }

    const party = await resolveParty(body.token ?? null)
    if (!party) return json({ error: 'Lien invalide ou expiré' }, 404)
    const householdId = party.householdId

    // ── Vote invité (modèle « le DJ arbitre » : incrémente un compteur) ──
    if (body.action === 'vote') {
      const itemId   = (body.queue_item_id ?? '').trim()
      const voterKey = (body.voter_key ?? '').trim().slice(0, 64)
      if (!itemId || !voterKey) return json({ error: 'Vote invalide' }, 400)
      // Le morceau doit appartenir au foyer du token et ne pas être déjà joué.
      const { data: item } = await supabase
        .from('lecteur_queue')
        .select('id')
        .eq('id', itemId)
        .eq('household_id', householdId)
        .eq('played', false)
        .maybeSingle()
      if (!item) return json({ error: 'Morceau introuvable' }, 404)
      const { data: counted, error: vErr } = await supabase
        .rpc('vote_lecteur_queue', { p_item_id: itemId, p_voter_key: `g:${voterKey}` })
      if (vErr) return json({ error: 'Vote impossible' }, 500)
      return json({ ok: true, counted: counted === true })
    }

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
          // Tag automatique : identifie les ajouts invités dans la bibliothèque
          // et permet la purge optionnelle à la fermeture de la soirée.
          tags:         ['soirée'],
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
    // Modération active → la demande entre en attente (approved=false) jusqu'à
    // validation du DJ. Sinon, ajout direct en file.
    const { error } = await supabase.from('lecteur_queue').insert({
      household_id:  householdId,
      media_file_id: mediaFileId,
      added_by:      null,
      guest_name:    guestName,
      position:      Date.now(),
      approved:      !party.moderated,
    })
    if (error) return json({ error: 'Ajout impossible' }, 500)
    return json({ ok: true, pending: party.moderated })
  }

  return json({ error: 'Méthode non supportée' }, 405)
})
