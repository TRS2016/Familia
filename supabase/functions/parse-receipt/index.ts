// ─────────────────────────────────────────────────────────────────────────────
// parse-receipt : lit la photo d'un ticket de caisse et renvoie les articles
// structurés (nom, quantité, prix, rayon) pour enrichir le catalogue courses.
//
// L'image n'est JAMAIS stockée : envoyée en base64 au modèle de vision puis
// jetée. Protégée par la vérification JWT par défaut des Edge Functions Supabase.
// Clé requise : secret `ANTHROPIC_API_KEY`.
// ─────────────────────────────────────────────────────────────────────────────

import { corsHeaders } from '../_shared/cors.ts'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5' // tâche vision simple : Haiku suffit et coûte ~5x moins qu'Opus
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

interface Body {
  image?: string        // base64 (sans préfixe data:)
  mimeType?: string
  categories?: string[] // rayons existants du foyer (source unique : CATEGORY_ORDER côté client)
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
function err(message: string, status: number): Response {
  return json({ error: message }, status)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return err('Method not allowed', 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    console.error('[parse-receipt] ANTHROPIC_API_KEY manquant')
    return err('Service non configuré (clé IA absente).', 500)
  }

  let body: Body
  try { body = await req.json() as Body } catch { return err('Corps JSON invalide', 400) }

  const image = body.image
  if (!image || typeof image !== 'string') return err('Image manquante', 400)
  const mimeType = ALLOWED_MIME.has(body.mimeType ?? '') ? body.mimeType! : 'image/jpeg'

  const categories = Array.isArray(body.categories) && body.categories.length
    ? body.categories.filter((c): c is string => typeof c === 'string' && c.length > 0)
    : ['Autre']

  const prompt = `Tu lis la photo d'un ticket de caisse de courses (supermarché français). Extrais UNIQUEMENT les articles achetés.

Règles :
- Ignore tout ce qui n'est pas un article : total, sous-total, TVA, rendu monnaie, carte/points de fidélité, remises globales, en-tête, SIRET, date, code-barres.
- name : nom lisible et normalisé en français. Corrige les abréviations (ex : « PN COMPLET 500G » → « Pain complet », « EMMENTAL RAPE » → « Emmental râpé »).
- quantity : la quantité telle qu'imprimée si présente (ex « x2 », « 1,5 kg »), sinon "".
- price : le prix unitaire en euros, format décimal avec un point (ex « 1.99 »), sinon "". N'invente jamais un prix.
- category : choisis EXACTEMENT une valeur parmi : ${categories.join(', ')}. Si tu hésites, "".
- store : le nom de l'enseigne si visible (ex « Carrefour »), sinon "".

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour ni balises de code, exactement de cette forme :
{"store": "...", "items": [{"name": "...", "quantity": "...", "price": "...", "category": "..."}]}
Si tu ne vois aucun article lisible, renvoie {"store": "", "items": []}.`

  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: image } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })
  } catch (e) {
    console.error('[parse-receipt] fetch error', String(e))
    return err('Service IA injoignable.', 502)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[parse-receipt] Anthropic', res.status, detail.slice(0, 500))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let amsg = ''
    try { amsg = (JSON.parse(detail) as any)?.error?.message ?? '' } catch { /* pas du JSON */ }
    const hint = res.status === 401 || res.status === 403
      ? 'clé IA invalide — reconfigure ANTHROPIC_API_KEY'
      : /credit balance/i.test(amsg)
      ? 'crédits IA épuisés — recharge le compte Anthropic (Plans & Billing)'
      : `service IA (code ${res.status}) : ${(amsg || detail).slice(0, 200)}`
    return err(`Lecture du ticket impossible : ${hint}.`, 502)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any
  if (data.stop_reason === 'refusal') return err('Contenu refusé par le service IA.', 422)

  const text: string = (data.content ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b?.type === 'text')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text)
    .join('')

  // Parsing défensif : enlève d'éventuelles balises ```json puis, en dernier
  // recours, isole l'objet du premier { au dernier }.
  function tryParse(raw: string): unknown | null {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
    try { return JSON.parse(cleaned) } catch { /* suite */ }
    const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}')
    if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)) } catch { /* non */ } }
    return null
  }

  const parsed = tryParse(text)
  if (!parsed) {
    console.error('[parse-receipt] JSON parse fail', text.slice(0, 200))
    return err('Réponse IA illisible.', 502)
  }

  return json(parsed)
})
