import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addWeeks, addMonths, addYears, format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'

export type RecurrenceType = 'none' | 'weekly' | 'monthly' | 'yearly'

export interface CalendarEvent {
  id: string
  household_id: string
  created_by: string | null
  member_id: string | null
  title: string
  date: string
  start_time: string | null
  end_time: string | null
  all_day: boolean
  location: string | null
  description: string | null
  reminder_minutes: number | null
  recurrence_group_id: string | null
  recurrence_type: string | null
  created_at: string
  member: { display_name: string } | null
  created_by_member: { display_name: string } | null
}

export interface NewEventInput {
  title: string
  date: string
  start_time: string | null
  end_time: string | null
  all_day: boolean
  member_id: string | null
  location: string | null
  description?: string | null
  recurrence?: RecurrenceType
  reminder_minutes?: number | null
}

const EVENT_SELECT = `
  *,
  member:members!events_member_id_fkey(display_name),
  created_by_member:members!events_created_by_fkey(display_name)
`.trim()

export const EVENTS_KEY_PREFIX = ['events', HOUSEHOLD_ID] as const

export function eventsKey(rangeStart: string) {
  return [...EVENTS_KEY_PREFIX, rangeStart] as const
}

function buildOccurrences(
  input: NewEventInput,
  groupId: string,
  createdBy: string | null,
) {
  const recurrence = input.recurrence!
  const count = recurrence === 'weekly' ? 52 : recurrence === 'monthly' ? 12 : 3
  const advance =
    recurrence === 'weekly'  ? (d: Date, n: number) => addWeeks(d, n)  :
    recurrence === 'monthly' ? (d: Date, n: number) => addMonths(d, n) :
                               (d: Date, n: number) => addYears(d, n)

  // Parse as local date to avoid timezone shifts
  const [y, m, d] = input.date.split('-').map(Number)
  const base = new Date(y, m - 1, d)

  return Array.from({ length: count }, (_, i) => ({
    household_id: HOUSEHOLD_ID,
    created_by: createdBy,
    recurrence_group_id: groupId,
    recurrence_type: recurrence,
    title: input.title.trim(),
    date: format(advance(base, i), 'yyyy-MM-dd'),
    start_time: input.start_time || null,
    end_time: input.end_time || null,
    all_day: input.all_day,
    member_id: input.member_id,
    location: input.location?.trim() || null,
    description: input.description?.trim() || null,
    reminder_minutes: input.reminder_minutes ?? 30,
  }))
}

// ── Récurrences : régénère les occurrences manquantes jusqu'à la plage affichée ──
// Les séries sont créées en lots finis (52 sem. / 12 mois / 3 ans). Pour qu'un
// événement récurrent ne s'arrête jamais, on prolonge chaque série à la volée
// quand l'utilisateur navigue au-delà de sa dernière occurrence.
const RECUR_ADVANCE: Record<string, (d: Date, n: number) => Date> = {
  weekly: (d, n) => addWeeks(d, n),
  monthly: (d, n) => addMonths(d, n),
  yearly: (d, n) => addYears(d, n),
}

