import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, subYears } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MomentReaction {
  emoji: string
  member_id: string
}

export interface MomentPhoto {
  id: string
  moment_id: string
  photo_path: string
  position: number
  created_at: string
}

export interface MomentComment {
  id: string
  moment_id: string
  member_id: string
  text: string
  created_at: string
  member: { id: string; display_name: string } | null
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
  photos: MomentPhoto[]
}

export interface NewMomentInput {
  text: string
  photos: File[]
}

// Réactions rapides toujours affichées + jeu étendu pour le sélecteur.
export const EMOJIS = ['❤️', '😄', '👍', '😮'] as const
export type Emoji = typeof EMOJIS[number]
export const EMOJI_PICKER = [
  '❤️', '😄', '👍', '😮', '😢', '😡', '🎉', '🔥',
  '😍', '🙏', '👏', '💯', '😂', '🥳', '🤩', '🤔',
] as const

// ── Query keys ────────────────────────────────────────────────────────────────

export const MOMENTS_KEY = ['moments', HOUSEHOLD_ID] as const

export function commentsKey(momentId: string) {
  return ['moment-comments', momentId] as const
}

// ── Shared select ─────────────────────────────────────────────────────────────

const MOMENTS_SELECT = '*, member:members(id, display_name), reactions:moment_reactions(emoji, member_id), photos:moment_photos(id, photo_path, position)'

function sortPhotos(m: Moment): Moment {
  return { ...m, photos: (m.photos ?? []).sort((a, b) => a.position - b.position) }
}

/** Chemins photos d'un moment : album trié, sinon photo_path legacy non archivée. */
export function getMomentPhotoPaths(m: Moment): string[] {
  const album = (m.photos ?? []).slice().sort((a, b) => a.position - b.position).map(p => p.photo_path)
  if (album.length > 0) return album
  if (m.photo_path && !m.photo_archived) return [m.photo_path]
  return []
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useMoments(limit = 20) {
  return useQuery({
    queryKey: [...MOMENTS_KEY, limit],
    queryFn: async (): Promise<Moment[]> => {
      const { data, error } = await supabase
        .from('moments')
        .select(MOMENTS_SELECT)
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data as Moment[]).map(sortPhotos)
    },
  })
}

/** Moments de ce même jour les années passées (« il y a 1 an, 2 ans… »). */
export const ON_THIS_DAY_KEY = ['moments-on-this-day', HOUSEHOLD_ID] as const

export function useOnThisDay(maxYears = 8) {
  const now = new Date()
  // Une plage [00:00, 23:59:59] par année passée, combinées en un seul OR.
  const ranges = Array.from({ length: maxYears }, (_, i) => {
    const day = format(subYears(now, i + 1), 'yyyy-MM-dd')
    return `and(created_at.gte.${day}T00:00:00,created_at.lte.${day}T23:59:59)`
  })
  return useQuery({
    queryKey: [...ON_THIS_DAY_KEY, format(now, 'MM-dd')],
    queryFn: async (): Promise<Moment[]> => {
      const { data, error } = await supabase
        .from('moments')
        .select(MOMENTS_SELECT)
        .eq('household_id', HOUSEHOLD_ID)
        .or(ranges.join(','))
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data as Moment[]) ?? []).map(sortPhotos)
    },
    staleTime: 10 * 60 * 1000,
  })
}

