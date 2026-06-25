// ─────────────────────────────────────────────────────────────────────────────
// parse-recipes : lit un PDF de recettes (ebook) et renvoie les recettes
// structurées (titre, type de repas, ingrédients, étapes) pour les importer.
//
// Le PDF n'est JAMAIS stocké : envoyé en base64 au modèle puis jeté. Protégée
// par la vérification JWT par défaut. Clé requise : secret ANTHROPIC_API_KEY.
// ─────────────────────────────────────────────────────────────────────────────

import { corsHeaders } from '../_shared/cors.ts'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
// Extraction multi-pages structurée : Opus 4.8 (contexte 1M / 600 pages PDF,
// là où Haiku plafonne à 100 pages) — précision sur un import one-shot.
const MODEL = 'claude-opus-4-8'

const MEAL_TYPES = ['petit_dej', 'dejeuner', 'collation', 'diner'] as const

interface Body {
  pdf?: string // base64 (sans préfixe data:)
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
    console.error('[parse-recipes] ANTHROPIC_API_KEY manquant')
    return err('Service non configuré (clé IA absente).', 500)
  }

  let body: Body
  try { body = await req.json() as Body } catch { return err('Corps JSON invalide', 400) }

  const pdf = body.pdf
  if (!pdf || typeof pdf !== 'string') return err('PDF manquant', 400)

  const prompt = `Tu lis un PDF de recettes de cuisine (en français). Extrais TOUTES les recettes que tu trouves.

Pour chaque recette :
- title : le nom de la recette, lisible et propre.
- meal_type : classe la recette dans EXACTEMENT une de ces valeurs : ${MEAL_TYPES.join(', ')} (petit_dej = petit-déjeuner, dejeuner = déjeuner, collation = en-cas/goûter, diner = dîner). Déduis du contexte ou du chapitre.
- ingredients : la liste des ingrédients, chacun { "name": "nom de l'ingrédient", "quantity": "quantité telle qu'écrite (ex 200g, 2, 1 cuillère)" }. Si pas de quantité, "".
- steps : la liste ordonnée des étapes de préparation, une chaîne par étape, sans numéro.

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte ni balise de code autour, exactement de cette forme :
{"recipes": [{"title": "...", "meal_type": "...", "ingredients": [{"name": "...", "quantity": "..."}], "steps": ["...", "..."]}]}
Si tu ne trouves aucune recette, renvoie {"recipes": []}.`

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
        max_tokens: 16000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })
  } catch (e) {
    console.error('[parse-recipes] fetch error', String(e))
    return err('Service IA injoignable.', 502)
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('[parse-recipes] Anthropic', res.status, detail.slice(0, 500))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let amsg = ''
    try { amsg = (JSON.parse(detail) as any)?.error?.message ?? '' } catch { /* pas du JSON */ }
    const hint = res.status === 401 || res.status === 403
      ? 'clé IA invalide — reconfigure ANTHROPIC_API_KEY'
      : /credit balance/i.test(amsg)
      ? 'crédits IA épuisés — recharge le compte Anthropic (Plans & Billing)'
      : res.status === 413 || /too large|request_too_large/i.test(amsg)
      ? 'PDF trop volumineux (max ~32 Mo) — découpe-le ou réduis sa taille'
      : `service IA (code ${res.status}) : ${(amsg || detail).slice(0, 200)}`
    return err(`Lecture du PDF impossible : ${hint}.`, 502)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any
  if (data.stop_reason === 'refusal') return err('Contenu refusé par le service IA.', 422)
  const truncated = data.stop_reason === 'max_tokens'

  const text: string = (data.content ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b?.type === 'text')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text)
    .join('')

  function tryParse(raw: string): unknown | null {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
    try { return JSON.parse(cleaned) } catch { /* suite */ }
    const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}')
    if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)) } catch { /* non */ } }
    return null
  }

  const parsed = tryParse(text) as { recipes?: unknown } | null
  if (!parsed || !Array.isArray(parsed.recipes)) {
    console.error('[parse-recipes] JSON parse fail', text.slice(0, 200))
    return err(truncated
      ? 'Trop de recettes pour une seule extraction — découpe le PDF en sections.'
      : 'Réponse IA illisible.', 502)
  }

  return json({ recipes: parsed.recipes, truncated })
})
