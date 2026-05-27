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
    .select('household_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow || new Date(tokenRow.expires_at as string) < new Date()) {
    return json({ error: 'Lien invalide ou expiré' }, 404)
  }

  const { data: items, error } = await supabase
    .from('groceries')
    .select('name, quantity, price, category, store')
    .eq('household_id', tokenRow.household_id as string)
    .eq('checked', false)
    .order('created_at', { ascending: false })

  if (error) return json({ error: 'Erreur serveur' }, 500)

  return json({ items: items ?? [], expires_at: tokenRow.expires_at })
})