export function useMaterializeRecurringEvents(rangeEnd: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['events-materialize', HOUSEHOLD_ID, rangeEnd],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .not('recurrence_group_id', 'is', null)
        .order('date', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as unknown as CalendarEvent[]

      // Dernière occurrence connue par série
      const latestByGroup = new Map<string, CalendarEvent>()
      for (const r of rows) {
        const g = r.recurrence_group_id as string
        const prev = latestByGroup.get(g)
        if (!prev || r.date > prev.date) latestByGroup.set(g, r)
      }

      const toInsert: Record<string, unknown>[] = []
      for (const latest of latestByGroup.values()) {
        const advance = RECUR_ADVANCE[latest.recurrence_type ?? '']
        if (!advance) continue
        if (latest.date >= rangeEnd) continue // série déjà couverte

        const [y, m, d] = latest.date.split('-').map(Number)
        const base = new Date(y, m - 1, d)
        // Génère en avant jusqu'à couvrir rangeEnd (cap de sécurité anti-runaway)
        for (let i = 1; i <= 520; i++) {
          const next = format(advance(base, i), 'yyyy-MM-dd')
          toInsert.push({
            household_id: HOUSEHOLD_ID,
            created_by: latest.created_by,
            recurrence_group_id: latest.recurrence_group_id,
            recurrence_type: latest.recurrence_type,
            title: latest.title,
            date: next,
            start_time: latest.start_time,
            end_time: latest.end_time,
            all_day: latest.all_day,
            member_id: latest.member_id,
            location: latest.location,
            description: latest.description,
            reminder_minutes: latest.reminder_minutes,
          })
          if (next >= rangeEnd) break
        }
      }

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase
          .from('events')
          .upsert(toInsert as never, { onConflict: 'recurrence_group_id,date', ignoreDuplicates: true })
        if (insErr) throw insErr
        queryClient.invalidateQueries({ queryKey: EVENTS_KEY_PREFIX })
      }
      return toInsert.length
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useEvents(rangeStart: string, rangeEnd: string) {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()
  const key = eventsKey(rangeStart)

  // ── Query ────────────────────────────────────────────────────────────────
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<CalendarEvent[]> => {
      const { data, error } = await supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('household_id', HOUSEHOLD_ID)
        .gte('date', rangeStart)
        .lte('date', rangeEnd)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: true })
      if (error) throw error
      return data as unknown as CalendarEvent[]
    },
  })

  // ── Add ──────────────────────────────────────────────────────────────────
  const addEvent = useMutation({
    mutationFn: async (input: NewEventInput): Promise<CalendarEvent | null> => {
      if (!input.recurrence || input.recurrence === 'none') {
        const { data, error } = await supabase
          .from('events')
          .insert({
            household_id: HOUSEHOLD_ID,
            created_by: member?.id ?? null,
            member_id: input.member_id,
            title: input.title.trim(),
            date: input.date,
            start_time: input.start_time || null,
            end_time: input.end_time || null,
            all_day: input.all_day,
            location: input.location?.trim() || null,
            description: input.description?.trim() || null,
            reminder_minutes: input.reminder_minutes ?? 30,
          })
          .select(EVENT_SELECT)
          .single()
        if (error) throw error
        return data as unknown as CalendarEvent
      }

      const groupId = crypto.randomUUID()
      const occurrences = buildOccurrences(input, groupId, member?.id ?? null)
      const { error } = await supabase.from('events').insert(occurrences)
      if (error) throw error
      return null
    },
    onMutate: async (input) => {
      if (input.recurrence && input.recurrence !== 'none') return

      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CalendarEvent[]>(key) ?? []
      const optimisticId = `optimistic-${Date.now()}`

      const optimistic: CalendarEvent = {
        id: optimisticId,
        household_id: HOUSEHOLD_ID,
        created_by: member?.id ?? null,
        member_id: input.member_id,
        title: input.title.trim(),
        date: input.date,
        start_time: input.start_time || null,
        end_time: input.end_time || null,
        all_day: input.all_day,
        location: input.location?.trim() || null,
        description: input.description?.trim() || null,
        reminder_minutes: input.reminder_minutes ?? 30,
        recurrence_group_id: null,
        recurrence_type: null,
        created_at: new Date().toISOString(),
        member: null,
        created_by_member: member ? { display_name: member.display_name } : null,
      }

      queryClient.setQueryData<CalendarEvent[]>(key, [...previous, optimistic])
      return { previous, optimisticId }
    },
    onError: (_err, input, context) => {
      if (!input.recurrence || input.recurrence === 'none') {
        queryClient.setQueryData(key, context?.previous ?? [])
      }
      showToast({ type: 'error', message: 'Impossible de créer l\'événement.' })
    },
    onSuccess: (newEvent, input, context) => {
      if (!input.recurrence || input.recurrence === 'none') {
        if (!context || !newEvent) return
        queryClient.setQueryData<CalendarEvent[]>(key, (old = []) =>
          old.map(e => e.id === context.optimisticId ? newEvent : e)
        )
      } else {
        queryClient.invalidateQueries({ queryKey: EVENTS_KEY_PREFIX })
      }
    },
  })

  // ── Update ───────────────────────────────────────────────────────────────
  const updateEvent = useMutation({
    mutationFn: async (vars: NewEventInput & {
      id: string
      scope: 'one' | 'series'
      recurrenceGroupId: string | null
    }): Promise<CalendarEvent | null> => {
      const { id, scope, recurrenceGroupId, ...input } = vars

      if (scope === 'series' && recurrenceGroupId) {
        const { error } = await supabase
          .from('events')
          .update({
            title: input.title.trim(),
            start_time: input.start_time || null,
            end_time: input.end_time || null,
            all_day: input.all_day,
            member_id: input.member_id,
            location: input.location?.trim() || null,
            description: input.description?.trim() || null,
            ...(input.recurrence ? { recurrence_type: input.recurrence } : {}),
            reminder_minutes: input.reminder_minutes,
          })
          .eq('recurrence_group_id', recurrenceGroupId)
        if (error) throw error
        return null
      }

      const { data, error } = await supabase
        .from('events')
        .update({
          member_id: input.member_id,
          title: input.title.trim(),
          date: input.date,
          start_time: input.start_time || null,
          end_time: input.end_time || null,
          all_day: input.all_day,
          location: input.location?.trim() || null,
          description: input.description?.trim() || null,
          reminder_minutes: input.reminder_minutes,
        })
        .eq('id', id)
        .select(EVENT_SELECT)
        .single()
      if (error) throw error
      return data as unknown as CalendarEvent
    },
    onMutate: async ({ id, scope, ...input }) => {
      if (scope === 'series') return

      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CalendarEvent[]>(key) ?? []

      queryClient.setQueryData<CalendarEvent[]>(key, previous.map(e =>
        e.id === id
          ? {
              ...e,
              title: input.title.trim(),
              date: input.date,
              start_time: input.start_time || null,
              end_time: input.end_time || null,
              all_day: input.all_day,
              location: input.location?.trim() || null,
              description: input.description?.trim() || null,
              member_id: input.member_id,
              ...(input.reminder_minutes !== undefined ? { reminder_minutes: input.reminder_minutes } : {}),
            }
          : e
      ))
      return { previous }
    },
    onError: (_err, vars, context) => {
      if (vars.scope !== 'series') {
        queryClient.setQueryData(key, context?.previous ?? [])
      }
      showToast({ type: 'error', message: 'Impossible de mettre à jour l\'événement.' })
    },
    onSuccess: (updated, vars) => {
      if (vars.scope === 'series') {
        queryClient.invalidateQueries({ queryKey: EVENTS_KEY_PREFIX })
      } else if (updated) {
        queryClient.setQueryData<CalendarEvent[]>(key, (old = []) =>
          old.map(e => e.id === updated.id ? updated : e)
        )
      }
    },
  })

  // ── Delete ───────────────────────────────────────────────────────────────
  const deleteEvent = useMutation({
    mutationFn: async ({ id, groupId }: { id: string; groupId?: string | null }) => {
      if (groupId) {
        const { error } = await supabase
          .from('events')
          .delete()
          .eq('recurrence_group_id', groupId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('events').delete().eq('id', id)
        if (error) throw error
      }
    },
    onMutate: async ({ id, groupId }) => {
      if (groupId) return
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CalendarEvent[]>(key) ?? []
      queryClient.setQueryData<CalendarEvent[]>(key, previous.filter(e => e.id !== id))
      return { previous }
    },
    onError: (_err, vars, context) => {
      if (!vars.groupId) queryClient.setQueryData(key, context?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de supprimer l\'événement.' })
    },
    onSuccess: (_data, vars) => {
      if (vars.groupId) queryClient.invalidateQueries({ queryKey: EVENTS_KEY_PREFIX })
    },
  })

  return { query, addEvent, updateEvent, deleteEvent }
}
