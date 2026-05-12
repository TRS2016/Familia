import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'

export interface CalendarEvent {
  id: string
  household_id: string
  created_by: string | null
  member_id: string | null
  title: string
  date: string         // YYYY-MM-DD
  start_time: string | null  // HH:MM:SS from Postgres
  end_time: string | null
  all_day: boolean
  location: string | null
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
}

const EVENT_SELECT = `
  *,
  member:members!events_member_id_fkey(display_name),
  created_by_member:members!events_created_by_fkey(display_name)
`.trim()

// Exported so useEventsRealtime can invalidate any week for this household.
export const EVENTS_KEY_PREFIX = ['events', HOUSEHOLD_ID] as const

export function eventsKey(weekStart: string) {
  return [...EVENTS_KEY_PREFIX, weekStart] as const
}

export function useEvents(rangeStart: string, rangeEnd: string) {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
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
    mutationFn: async (input: NewEventInput): Promise<CalendarEvent> => {
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
        })
        .select(EVENT_SELECT)
        .single()
      if (error) throw error
      return data as unknown as CalendarEvent
    },
    onMutate: async (input) => {
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
        created_at: new Date().toISOString(),
        member: null,
        created_by_member: member ? { display_name: member.display_name } : null,
      }

      queryClient.setQueryData<CalendarEvent[]>(key, [...previous, optimistic])
      return { previous, optimisticId }
    },
    onError: (_err, _input, context) => {
      queryClient.setQueryData(key, context?.previous ?? [])
      alert('Erreur lors de la création de l\'événement.')
    },
    onSuccess: (newEvent, _input, context) => {
      if (!context) return
      queryClient.setQueryData<CalendarEvent[]>(key, (old = []) =>
        old.map(e => e.id === context.optimisticId ? newEvent : e)
      )
    },
  })

  // ── Update ───────────────────────────────────────────────────────────────
  const updateEvent = useMutation({
    mutationFn: async (vars: NewEventInput & { id: string }): Promise<CalendarEvent> => {
      const { id, ...input } = vars
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
        })
        .eq('id', id)
        .select(EVENT_SELECT)
        .single()
      if (error) throw error
      return data as unknown as CalendarEvent
    },
    onMutate: async ({ id, ...input }) => {
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
              member_id: input.member_id,
            }
          : e
      ))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(key, context?.previous ?? [])
      alert('Erreur lors de la mise à jour.')
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<CalendarEvent[]>(key, (old = []) =>
        old.map(e => e.id === updated.id ? updated : e)
      )
    },
  })

  // ── Delete ───────────────────────────────────────────────────────────────
  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CalendarEvent[]>(key) ?? []
      queryClient.setQueryData<CalendarEvent[]>(key, previous.filter(e => e.id !== id))
      return { previous }
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(key, context?.previous ?? [])
      alert('Erreur lors de la suppression.')
    },
  })

  return { query, addEvent, updateEvent, deleteEvent }
}
