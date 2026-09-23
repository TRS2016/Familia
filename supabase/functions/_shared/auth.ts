// ─────────────────────────────────────────────────────────────────────────────
// Contrôle d'appelant pour les Edge Functions.
//
// `verify_jwt` (activé par défaut) ne protège RIEN dans ce projet : la gateway
// accepte la clé publishable, qui est une constante de build présente dans le
// bundle client. Toute fonction sans contrôle explicite est donc appelable par
// quiconque ouvre le site — y compris celles qui consomment une API facturée
// ou envoient des notifications push.
//
// Deux gardes :
//  - requireMember  : réservé aux membres connectés (JWT utilisateur réel).
//  - requireCronKey : réservé aux appels internes (crons pg_cron, service role).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Exige un JWT d'utilisateur authentifié et renvoie le membre correspondant.
 * La clé publishable n'est associée à aucun utilisateur : `getUser` la rejette.
 * Retourne null si l'appelant n'est pas un membre du foyer.
 */
export async function requireMember(req: Request): Promise<{ userId: string; memberId: string; householdId: string } | null> {
  const auth = req.headers.get('Authorization') ?? ''
  const jwt = auth.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return null

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data.user) return null

  const { data: member } = await supabase
    .from('members')
    .select('id, household_id')
    .eq('user_id', data.user.id)
    .maybeSingle()
  if (!member) return null

  return {
    userId: data.user.id,
    memberId: member.id as string,
    householdId: member.household_id as string,
  }
}

/**
 * Réservé aux déclencheurs internes (crons). Le secret `CRON_SECRET` est envoyé
 * en en-tête `x-cron-key` ; un appel portant le JWT du service role est également
 * accepté (invocation manuelle depuis le tableau de bord ou la CLI).
 *
 * Si `CRON_SECRET` n'est pas configuré, la fonction reste ouverte : c'est
 * volontaire, pour qu'un déploiement avant la création du secret ne coupe pas
 * les rappels en silence. Le log signale la situation.
 */
export function requireCronKey(req: Request): boolean {
  const expected = Deno.env.get('CRON_SECRET')
  if (!expected) {
    console.warn('[auth] CRON_SECRET non configuré : appel accepté sans contrôle.')
    return true
  }
  if (req.headers.get('x-cron-key') === expected) return true

  // Service role (clé secrète, jamais exposée au client).
  const auth = req.headers.get('Authorization') ?? ''
  const jwt = auth.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return false
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1])) as { role?: string }
    return payload.role === 'service_role'
  } catch {
    return false
  }
}
