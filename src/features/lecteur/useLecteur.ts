import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MediaFileKind = 'audio' | 'vidéo' | 'lien'

export interface MediaFile {
  id: string
  household_id: string
  member_id: string | null
  title: string
  description: string | null
  file_path: string | null
  external_url: string | null
  mime_type: string | null
  created_at: string
  member: { display_name: string } | null
}

export interface LecteurPlaylist {
  id: string
  household_id: string
  member_id: string | null
  name: string
  description: string | null
  type: 'manual' | 'smart'
  smart_filters: LecteurSmartFilters | null
  created_at: string
}

export interface LecteurPlaylistItem {
  id: string
  playlist_id: string
  media_file_id: string
  position: number
  added_at: string
  media_file: MediaFile | null
}

export interface LecteurSmartFilters {
  kind?: MediaFileKind
  member_id?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function detectKind(file: MediaFile): MediaFileKind {
  if (!file.file_path && file.external_url) return 'lien'
  if (file.mime_type?.startsWith('audio/')) return 'audio'
  return 'vidéo'
}

export function applyLecteurFilters(files: MediaFile[], filters: LecteurSmartFilters): MediaFile[] {
  return files.filter(f => {
    if (filters.kind && detectKind(f) !== filters.kind) return false
    if (filters.member_id && f.member_id !== filters.member_id) return false
    return true
  })
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const MEDIA_FILES_KEY   = ['media-files',       HOUSEHOLD_ID] as const
export const LECTEUR_PL_KEY    = ['lecteur-playlists',  HOUSEHOLD_ID] as const
export function lecteurPlItemsKey(id: string) {
  return ['lecteur-playlist-items', id] as const
}

// ── Media files hooks ─────────────────────────────────────────────────────────

export function useMediaFiles() {
  return useQuery({
    queryKey: MEDIA_FILES_KEY,
    queryFn: async (): Promise<MediaFile[]> => {
      const { data, error } = await supabase
        .from('media_files')
        .select('*, member:members(display_name)')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as MediaFile[]
    },
  })
}

export function useAddMediaFile() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: {
      title: string; file_path?: string | null; external_url?: string | null; mime_type?: string | null; description?: string | null
    }): Promise<MediaFile> => {
      const { data, error } = await supabase
        .from('media_files')
        .insert({
          household_id: HOUSEHOLD_ID,
          member_id:    member?.id ?? null,
          title:        input.title.trim(),
          description:  input.description?.trim() || null,
          file_path:    input.file_path ?? null,
          external_url: input.external_url?.trim() || null,
          mime_type:    input.mime_type ?? null,
        } as never)
        .select('*, member:members(display_name)')
        .single()
      if (error) throw error
      return data as unknown as MediaFile
    },
    onSuccess: (f) => {
      queryClient.setQueryData<MediaFile[]>(MEDIA_FILES_KEY, old => [f, ...(old ?? [])])
    },
    onError: () => showToast({ type: 'error', message: "Impossible d'ajouter le fichier." }),
  })
}

export function useDeleteMediaFile() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      const files = queryClient.getQueryData<MediaFile[]>(MEDIA_FILES_KEY) ?? []
      const file  = files.find(f => f.id === id)
      if (file?.file_path) {
        await supabase.storage.from('family-media').remove([file.file_path])
      }
      const { error } = await supabase.from('media_files').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_FILES_KEY })
      const previous = queryClient.getQueryData<MediaFile[]>(MEDIA_FILES_KEY) ?? []
      queryClient.setQueryData<MediaFile[]>(MEDIA_FILES_KEY, previous.filter(f => f.id !== id))
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(MEDIA_FILES_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: "Impossible de supprimer le fichier." })
    },
  })
}

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
    onError: () => showToast({ type: 'error', message: "Impossible d'uploader le fichier." }),
  })
}

// ── Playlist hooks ────────────────────────────────────────────────────────────

export function useLecteurPlaylists() {
  return useQuery({
    queryKey: LECTEUR_PL_KEY,
    queryFn: async (): Promise<LecteurPlaylist[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('playlists')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as LecteurPlaylist[]
    },
  })
}

export function useAddLecteurPlaylist() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (input: { name: string; type: 'manual' | 'smart'; smart_filters?: LecteurSmartFilters }): Promise<LecteurPlaylist> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('playlists')
        .insert({
          household_id:  HOUSEHOLD_ID,
          member_id:     member?.id ?? null,
          name:          input.name.trim(),
          type:          input.type,
          smart_filters: input.smart_filters ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as LecteurPlaylist
    },
    onSuccess: (pl) => {
      queryClient.setQueryData<LecteurPlaylist[]>(LECTEUR_PL_KEY, old => [pl, ...(old ?? [])])
    },
    onError: () => showToast({ type: 'error', message: 'Impossible de créer la liste.' }),
  })
}

export function useDeleteLecteurPlaylist() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('playlists').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      const previous = queryClient.getQueryData<LecteurPlaylist[]>(LECTEUR_PL_KEY) ?? []
      queryClient.setQueryData<LecteurPlaylist[]>(LECTEUR_PL_KEY, previous.filter(p => p.id !== id))
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      queryClient.setQueryData(LECTEUR_PL_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de supprimer la liste.' })
    },
  })
}

export function useLecteurPlaylistItems(playlistId: string | null) {
  return useQuery({
    queryKey: playlistId ? lecteurPlItemsKey(playlistId) : ['lecteur-pl-items-none'],
    queryFn: async (): Promise<LecteurPlaylistItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('playlist_items')
        .select('*, media_file:media_files(*, member:members(display_name))')
        .eq('playlist_id', playlistId!)
        .order('position', { ascending: true })
      if (error) throw error
      return data as LecteurPlaylistItem[]
    },
    enabled: !!playlistId,
  })
}

export function useAddToLecteurPlaylist() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ playlistId, mediaFileId }: { playlistId: string; mediaFileId: string }) => {
      const key   = lecteurPlItemsKey(playlistId)
      const items = queryClient.getQueryData<LecteurPlaylistItem[]>(key) ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('playlist_items')
        .insert({ playlist_id: playlistId, media_file_id: mediaFileId, position: items.length })
      if (error) throw error
    },
    onSuccess: (_d, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: lecteurPlItemsKey(playlistId) })
    },
    onError: () => showToast({ type: 'error', message: "Impossible d'ajouter à la liste." }),
  })
}

export function useRemoveFromLecteurPlaylist() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ itemId }: { itemId: string; playlistId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('playlist_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onMutate: async ({ itemId, playlistId }) => {
      const key      = lecteurPlItemsKey(playlistId)
      const previous = queryClient.getQueryData<LecteurPlaylistItem[]>(key) ?? []
      queryClient.setQueryData<LecteurPlaylistItem[]>(key, previous.filter(i => i.id !== itemId))
      return { previous, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.key) queryClient.setQueryData(ctx.key, ctx.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de retirer de la liste.' })
    },
  })
}
