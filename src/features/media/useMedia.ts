import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MediaType   = 'film' | 'série' | 'livre' | 'jeu'
export type MediaStatus = 'à voir' | 'en cours' | 'terminé'

export interface MediaItem {
  id: string
  household_id: string
  member_id: string | null
  title: string
  type: MediaType
  status: MediaStatus
  rating: number | null
  comment: string | null
  author_director: string | null
  release_year: number | null
  genre: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  member: { display_name: string } | null
  // media file/URL (added in migration 20260529000004)
  file_path: string | null
  external_url: string | null
  mime_type: string | null
}

export interface NewMediaInput {
  title: string
  type: MediaType
  member_id: string | null
  author_director?: string | null
  release_year?: number | null
  genre?: string | null
  external_url?: string | null
}

export interface UpdateMediaInput {
  id: string
  title?: string
  type?: MediaType
  author_director?: string | null
  release_year?: number | null
  genre?: string | null
  rating?: number | null
  comment?: string | null
  file_path?: string | null
  external_url?: string | null
  mime_type?: string | null
}

export interface Playlist {
  id: string
  household_id: string
  member_id: string | null
  name: string
  description: string | null
  type: 'manual' | 'smart'
  smart_filters: SmartFilters | null
  created_at: string
}

export interface PlaylistItem {
  id: string
  playlist_id: string
  media_item_id: string
  position: number
  added_at: string
  media_item: MediaItem | null
}

export interface SmartFilters {
  type?: MediaType
  status?: MediaStatus
  rating_min?: number
  genre?: string
  has_media?: boolean
  member_id?: string
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const MEDIA_KEY      = ['media-items',   HOUSEHOLD_ID] as const
export const PLAYLISTS_KEY  = ['playlists',      HOUSEHOLD_ID] as const

export function playlistItemsKey(playlistId: string) {
  return ['playlist-items', playlistId] as const
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const NEXT_STATUS: Record<MediaStatus, MediaStatus> = {
  'à voir':   'en cours',
  'en cours': 'terminé',
  'terminé':  'à voir',
}

export function applySmartFilters(items: MediaItem[], filters: SmartFilters): MediaItem[] {
  return items.filter(item => {
    if (filters.type      && item.type   !== filters.type)   return false
    if (filters.status    && item.status !== filters.status) return false
    if (filters.rating_min != null && (item.rating ?? 0) < filters.rating_min) return false
    if (filters.genre && !item.genre?.toLowerCase().includes(filters.genre.toLowerCase())) return false
    if (filters.has_media && !item.file_path && !item.external_url) return false
    if (filters.member_id && item.member_id !== filters.member_id) return false
    return true
  })
}

// ── Media item hooks ──────────────────────────────────────────────────────────

export function useMediaItems() {
  return useQuery({
    queryKey: MEDIA_KEY,
    queryFn: async (): Promise<MediaItem[]> => {
      const { data, error } = await supabase
        .from('media_items')
        .select('*, member:members(display_name)')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as MediaItem[]
    },
  })
}

export function useAddMediaItem() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: NewMediaInput): Promise<MediaItem> => {
      const { data, error } = await supabase
        .from('media_items')
        .insert({
          household_id:    HOUSEHOLD_ID,
          member_id:       input.member_id ?? member?.id ?? null,
          title:           input.title.trim(),
          type:            input.type,
          status:          'à voir',
          author_director: input.author_director ?? null,
          release_year:    input.release_year ?? null,
          genre:           input.genre ?? null,
          external_url:    input.external_url?.trim() || null,
        } as never)
        .select('*, member:members(display_name)')
        .single()
      if (error) throw error
      return data as unknown as MediaItem
    },
    onMutate: async (input: NewMediaInput) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_KEY })
      const previous = queryClient.getQueryData<MediaItem[]>(MEDIA_KEY) ?? []
      const optimistic: MediaItem = {
        id: `optimistic-${Date.now()}`,
        household_id:    HOUSEHOLD_ID,
        member_id:       input.member_id ?? member?.id ?? null,
        title:           input.title.trim(),
        type:            input.type,
        status:          'à voir',
        rating:          null,
        comment:         null,
        author_director: input.author_director ?? null,
        release_year:    input.release_year ?? null,
        genre:           input.genre ?? null,
        started_at:      null,
        finished_at:     null,
        created_at:      new Date().toISOString(),
        member:          member ? { display_name: member.display_name } : null,
        file_path:       null,
        external_url:    input.external_url?.trim() || null,
        mime_type:       null,
      }
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY, [optimistic, ...previous])
      return { previous, optimisticId: optimistic.id }
    },
    onSuccess: (newItem, _input, context) => {
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY, old =>
        (old ?? []).map(m => m.id === context?.optimisticId ? newItem : m)
      )
    },
    onError: (_err, _input, ctx) => {
      queryClient.setQueryData(MEDIA_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: "Impossible d'ajouter l'élément." })
    },
  })
}

export function useUpdateMediaStatus() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, status, current }: { id: string; status: MediaStatus; current: MediaItem }) => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const patch: Partial<MediaItem> = { status }
      if (status === 'en cours' && !current.started_at) patch.started_at = today
      if (status === 'terminé') patch.finished_at = today
      if (status === 'à voir') patch.finished_at = null
      const { error } = await supabase.from('media_items').update(patch as never).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, status, current }) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_KEY })
      const previous = queryClient.getQueryData<MediaItem[]>(MEDIA_KEY) ?? []
      const today = format(new Date(), 'yyyy-MM-dd')
      const patch: Partial<MediaItem> = { status }
      if (status === 'en cours' && !current.started_at) patch.started_at = today
      if (status === 'terminé') patch.finished_at = today
      if (status === 'à voir') patch.finished_at = null
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY,
        previous.map(m => m.id === id ? { ...m, ...patch } : m)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(MEDIA_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de mettre à jour le statut.' })
    },
  })
}