/** Comments for a single moment — fetched on demand (when section is expanded) */
export function useComments(momentId: string | null) {
  return useQuery({
    queryKey: momentId ? commentsKey(momentId) : ['moment-comments-none'],
    queryFn: async (): Promise<MomentComment[]> => {
      const { data, error } = await supabase
        .from('moment_comments')
        .select('id, moment_id, member_id, text, created_at, member:members(id, display_name)')
        .eq('moment_id', momentId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as MomentComment[]
    },
    enabled: !!momentId,
  })
}

/** Signed URL for a single photo (legacy / backward compat) */
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

/** Signed URLs for multiple photos in one batch call */
export function useSignedPhotoUrls(paths: string[]) {
  return useQuery({
    queryKey: ['moment-photo-urls', paths.join(',')],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage
        .from('family-moments')
        .createSignedUrls(paths, 1800)
      if (error) throw error
      return Object.fromEntries(
        (data ?? []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])
      )
    },
    enabled: paths.length > 0,
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
      const uploadedPaths: string[] = []

      for (const rawFile of input.photos) {
        let file: File = rawFile
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
        uploadedPaths.push(path)
      }
      const { data, error } = await supabase
        .from('moments')
        .insert({
          household_id: HOUSEHOLD_ID,
          member_id: member!.id,
          text: input.text.trim() || null,
          photo_path: uploadedPaths[0] ?? null,
        })
        .select(MOMENTS_SELECT)
        .single()
      if (error) throw error

      if (uploadedPaths.length > 0) {
        const { error: photoErr } = await supabase
          .from('moment_photos')
          .insert(uploadedPaths.map((path, i) => ({
            moment_id: data.id,
            photo_path: path,
            position: i,
          })))
        if (photoErr) throw photoErr
        const photos: MomentPhoto[] = uploadedPaths.map((path, i) => ({
          id: `local-${i}`,
          moment_id: data.id,
          photo_path: path,
          position: i,
          created_at: new Date().toISOString(),
        }))
        return { ...(data as unknown as Moment), photos }
      }
      return { ...(data as unknown as Moment), photos: [] }
    },
    onMutate: async (input: NewMomentInput) => {
      await queryClient.cancelQueries({ queryKey: MOMENTS_KEY })
      const keys = queryClient.getQueryCache().findAll({ queryKey: MOMENTS_KEY })
      const snapshots = keys.map(q => ({ key: q.queryKey, data: q.state.data }))
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
        photos: [],
      }
      keys.forEach(q => {
        const old = (q.state.data as Moment[] | undefined) ?? []
        queryClient.setQueryData(q.queryKey, [optimistic, ...old])
      })
      return { snapshots, optimisticId: optimistic.id }
    },
    onSuccess: (newMoment, input, context) => {
      const keys = queryClient.getQueryCache().findAll({ queryKey: MOMENTS_KEY })
      keys.forEach(q => {
        queryClient.setQueryData(q.queryKey, (old: Moment[] | undefined) =>
          (old ?? []).map(m => m.id === context?.optimisticId ? newMoment : m)
        )
      })
      const body = input.text?.trim()
        ? (input.text.trim().length > 60 ? input.text.trim().slice(0, 57) + '…' : input.text.trim())
        : '📸 Nouvelle photo'
      void supabase.functions.invoke('notify-household', {
        body: { title: `Nouveau moment de ${member?.display_name ?? 'quelqu\'un'}`, body, module: 'moments' },
      })
    },
    onError: (_err, _input, ctx) => {
      ctx?.snapshots?.forEach(({ key, data }) => queryClient.setQueryData(key, data))
      showToast({ type: 'error', message: 'Impossible de publier le moment.' })
    },
  })
}

export function useDeleteMoment() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, photo_path, photos = [] }: { id: string; photo_path: string | null; photos?: MomentPhoto[] }) => {
      const pathsToDelete = photos.map(p => p.photo_path)
      if (photo_path && !pathsToDelete.includes(photo_path)) {
        pathsToDelete.push(photo_path)
      }
      if (pathsToDelete.length > 0) {
        await supabase.storage.from('family-moments').remove(pathsToDelete)
      }
      const { error } = await supabase.from('moments').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: MOMENTS_KEY })
      const keys = queryClient.getQueryCache().findAll({ queryKey: MOMENTS_KEY })
      const snapshots = keys.map(q => ({ key: q.queryKey, data: q.state.data }))
      keys.forEach(q => {
        queryClient.setQueryData(q.queryKey, (old: Moment[] | undefined) =>
          (old ?? []).filter(m => m.id !== id)
        )
      })
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(({ key, data }) => queryClient.setQueryData(key, data))
      showToast({ type: 'error', message: 'Impossible de supprimer le moment.' })
    },
  })
}

