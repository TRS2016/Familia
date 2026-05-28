import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MomentReaction {
  emoji: string
  member_id: string
}

export interface Moment {
  id: string
  household_id: string
  member_id: string
  text: string | null
  photo_path: string | null
  photo_archived: boolean
  archived_at: string | null
  created_at: string
  member: { id: string; display_name: string } | null
  reactions: MomentReaction[]
}

export interface NewMomentInput {
  text: string
  photo: File | null
}

export const EMOJIS = ['❤️', '😄', '👍', '😮'] as const
export type Emoji = typeof EMOJIS[number]

// ── Query keys ────────────────────────────────────────────────────────────────

export const MOMENTS_KEY = ['moments', HOUSEHOLD_ID] as const

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useMoments() {
  return useQuery({
    queryKey: MOMENTS_KEY,
    queryFn: async (): Promise<Moment[]> => {
      const { data, error } = await supabase
        .from('moments')
        .select('*, member:members(id, display_name), reactions:moment_reactions(emoji, member_id)')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
        .limit(60)
      if (error) throw error
      return data as unknown as Moment[]
    },
  })
}

export function useSignedPhotoUrl(path: string | null) {
  return useQuery({
    queryKey: ['moment-photo-url', path],
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from('family-moments')
        .createSignedUrl(path!, 1800)
      if (error) throw error
      return data.signedUrl
    },
    enabled: !!path,
    staleTime: 25 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })
}

export function useAddMoment() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: NewMomentInput): Promise<Moment> => {
      let photo_path: string | null = null

      if (input.photo) {
        let file: File = input.photo
        if (file.size > 1_048_576) {
          const { default: imageCompression } = await import('browser-image-compression')
          file = await imageCompression(file, {
            maxSizeMB: 1,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
          })
        }
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const path = `${HOUSEHOLD_ID}/${member!.id}/${crypto.randomUUID()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('family-moments')
          .upload(path, file, { contentType: file.type })
        if (uploadErr) throw uploadErr
        photo_path = path
      }

      const { data, error } = await supabase
        .from('moments')
        .insert({
          household_id: HOUSEHOLD_ID,
          member_id: member!.id,
          text: input.text.trim() || null,
          photo_path,
        })
        .select('*, member:members(id, display_name), reactions:moment_reactions(emoji, member_id)')
        .single()
      if (error) throw error
      return data as unknown as Moment
    },
    onMutate: async (input: NewMomentInput) => {
      await queryClient.cancelQueries({ queryKey: MOMENTS_KEY })
      const previous = queryClient.getQueryData<Moment[]>(MOMENTS_KEY) ?? []
      const optimistic: Moment = {
        id: `optimistic-${Date.now()}`,
        household_id: HOUSEHOLD_ID,
        member_id: member?.id ?? '',
        text: input.text.trim() || null,
        photo_path: null,
        photo_archived: false,
        archived_at: null,
        created_at: new Date().toISOString(),
        member: member ? { id: member.id, display_name: member.display_name } : null,
        reactions: [],
      }
      queryClient.setQueryData<Moment[]>(MOMENTS_KEY, [optimistic, ...previous])
      return { previous, optimisticId: optimistic.id }
    },
    onSuccess: (newMoment, _input, context) => {
      queryClient.setQueryData<Moment[]>(MOMENTS_KEY, old =>
        (old ?? []).map(m => m.id === context?.optimisticId ? newMoment : m)
      )
    },
    onError: (_err, _input, ctx) => {
      queryClient.setQueryData(MOMENTS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de publier le moment.' })
    },
  })
}

export function useDeleteMoment() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, photo_path }: { id: string; photo_path: string | null }) => {
      if (photo_path) {
        await supabase.storage.from('family-moments').remove([photo_path])
      }
      const { error } = await supabase.from('moments').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: MOMENTS_KEY })
      const previous = queryClient.getQueryData<Moment[]>(MOMENTS_KEY) ?? []
      queryClient.setQueryData<Moment[]>(MOMENTS_KEY, previous.filter(m => m.id !== id))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(MOMENTS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de supprimer le moment.' })
    },
  })
}

export function useToggleReaction() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()

  // moment_reactions added in migration 20260528 — not yet in generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reactionsTable = () => (supabase as any).from('moment_reactions')

  return useMutation({
    mutationFn: async ({ momentId, emoji }: { momentId: string; emoji: Emoji }) => {
      const memberId = member!.id
      const existing = queryClient.getQueryData<Moment[]>(MOMENTS_KEY)
        ?.find(m => m.id === momentId)
        ?.reactions.find(r => r.emoji === emoji && r.member_id === memberId)

      if (existing) {
        await reactionsTable()
          .delete()
          .eq('moment_id', momentId)
          .eq('member_id', memberId)
          .eq('emoji', emoji)
      } else {
        await reactionsTable()
          .insert({ moment_id: momentId, member_id: memberId, emoji })
      }
    },
    onMutate: async ({ momentId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: MOMENTS_KEY })
      const previous = queryClient.getQueryData<Moment[]>(MOMENTS_KEY) ?? []
      const memberId = member?.id ?? ''
      queryClient.setQueryData<Moment[]>(MOMENTS_KEY, previous.map(m => {
        if (m.id !== momentId) return m
        const has = m.reactions.some(r => r.emoji === emoji && r.member_id === memberId)
        return {
          ...m,
          reactions: has
            ? m.reactions.filter(r => !(r.emoji === emoji && r.member_id === memberId))
            : [...m.reactions, { emoji, member_id: memberId }],
        }
      }))
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(MOMENTS_KEY, ctx?.previous ?? [])
    },
  })
}