export function useUpdateMediaItem() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, ...fields }: UpdateMediaInput) => {
      const { error } = await supabase.from('media_items').update(fields as never).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, ...fields }) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_KEY })
      const previous = queryClient.getQueryData<MediaItem[]>(MEDIA_KEY) ?? []
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY,
        previous.map(m => m.id === id ? { ...m, ...fields } : m)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(MEDIA_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de sauvegarder.' })
    },
  })
}

export function useDeleteMediaItem() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      // Also delete the file from storage if present
      const items = queryClient.getQueryData<MediaItem[]>(MEDIA_KEY) ?? []
      const item  = items.find(m => m.id === id)
      if (item?.file_path) {
        await supabase.storage.from('family-media').remove([item.file_path])
      }
      const { error } = await supabase.from('media_items').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_KEY })
      const previous = queryClient.getQueryData<MediaItem[]>(MEDIA_KEY) ?? []
      queryClient.setQueryData<MediaItem[]>(MEDIA_KEY, previous.filter(m => m.id !== id))
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(MEDIA_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: "Impossible de supprimer l'élément." })
    },
  })
}

// ── File upload ───────────────────────────────────────────────────────────────

export function useUploadMediaFile() {
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (file: File): Promise<{ path: string; mimeType: string }> => {
      const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
      const path = `${HOUSEHOLD_ID}/${member!.id}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage
        .from('family-media')
        .upload(path, file, { contentType: file.type })
      if (error) throw error
      return { path, mimeType: file.type || 'application/octet-stream' }
    },
    onError: () => {
      showToast({ type: 'error', message: "Impossible d'uploader le fichier." })
    },
  })
}

// ── Playlist hooks ────────────────────────────────────────────────────────────

export function usePlaylists() {
  return useQuery({
    queryKey: PLAYLISTS_KEY,
    queryFn: async (): Promise<Playlist[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('playlists')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Playlist[]
    },
  })
}

export function useAddPlaylist() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: { name: string; type: 'manual' | 'smart'; smart_filters?: SmartFilters; description?: string }): Promise<Playlist> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('playlists')
        .insert({
          household_id:  HOUSEHOLD_ID,
          member_id:     member?.id ?? null,
          name:          input.name.trim(),
          description:   input.description?.trim() || null,
          type:          input.type,
          smart_filters: input.smart_filters ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as Playlist
    },
    onSuccess: (pl) => {
      queryClient.setQueryData<Playlist[]>(PLAYLISTS_KEY, old => [pl, ...(old ?? [])])
    },
    onError: () => {
      showToast({ type: 'error', message: 'Impossible de créer la liste.' })
    },
  })
}

export function useUpdatePlaylist() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string; name?: string; smart_filters?: SmartFilters | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('playlists').update(fields).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, ...fields }) => {
      const previous = queryClient.getQueryData<Playlist[]>(PLAYLISTS_KEY) ?? []
      queryClient.setQueryData<Playlist[]>(PLAYLISTS_KEY,
        previous.map(p => p.id === id ? { ...p, ...fields } : p)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(PLAYLISTS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de modifier la liste.' })
    },
  })
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('playlists').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      const previous = queryClient.getQueryData<Playlist[]>(PLAYLISTS_KEY) ?? []
      queryClient.setQueryData<Playlist[]>(PLAYLISTS_KEY, previous.filter(p => p.id !== id))
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(PLAYLISTS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de supprimer la liste.' })
    },
  })
}

// ── Playlist items hooks ──────────────────────────────────────────────────────

export function usePlaylistItems(playlistId: string | null) {
  return useQuery({
    queryKey: playlistId ? playlistItemsKey(playlistId) : ['playlist-items-none'],
    queryFn: async (): Promise<PlaylistItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('playlist_items')
        .select('*, media_item:media_items(*, member:members(display_name))')
        .eq('playlist_id', playlistId!)
        .order('position', { ascending: true })
      if (error) throw error
      return data as PlaylistItem[]
    },
    enabled: !!playlistId,
  })
}

export function useAddToPlaylist() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ playlistId, mediaItemId }: { playlistId: string; mediaItemId: string }) => {
      const key   = playlistItemsKey(playlistId)
      const items = queryClient.getQueryData<PlaylistItem[]>(key) ?? []
      const position = items.length
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('playlist_items')
        .insert({ playlist_id: playlistId, media_item_id: mediaItemId, position })
      if (error) throw error
    },
    onSuccess: (_data, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: playlistItemsKey(playlistId) })
    },
    onError: () => {
      showToast({ type: 'error', message: 'Impossible d\'ajouter à la liste.' })
    },
  })
}

export function useRemoveFromPlaylist() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ itemId }: { itemId: string; playlistId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('playlist_items')
        .delete()
        .eq('id', itemId)
      if (error) throw error
    },
    onMutate: async ({ itemId, playlistId }) => {
      const key      = playlistItemsKey(playlistId)
      const previous = queryClient.getQueryData<PlaylistItem[]>(key) ?? []
      queryClient.setQueryData<PlaylistItem[]>(key, previous.filter(i => i.id !== itemId))
      return { previous, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.key) queryClient.setQueryData(ctx.key, ctx.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de retirer de la liste.' })
    },
  })
}
