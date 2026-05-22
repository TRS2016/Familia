export function pgTimeToInput(t: string | null): string {
  return t ? t.slice(0, 5) : ''
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export type EventLayout = { col: number; totalCols: number }

export function layoutDayEvents(
  events: { id: string; start_time: string | null; end_time: string | null }[],
): Map<string, EventLayout> {
  const timed = events.filter(e => e.start_time)
  if (timed.length === 0) return new Map()

  const sorted = [...timed].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  const colAssignment = new Map<string, number>()
  const colEndMin: number[] = []

  for (const ev of sorted) {
    const s = timeToMinutes(ev.start_time!)
    const e = ev.end_time ? timeToMinutes(ev.end_time) : s + 60
    let col = colEndMin.findIndex(end => end <= s)
    if (col === -1) { col = colEndMin.length; colEndMin.push(e) }
    else colEndMin[col] = e
    colAssignment.set(ev.id, col)
  }

  const result = new Map<string, EventLayout>()
  for (const ev of sorted) {
    const s = timeToMinutes(ev.start_time!)
    const e = ev.end_time ? timeToMinutes(ev.end_time) : s + 60
    const myCol = colAssignment.get(ev.id)!
    const overlapping = sorted.filter(o => {
      if (o.id === ev.id) return false
      const os = timeToMinutes(o.start_time!)
      const oe = o.end_time ? timeToMinutes(o.end_time) : os + 60
      return os < e && oe > s
    })
    const totalCols = Math.max(myCol + 1, ...overlapping.map(o => (colAssignment.get(o.id) ?? 0) + 1))
    result.set(ev.id, { col: myCol, totalCols })
  }
  return result
}
