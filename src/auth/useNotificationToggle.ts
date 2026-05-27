import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { QK } from '../lib/query-keys'
import { useMember } from './useMember'
import type { Member } from './useMember'
import { useAuth } from './useAuth'
import { useToast } from '../components/useToast'
import { subscribeToPush, unsubscribeFromPush, PushError } from '../lib/push'

function errorMessage(err: unknown): { message: string; persistent: boolean } {
  if (err instanceof PushError) {
    switch (err.code) {
      case 'NOT_SUPPORTED':
        return { message: 'Ce navigateur ne supporte pas les notifications push.', persistent: false }
      case 'IOS_NOT_INSTALLED':
        return { message: 'Sur iOS, installe l\'application sur l\'écran d\'accueil pour activer les notifications.', persistent: false }
      case 'PERMISSION_DENIED':
        return {
          message: 'Notifications bloquées dans ce navigateur. Réactive-les dans Réglages > [Navigateur] > Notifications.',
          persistent: true,
        }
      case 'PERMISSION_DISMISSED':
        return { message: 'Permission de notification refusée.', persistent: false }
      case 'SW_TIMEOUT':
        return { message: 'Le service worker n\'est pas prêt. Recharge la page et réessaie.', persistent: false }
      default:
        return { message: 'Impossible d\'activer les notifications. Réessaie.', persistent: false }
    }
  }
  return { message: 'Impossible d\'activer les notifications. Réessaie.', persistent: false }
}

export function useNotificationToggle() {
  const { data: member } = useMember()
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  // Detect desync: flag=true in DB but permission revoked in browser between sessions
  useEffect(() => {
    if (!member?.notifications_enabled) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'denied') return

    void (async () => {
      const { error } = await supabase
        .from('members')
        .update({ notifications_enabled: false })
        .eq('id', member.id)
      if (!error && session) {
        queryClient.setQueryData<Member>(QK.member(session.user.id), old =>
          old ? { ...old, notifications_enabled: false } : old!
        )
      }
    })()
  }, [member?.id, member?.notifications_enabled, session, queryClient])

  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!member) throw new Error('No member')
      if (enabled) {
        await subscribeToPush()
      } else {
        await unsubscribeFromPush()
      }
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
    onError: (err, _enabled, context) => {
      if (context?.previous !== undefined && session) {
        queryClient.setQueryData<Member>(QK.member(session.user.id), context.previous)
      }
      const { message, persistent } = errorMessage(err)
      showToast({ type: 'error', message, persistent })
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
