import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// ── Types ─────────────────────────────────────────────────────────────────

interface NotifyBody {
  title: string
  body: string
  module?: string
  data?: Record<string, unknown>
}

interface Member {
  id: string
  user_id: string
  household_id: string
  display_name: string
  notifications_enabled: boolean
}

interface PushSubscription {
  id: string
  member_id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface DryRunEntry {
  member_id: string
  display_name: string
  endpoint: string
  payload: { title: string; body: string; module?: string; data?: Record<string, unknown> }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function err(message: string, status: number): Response {
  return json({ error: message }, status)
}

/**
 * Returns all members of the household who should receive a notification,
 * excluding the sender. Isolated here so Phase 4 can add `targets` filtering
 * without touching the main handler.
 */
async function getRecipients(
  supabase: ReturnType<typeof createClient>,
  senderId: string,
  householdId: string,
): Promise<Member[]> {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('household_id', householdId)
    .eq('notifications_enabled', true)
    .neq('id', senderId)

  if (error) {
    console.error('[notify-household] getRecipients DB error:', error.message)
    throw new Error('Failed to fetch recipients')
  }

  return (data ?? []) as Member[]
}

async function getSubscriptions(
  supabase: ReturnType<typeof createClient>,
  memberIds: string[],
): Promise<PushSubscription[]> {
  if (memberIds.length === 0) return []

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('member_id', memberIds)

  if (error) {
    console.error('[notify-household] getSubscriptions DB error:', error.message)
    throw new Error('Failed to fetch push subscriptions')
  }

  return (data ?? []) as PushSubscription[]
}

// ── Handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return err('Method not allowed', 405)
  }

  // ── 1. Auth ──────────────────────────────────────────────────────────────

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return err('Missing or malformed Authorization header', 401)
  }
  const jwt = authHeader.replace('Bearer ', '')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
  if (authError || !user) {
    console.warn('[notify-household] Auth failed:', authError?.message)
    return err('Unauthorized', 401)
  }
  console.log('[notify-household] Authenticated user:', user.id)

  // ── 2. Resolve sender member ─────────────────────────────────────────────

  const { data: sender, error: memberError } = await supabase
    .from('members')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (memberError || !sender) {
    console.error('[notify-household] No member for user:', user.id, memberError?.message)
    return err('Member not found', 403)
  }
  console.log('[notify-household] Sender member:', sender.id, sender.display_name)

  // ── 3. Validate body ─────────────────────────────────────────────────────

  let body: NotifyBody
  try {
    body = await req.json() as NotifyBody
  } catch {
    return err('Invalid JSON body', 400)
  }

  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return err('"title" is required and must be a non-empty string', 400)
  }
  if (!body.body || typeof body.body !== 'string' || body.body.trim() === '') {
    return err('"body" is required and must be a non-empty string', 400)
  }

  const payload = {
    title: body.title.trim(),
    body: body.body.trim(),
    ...(body.module ? { module: body.module } : {}),
    ...(body.data ? { data: body.data } : {}),
  }
  console.log('[notify-household] Payload:', JSON.stringify(payload))

  // ── 4. Discover recipients & subscriptions ───────────────────────────────

  let recipients: Member[]
  try {
    recipients = await getRecipients(supabase, sender.id, sender.household_id)
  } catch {
    return err('Failed to fetch recipients', 500)
  }
  console.log('[notify-household] Recipients count:', recipients.length)

  const recipientIds = recipients.map((m: Member) => m.id)
  let subscriptions: PushSubscription[]
  try {
    subscriptions = await getSubscriptions(supabase, recipientIds)
  } catch {
    return err('Failed to fetch subscriptions', 500)
  }
  console.log('[notify-household] Subscriptions count:', subscriptions.length)

  // ── 5. Dry-run response ──────────────────────────────────────────────────

  const memberById = Object.fromEntries(recipients.map((m: Member) => [m.id, m]))

  const wouldHaveSent: DryRunEntry[] = subscriptions.map((sub: PushSubscription) => ({
    member_id: sub.member_id,
    display_name: memberById[sub.member_id]?.display_name ?? 'unknown',
    endpoint: sub.endpoint,
    payload,
  }))

  console.log('[notify-household] Dry-run complete. Would have sent:', wouldHaveSent.length, 'push(es)')

  return json({
    dry_run: true,
    sender_member_id: sender.id,
    sender_display_name: sender.display_name,
    recipients_count: recipients.length,
    subscriptions_count: subscriptions.length,
    would_have_sent: wouldHaveSent,
  })
})