export function useEditMomentText() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }): Promise<Moment> => {
      const { data, error } = await supabase
        .from('moments')
        .update({ text: text.trim() || null })
        .eq('id', id)
        .select(MOMENTS_SELECT)
        .single()
      if (error) throw error
      return sortPhotos(data as unknown as Moment)
    },
    onMutate: async ({ id, text }) => {
      await queryClient.cancelQueries({ queryKey: MOMENTS_KEY })
      const keys = queryClient.getQueryCache().findAll({ queryKey: MOMENTS_KEY })
      const snapshots = keys.map(q => ({ key: q.queryKey, data: q.state.data }))
      keys.forEach(q => {
        queryClient.setQueryData(q.queryKey, (old: Moment[] | undefined) =>
          (old ?? []).map(m => m.id === id ? { ...m, text: text.trim() || null } : m)
        )
      })
      return { snapshots }
    },
    onSuccess: (updated) => {
      const keys = queryClient.getQueryCache().findAll({ queryKey: MOMENTS_KEY })
      keys.forEach(q => {
        queryClient.setQueryData(q.queryKey, (old: Moment[] | undefined) =>
          (old ?? []).map(m => m.id === updated.id ? updated : m)
        )
      })
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(({ key, data }) => queryClient.setQueryData(key, data))
      showToast({ type: 'error', message: 'Impossible de modifier le moment.' })
    },
  })
}

export function useAddComment() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ momentId, text }: { momentId: string; text: string }): Promise<MomentComment> => {
      const { data, error } = await supabase
        .from('moment_comments')
        .insert({ moment_id: momentId, member_id: member!.id, text: text.trim() })
        .select('id, moment_id, member_id, text, created_at, member:members(id, display_name)')
        .single()
      if (error) throw error
      return data as MomentComment
    },
    onMutate: async ({ momentId, text }) => {
      const key = commentsKey(momentId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<MomentComment[]>(key) ?? []
      const optimistic: MomentComment = {
        id: `opt-comment-${Date.now()}`,
        moment_id: momentId,
        member_id: member?.id ?? '',
        text: text.trim(),
        created_at: new Date().toISOString(),
        member: member ? { id: member.id, display_name: member.display_name } : null,
      }
      queryClient.setQueryData<MomentComment[]>(key, [...previous, optimistic])
      return { previous, optimisticId: optimistic.id, key }
    },
    onSuccess: (newComment, { momentId, text }, context) => {
      const key = commentsKey(momentId)
      queryClient.setQueryData<MomentComment[]>(key, old =>
        (old ?? []).map(c => c.id === context?.optimisticId ? newComment : c)
      )
      // Prévient le foyer (réutilise notify-household ; le foyer = sauf l'auteur).
      const t = text.trim()
      const body = t.length > 60 ? t.slice(0, 57) + '…' : t
      void supabase.functions.invoke('notify-household', {
        body: { title: `${member?.display_name ?? 'Quelqu\'un'} a commenté un moment`, body, module: 'moments' },
      })
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.key) queryClient.setQueryData(ctx.key, ctx.previous ?? [])
      showToast({ type: 'error', message: 'Impossible d\'ajouter le commentaire.' })
    },
  })
}

