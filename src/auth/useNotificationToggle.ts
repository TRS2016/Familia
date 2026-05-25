import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { QK } from '../lib/query-keys'
import { useMember } from './useMember'
import type { Member } from './useMember'
import { useAuth } from './useAuth'

export function useNotificationToggle() {
  const { data: member } = useMember()
  const { session } = useAuth()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!member) throw new Error('No member')
      const { error } = await supabase
        .from('members')
        .update({ notifications_enabled: enabled })
        .eq('id', member.id)
      if (error) throw error
    },
    onMutate: async (enabled: boolean) => {
      if (!session) return
      const key = QK.member(session.user.id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Member>(key)
      queryClient.setQueryData<Member>(key, old =>
        old ? { ...old, notifications_enabled: enabled } : old!
      )
      return { previous }
    },
    onError: (_err, _enabled, context) => {
      if (context?.previous !== undefined && session) {
        queryClient.setQueryData<Member>(QK.member(session.user.id), context.previous)
      }
    },
    onSettled: () => {
      if (session) {
        queryClient.invalidateQueries({ queryKey: QK.member(session.user.id) })
      }
    },
  })

  return {
    enabled: member?.notifications_enabled ?? false,
    toggle: () => mutation.mutate(!(member?.notifications_enabled ?? false)),
    isPending: mutation.isPending,
  }
}
