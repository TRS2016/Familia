import { useEffect, useRef } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from './supabase'

type Payload = RealtimePostgresChangesPayload<Record<string, unknown>>

export interface RealtimeSub {
  /** Table Postgres à écouter. */
  table: string
  /** Type d'événement (défaut '*'). */
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  /** Liste statique de query keys à invalider sur tout changement. */
  keys?: QueryKey[]
  /** Query keys dérivées du payload (ex. moment_comments → clé par moment_id). */
  keysFromPayload?: (payload: Payload) => QueryKey[]
}

/**
 * S'abonne aux changements Postgres et invalide les query keys concernées,
 * en coalesçant les rafales d'événements (debounce) pour éviter des refetchs
 * redondants — notamment l'écho de ses propres écritures optimistes ou un
 * insert en lot (charger une liste de courses = N événements → 1 refetch).
 */
export function useRealtimeInvalidation(channelName: string, subs: RealtimeSub[]) {
  const queryClient = useQueryClient()
  const subsRef = useRef(subs)
  subsRef.current = subs

  useEffect(() => {
    const pending = new Map<string, QueryKey>()
    let timer: ReturnType<typeof setTimeout> | null = null

    const flush = () => {
      timer = null
      for (const key of pending.values()) {
        queryClient.invalidateQueries({ queryKey: key })
      }
      pending.clear()
    }

    const schedule = (keys: QueryKey[]) => {
      for (const k of keys) pending.set(JSON.stringify(k), k)
      if (!timer) timer = setTimeout(flush, 250)
    }

    let channel = supabase.channel(channelName)
    for (const sub of subsRef.current) {
      channel = channel.on(
        // @ts-expect-error — surcharge générique de .on() pour postgres_changes
        'postgres_changes',
        { event: sub.event ?? '*', schema: 'public', table: sub.table },
        (payload: Payload) => {
          const keys = sub.keysFromPayload ? sub.keysFromPayload(payload) : (sub.keys ?? [])
          if (keys.length > 0) schedule(keys)
        },
      )
    }
    channel.subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [queryClient, channelName])
}
