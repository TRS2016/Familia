import { createClient } from '@supabase/supabase-js'
import { URL } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'

function esc(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// iCal lines must be ≤ 75 octets, fold longer ones with CRLF + space
function fold(line: string): string {
  const chunks: string[] = []
  let rest = line
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75))
    rest = ' ' + rest.slice(75)
  }
  chunks.push(rest)
  return chunks.join('\r\n')
}

function nextDayStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  return `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const token = url.searchParams.get('token')

  if (!token) {
    res.writeHead(401, { 'Content-Type': 'text/plain' })
    res.end('Unauthorized')
    return
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // Le token identifie un membre (révocable) → on en déduit le foyer.
  const { data: tokenMember } = await supabase
    .from('members')
    .select('household_id')
    .eq('ical_token', token)
    .maybeSingle()

  if (!tokenMember) {
    res.writeHead(401, { 'Content-Type': 'text/plain' })
    res.end('Unauthorized')
    return
  }

  const today = new Date()
  const from = new Date(today)
  from.setMonth(from.getMonth() - 3)
  const to = new Date(today)
  to.setFullYear(to.getFullYear() + 1)

  const { data: events, error } = await supabase
    .from('events')
    .select('*, member:members!events_member_id_fkey(display_name)')
    .eq('household_id', tokenMember.household_id)
    .gte('date', from.toISOString().slice(0, 10))
    .lte('date', to.toISOString().slice(0, 10))
    .order('date', { ascending: true })

  if (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Internal Server Error')
    return
  }

  const dtstamp = today.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Familia//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Familia',
  ]

  for (const ev of events ?? []) {
    const dateNoDash = ev.date.replace(/-/g, '')
    const member = ev.member as { display_name: string } | null

    let dtstart: string
    let dtend: string

    if (ev.all_day || !ev.start_time) {
      dtstart = `DTSTART;VALUE=DATE:${dateNoDash}`
      dtend = `DTEND;VALUE=DATE:${nextDayStr(ev.date)}`
    } else {
      const st = ev.start_time.slice(0, 5).replace(':', '') + '00'
      dtstart = `DTSTART:${dateNoDash}T${st}`
      if (ev.end_time) {
        const et = ev.end_time.slice(0, 5).replace(':', '') + '00'
        dtend = `DTEND:${dateNoDash}T${et}`
      } else {
        const [h, m] = ev.start_time.slice(0, 5).split(':').map(Number)
        dtend = `DTEND:${dateNoDash}T${String(Math.min(h + 1, 23)).padStart(2, '0')}${String(m).padStart(2, '0')}00`
      }
    }

    const summary = member ? `${ev.title} (${member.display_name})` : ev.title

    lines.push('BEGIN:VEVENT')
    lines.push(fold(`UID:${ev.id}@familia`))
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(dtstart)
    lines.push(dtend)
    lines.push(fold(`SUMMARY:${esc(summary)}`))
    if (ev.location) lines.push(fold(`LOCATION:${esc(ev.location)}`))
    if (ev.description) lines.push(fold(`DESCRIPTION:${esc(ev.description)}`))
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  const body = lines.join('\r\n')
  res.writeHead(200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="familia.ics"',
    'Cache-Control': 'public, max-age=3600',
  })
  res.end(body)
}
