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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!token) return json({ error: 'Token manquant' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: tokenRow } = await supabase
    .from('shared_list_tokens')
    .select('household_id, expires_at, list_id')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow || new Date(tokenRow.expires_at as string) < new Date()) {
    return json({ error: 'Lien invalide ou expiré' }, 404)
  }

  const listId = tokenRow.list_id as string | null

  if (listId) {
    // Partage d'une liste sauvegardée
    const [listRes, itemsRes] = await Promise.all([
      supabase.from('grocery_saved_lists').select('name').eq('id', listId).single(),
      supabase
        .from('grocery_saved_items')
        .select('name, quantity, price, category, store')
        .eq('list_id', listId)
        .order('created_at', { ascending: true }),
    ])
    if (itemsRes.error) return json({ error: 'Erreur serveur' }, 500)
    return json({
      items: itemsRes.data ?? [],
      list_name: (listRes.data as { name: string } | null)?.name ?? null,
      expires_at: tokenRow.expires_at,
    })
  }

  // Compat. ascendante : liste courante non-cochée
  const { data: items, error } = await supabase
    .from('groceries')
    .select('name, quantity, price, category, store')
    .eq('household_id', tokenRow.household_id as string)
    .eq('checked', false)
    .order('created_at', { ascending: false })

  if (error) return json({ error: 'Erreur serveur' }, 500)
  return json({ items: items ?? [], list_name: null, expires_at: tokenRow.expires_at })
})
