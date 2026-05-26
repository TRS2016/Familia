import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { corsHeaders } from '../_shared/cors.ts'

// ── Types ─────────────────────────────────────────────────────────────────

interface NotifyBody {
  title: string
  body: string
  module?: string
  data?: Record<string, unknown>
  dry_run?: boolean
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

type SendStatus = 'sent' | 'failed' | 'removed'

interface SendDetail {
  member_id: string
  display_name: string
  endpoint_hash: string  // last 8 chars only — enough to correlate logs without leaking URLs
  status: SendStatus
  error?: string
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

function endpointHash(endpoint: string): string {
  return endpoint.slice(-8)
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
  const isDryRun = body.dry_run === true
  console.log('[notify-household] Payload:', JSON.stringify(payload), isDryRun ? '(dry-run)' : '')

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

  // ── 4b. Dry-run shortcut ─────────────────────────────────────────────────

  const memberById = Object.fromEntries(recipients.map((m: Member) => [m.id, m]))

  if (isDryRun) {
    const wouldHaveSent = subscriptions.map((sub: PushSubscription) => ({
      member_id: sub.member_id,
      display_name: memberById[sub.member_id]?.display_name ?? 'unknown',
      endpoint: sub.endpoint,
      payload,
    }))
    console.log('[notify-household] Dry-run. Would have sent:', wouldHaveSent.length, 'push(es)')
    return json({
      dry_run: true,
      sender_member_id: sender.id,
      sender_display_name: sender.display_name,
      recipients_count: recipients.length,
      subscriptions_count: subscriptions.length,
      would_have_sent: wouldHaveSent,
    })
  }

  // ── 5. Send notifications ─────────────────────────────────────────────────

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('[notify-household] Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY env vars')
    return err('Server misconfiguration: VAPID keys not set', 500)
  }

  const vapidContact = Deno.env.get('VAPID_CONTACT_EMAIL') ?? 'mailto:dyrecas@gmail.com'
  webpush.setVapidDetails(vapidContact, vapidPublicKey, vapidPrivateKey)

  console.log('[notify-household] Sending push to', subscriptions.length, 'subscription(s)...')

  const payloadString = JSON.stringify(payload)
  const deadEndpoints: string[] = []
  const details: SendDetail[] = []
  let sent = 0
  let failed = 0

  // Each promise resolves to { sub, statusCode } or rejects to { sub, error }.
  // Including sub in both paths avoids an O(n²) indexOf lookup in the result loop.
  const results = await Promise.allSettled(
    subscriptions.map((sub: PushSubscription) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payloadString,
      ).then(
        res => ({ sub, statusCode: res.statusCode }),
        (err: unknown) => { throw { sub, error: err as { statusCode?: number; message?: string } } },
      )
    )
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { sub, statusCode } = result.value
      const displayName = memberById[sub.member_id]?.display_name ?? 'unknown'
      console.log(
        '[notify-household] Push sent to', displayName,
        `(…${endpointHash(sub.endpoint)}) — HTTP ${statusCode}`,
      )
      sent++
      details.push({ member_id: sub.member_id, display_name: displayName, endpoint_hash: endpointHash(sub.endpoint), status: 'sent' })
    } else {
      const { sub, error: rawError } = result.reason as { sub: PushSubscription; error: { statusCode?: number; message?: string } }
      const statusCode = rawError?.statusCode
      const displayName = memberById[sub.member_id]?.display_name ?? 'unknown'

      if (statusCode === 410 || statusCode === 404) {
        // Dead subscription — schedule for cleanup
        deadEndpoints.push(sub.endpoint)
        console.log(
          '[notify-household] Dead subscription detected for', displayName,
          `(…${endpointHash(sub.endpoint)}) — HTTP ${statusCode}`,
        )
        details.push({ member_id: sub.member_id, display_name: displayName, endpoint_hash: endpointHash(sub.endpoint), status: 'removed' })
      } else {
        failed++
        const errorMsg = rawError?.message ?? String(result.reason)
        console.error(
          '[notify-household] Push failed for', displayName,
          `(…${endpointHash(sub.endpoint)}) — HTTP ${statusCode ?? 'unknown'}: ${errorMsg}`,
        )
        details.push({ member_id: sub.member_id, display_name: displayName, endpoint_hash: endpointHash(sub.endpoint), status: 'failed', error: errorMsg })
      }
    }
  }

  // ── 6. Batch DELETE dead subscriptions ───────────────────────────────────

  let removedDeadSubscriptions = 0

  if (deadEndpoints.length > 0) {
    console.log('[notify-household] Cleaning up', deadEndpoints.length, 'dead subscription(s)...')
    const { error: deleteError, count } = await supabase
      .from('push_subscriptions')
      .delete({ count: 'exact' })
      .in('endpoint', deadEndpoints)

    if (deleteError) {
      console.error('[notify-household] Failed to delete dead subscriptions:', deleteError.message)
      // Dead subs remain in DB — they'll be cleaned up next send. Non-fatal.
    } else {
      removedDeadSubscriptions = count ?? 0
    }
  }

  console.log(
    `[notify-household] Done. Sent: ${sent}, Failed: ${failed}, Removed: ${removedDeadSubscriptions}`,
  )

  return json({
    sent,
    failed,
    removed_dead_subscriptions: removedDeadSubscriptions,
    sender_member_id: sender.id,
    details,
  })
})