export function useDeleteComment() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id }: { id: string; momentId: string }) => {
      const { error } = await supabase.from('moment_comments').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, momentId }) => {
      const key = commentsKey(momentId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<MomentComment[]>(key) ?? []
      queryClient.setQueryData<MomentComment[]>(key, previous.filter(c => c.id !== id))
      return { previous, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.key) queryClient.setQueryData(ctx.key, ctx.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de supprimer le commentaire.' })
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function updateMomentInCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  momentId: string,
  updater: (m: Moment) => Moment,
) {
  queryClient.getQueryCache().findAll({ queryKey: MOMENTS_KEY }).forEach(q => {
    queryClient.setQueryData(q.queryKey, (old: Moment[] | undefined) =>
      old ? old.map(m => m.id === momentId ? updater(m) : m) : old
    )
  })
  queryClient.getQueryCache().findAll({ queryKey: ON_THIS_DAY_KEY }).forEach(q => {
    queryClient.setQueryData(q.queryKey, (old: Moment[] | undefined) =>
      old ? old.map(m => m.id === momentId ? updater(m) : m) : old
    )
  })
}

// ── Photo album mutations ─────────────────────────────────────────────────────

export function useAddPhotoToMoment() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ momentId, file, nextPosition }: {
      momentId: string
      file: File
      nextPosition: number
    }): Promise<MomentPhoto> => {
      let toUpload: File = file
      if (file.size > 1_048_576) {
        const { default: imageCompression } = await import('browser-image-compression')
        toUpload = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true })
      }
      const ext  = toUpload.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${HOUSEHOLD_ID}/${member!.id}/${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('family-moments')
        .upload(path, toUpload, { contentType: toUpload.type })
      if (uploadErr) throw uploadErr
      const { data, error } = await supabase
        .from('moment_photos')
        .insert({ moment_id: momentId, photo_path: path, position: nextPosition })
        .select('id, moment_id, photo_path, position, created_at')
        .single()
      if (error) {
        await supabase.storage.from('family-moments').remove([path])
        throw error
      }
      return data as MomentPhoto
    },
    onSuccess: (newPhoto) => {
      updateMomentInCaches(queryClient, newPhoto.moment_id, m =>
        sortPhotos({ ...m, photos: [...(m.photos ?? []), newPhoto] })
      )
    },
    onError: () => {
      showToast({ type: 'error', message: 'Impossible d\'ajouter la photo.' })
    },
  })
}

export function useRemovePhotoFromMoment() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ photoId, photoPath }: { photoId: string; momentId: string; photoPath: string }) => {
      await supabase.storage.from('family-moments').remove([photoPath])
      const { error } = await supabase.from('moment_photos').delete().eq('id', photoId)
      if (error) throw error
    },
    onMutate: async ({ photoId, momentId }) => {
      await queryClient.cancelQueries({ queryKey: MOMENTS_KEY })
      updateMomentInCaches(queryClient, momentId, m => ({
        ...m,
        photos: (m.photos ?? []).filter(p => p.id !== photoId),
      }))
    },
    onError: () => {
      showToast({ type: 'error', message: 'Impossible de supprimer la photo.' })
      queryClient.invalidateQueries({ queryKey: MOMENTS_KEY })
    },
  })
}

export function useToggleReaction() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()

  return useMutation({
    mutationFn: async ({ momentId, emoji }: { momentId: string; emoji: string }) => {
      const memberId = member!.id
      const keys = queryClient.getQueryCache().findAll({ queryKey: MOMENTS_KEY })
      const existing = keys
        .flatMap(q => (q.state.data as Moment[] | undefined) ?? [])
        .find(m => m.id === momentId)
        ?.reactions.find(r => r.emoji === emoji && r.member_id === memberId)

      if (existing) {
        await supabase
          .from('moment_reactions')
          .delete()
          .eq('moment_id', momentId)
          .eq('member_id', memberId)
          .eq('emoji', emoji)
      } else {
        await supabase
          .from('moment_reactions')
          .insert({ moment_id: momentId, member_id: memberId, emoji })
      }
    },
    onMutate: async ({ momentId, emoji }: { momentId: string; emoji: string }) => {
      await queryClient.cancelQueries({ queryKey: MOMENTS_KEY })
      const keys = queryClient.getQueryCache().findAll({ queryKey: MOMENTS_KEY })
      const snapshots = keys.map(q => ({ key: q.queryKey, data: q.state.data }))
      const memberId = member?.id ?? ''
      keys.forEach(q => {
        queryClient.setQueryData(q.queryKey, (old: Moment[] | undefined) =>
          (old ?? []).map(m => {
            if (m.id !== momentId) return m
            const has = m.reactions.some(r => r.emoji === emoji && r.member_id === memberId)
            return {
              ...m,
              reactions: has
                ? m.reactions.filter(r => !(r.emoji === emoji && r.member_id === memberId))
                : [...m.reactions, { emoji, member_id: memberId }],
            }
          })
        )
      })
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(({ key, data }) => queryClient.setQueryData(key, data))
    },
  })
}
