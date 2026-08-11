import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
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
  duration_seconds: number | null
  tags: string[]
  is_favorite: boolean
  /** Masqué aux invités de soirée (le lien d'invitation expose la bibliothèque). */
  party_hidden: boolean
  play_count: number
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
  kind?:      MediaFileKind
  member_id?: string
  tag?:       string
  favorite?:  boolean
  sort?:      'recent' | 'az' | 'oldest' | 'duration'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function detectKind(file: MediaFile): MediaFileKind {
  if (!file.file_path && file.external_url) return 'lien'
  if (file.mime_type?.startsWith('audio/')) return 'audio'
  return 'vidéo'
}

export function applyLecteurFilters(files: MediaFile[], filters: LecteurSmartFilters): MediaFile[] {
  const result = files.filter(f => {
    if (filters.kind      && detectKind(f) !== filters.kind)      return false
    if (filters.member_id && f.member_id   !== filters.member_id) return false
    if (filters.tag       && !(f.tags ?? []).includes(filters.tag)) return false
    if (filters.favorite  && !f.is_favorite)                       return false
    return true
  })
  if (filters.sort === 'az')       return [...result].sort((a, b) => a.title.localeCompare(b.title))
  if (filters.sort === 'oldest')   return [...result].sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (filters.sort === 'duration') return [...result].sort((a, b) => (b.duration_seconds ?? 0) - (a.duration_seconds ?? 0))
  return result
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
        // Borne explicite : PostgREST tronque à max_rows (1000) sans le dire.
        .limit(2000)
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
      title: string; file_path?: string | null; external_url?: string | null; mime_type?: string | null; description?: string | null; tags?: string[]; duration_seconds?: number | null
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
          duration_seconds: input.duration_seconds ?? null,
          tags:         input.tags ?? [],
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
    // file_path est passé par l'appelant : onMutate retire le fichier du cache
    // avant mutationFn, donc le relire ici depuis le cache échouerait toujours.
    // Base d'abord, Storage ensuite : un fichier orphelin dans le bucket est
    // moins grave qu'une ligne pointant vers un fichier supprimé.
    mutationFn: async ({ id, filePath }: { id: string; filePath: string | null }) => {
      const { error } = await supabase.from('media_files').delete().eq('id', id)
      if (error) throw error
      if (filePath) {
        await supabase.storage.from('family-media').remove([filePath])
      }
    },
    onMutate: async ({ id }) => {
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

export function useEditMediaFile() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, title, tags, party_hidden }: { id: string; title: string; tags?: string[]; party_hidden?: boolean }) => {
      const patch: Record<string, unknown> = { title: title.trim() }
      if (tags !== undefined) patch.tags = tags
      if (party_hidden !== undefined) patch.party_hidden = party_hidden
      const { error } = await supabase
        .from('media_files')
        .update(patch as never)
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, title, tags, party_hidden }) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_FILES_KEY })
      const previous = queryClient.getQueryData<MediaFile[]>(MEDIA_FILES_KEY) ?? []
      queryClient.setQueryData<MediaFile[]>(MEDIA_FILES_KEY,
        previous.map(f => f.id === id ? {
          ...f,
          title: title.trim(),
          ...(tags !== undefined ? { tags } : {}),
          ...(party_hidden !== undefined ? { party_hidden } : {}),
        } : f)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(MEDIA_FILES_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de modifier le fichier.' })
    },
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from('media_files')
        .update({ is_favorite: value } as never)
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, value }) => {
      await queryClient.cancelQueries({ queryKey: MEDIA_FILES_KEY })
      const previous = queryClient.getQueryData<MediaFile[]>(MEDIA_FILES_KEY) ?? []
      queryClient.setQueryData<MediaFile[]>(MEDIA_FILES_KEY,
        previous.map(f => f.id === id ? { ...f, is_favorite: value } : f)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(MEDIA_FILES_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Action impossible.' })
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
    onError: (e: unknown) => {
      const msg = (e as { message?: string })?.message ?? ''
      showToast({ type: 'error', message: msg ? `Upload échoué : ${msg}` : "Impossible d'uploader le fichier." })
    },
  })
}

/** Incrémente le compteur d'écoutes (fire-and-forget : jamais bloquant). */
export function bumpPlayCount(fileId: string) {
  void supabase.rpc('increment_media_play', { p_file_id: fileId })
}

// ── Import d'une playlist YouTube entière ─────────────────────────────────────

const YT_IMPORT_ENV = {
  url: import.meta.env.VITE_SUPABASE_URL as string,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
}

/** Extrait l'id de playlist d'une URL YouTube (ou accepte l'id brut). */
export function parseYtPlaylistId(input: string): string | null {
  const trimmed = input.trim()
  const m = trimmed.match(/[?&]list=([\w-]+)/)
  if (m) return m[1]
  if (/^[\w-]{10,}$/.test(trimmed) && !/^https?:/i.test(trimmed)) return trimmed
  return null
}

/**
 * Importe une playlist YouTube : crée la liste (nom = titre YouTube) et un
 * media_file par vidéo (les vidéos déjà en bibliothèque, repérées par leur id
 * YouTube, sont réutilisées au lieu d'être dupliquées).
 */
export function useImportYtPlaylist() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (playlistId: string): Promise<{ name: string; count: number; reused: number; truncated: boolean }> => {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch(`${YT_IMPORT_ENV.url}/functions/v1/yt-search?playlist=${encodeURIComponent(playlistId)}`, {
        headers: { apikey: YT_IMPORT_ENV.key, Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const data = await r.json() as {
        title?: string
        items?: { videoId: string; title: string; channel: string }[]
        truncated?: boolean
        error?: string
      }
      if (data.error || !data.title) throw new Error(data.error ?? 'Playlist introuvable.')
      const items = data.items ?? []
      if (items.length === 0) throw new Error('Playlist vide.')

      // Vidéos déjà en bibliothèque (dédup par id YouTube).
      const { data: existing, error: exErr } = await supabase
        .from('media_files')
        .select('id, external_url')
        .eq('household_id', HOUSEHOLD_ID)
        .not('external_url', 'is', null)
      if (exErr) throw exErr
      const byYtId = new Map<string, string>()
      for (const f of existing ?? []) {
        const m = (f.external_url ?? '').match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/)
        if (m) byYtId.set(m[1], f.id)
      }

      const missing = items.filter(it => !byYtId.has(it.videoId))
      if (missing.length > 0) {
        const { data: created, error: insErr } = await supabase
          .from('media_files')
          .insert(missing.map(it => ({
            household_id: HOUSEHOLD_ID,
            member_id: member?.id ?? null,
            title: it.title.slice(0, 200),
            external_url: `https://youtu.be/${it.videoId}`,
            tags: [],
          })) as never)
          .select('id, external_url')
        if (insErr) throw insErr
        for (const f of created ?? []) {
          const m = (f.external_url ?? '').match(/youtu\.be\/([\w-]{11})/)
          if (m) byYtId.set(m[1], f.id)
        }
      }

      // Crée la liste puis ses items dans l'ordre YouTube.
      const { data: pl, error: plErr } = await supabase
        .from('playlists')
        .insert({
          household_id: HOUSEHOLD_ID,
          member_id: member?.id ?? null,
          name: data.title.slice(0, 120),
          type: 'manual',
          smart_filters: null,
        } as never)
        .select('id, name')
        .single()
      if (plErr) throw plErr

      const base = Date.now()
      const rows = items
        .map((it, i) => ({ playlist_id: pl.id, media_file_id: byYtId.get(it.videoId), position: base + i }))
        .filter((r): r is { playlist_id: string; media_file_id: string; position: number } => !!r.media_file_id)
      const { error: itemsErr } = await supabase.from('playlist_items').insert(rows as never)
      if (itemsErr) throw itemsErr

      return { name: pl.name, count: rows.length, reused: items.length - missing.length, truncated: !!data.truncated }
    },
    onSuccess: ({ name, count, reused, truncated }) => {
      queryClient.invalidateQueries({ queryKey: LECTEUR_PL_KEY })
      queryClient.invalidateQueries({ queryKey: MEDIA_FILES_KEY })
      const extra = [
        reused > 0 ? `${reused} déjà en bibliothèque` : '',
        truncated ? 'playlist tronquée à 200' : '',
      ].filter(Boolean).join(', ')
      showToast({ type: 'success', message: `« ${name} » importée : ${count} morceaux${extra ? ` (${extra})` : ''}.` })
    },
    onError: (e: Error) => showToast({ type: 'error', message: e.message || 'Import impossible.' }),
  })
}

// ── Playlist hooks ────────────────────────────────────────────────────────────

export function useLecteurPlaylists() {
  return useQuery({
    queryKey: LECTEUR_PL_KEY,
    queryFn: async (): Promise<LecteurPlaylist[]> => {
      const { data, error } = await supabase
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
      const { data, error } = await supabase
        .from('playlists')
        .insert({
          household_id:  HOUSEHOLD_ID,
          member_id:     member?.id ?? null,
          name:          input.name.trim(),
          type:          input.type,
          smart_filters: (input.smart_filters ?? null) as unknown as Json,
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
      const { error } = await supabase.from('playlists').delete().eq('id', id)
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
      const { data, error } = await supabase
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
      // Clé d'ordre = timestamp (comme lecteur_queue) : la longueur du cache
      // créait des doublons de position quand le détail n'était jamais ouvert.
      const { error } = await supabase
        .from('playlist_items')
        .insert({ playlist_id: playlistId, media_file_id: mediaFileId, position: Date.now() })
      if (error) throw error
    },
    onSuccess: (_d, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: lecteurPlItemsKey(playlistId) })
    },
    onError: (err) => {
      // 23505 = violation de UNIQUE(playlist_id, media_file_id) → déjà présent.
      const code = (err as { code?: string })?.code
      showToast({
        type: 'error',
        message: code === '23505' ? 'Ce morceau est déjà dans la liste.' : "Impossible d'ajouter à la liste.",
      })
    },
  })
}

// Échange les positions de deux items de playlist manuelle (flèches ↑↓).
// Même logique que useMoveQueueItem côté file de soirée.
export function useReorderLecteurPlaylistItem() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ a, b }: { a: LecteurPlaylistItem; b: LecteurPlaylistItem }) => {
      // Échange atomique en base (RPC transactionnelle), cf. useMoveQueueItem.
      const { error } = await supabase.rpc('swap_playlist_item_position', { a: a.id, b: b.id })
      if (error) throw error
    },
    onMutate: async ({ a, b }) => {
      const key      = lecteurPlItemsKey(a.playlist_id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<LecteurPlaylistItem[]>(key) ?? []
      queryClient.setQueryData<LecteurPlaylistItem[]>(key,
        previous
          .map(i => i.id === a.id ? { ...i, position: b.position }
                  : i.id === b.id ? { ...i, position: a.position } : i)
          .sort((x, y) => x.position - y.position))
      return { previous, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.key) queryClient.setQueryData(ctx.key, ctx.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de déplacer le morceau.' })
    },
  })
}

// Réordonne toute une playlist manuelle en un appel (glisser-déposer).
export function useReorderLecteurPlaylistItems() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ ids }: { ids: string[]; playlistId: string }) => {
      const { error } = await supabase.rpc('reorder_playlist_items', { p_ids: ids })
      if (error) throw error
    },
    onMutate: async ({ ids, playlistId }) => {
      const key = lecteurPlItemsKey(playlistId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<LecteurPlaylistItem[]>(key) ?? []
      const byId = new Map(previous.map(i => [i.id, i]))
      const next = ids.map(id => byId.get(id)).filter(Boolean) as LecteurPlaylistItem[]
      if (next.length === previous.length) {
        queryClient.setQueryData<LecteurPlaylistItem[]>(key, next)
      }
      return { previous, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.key) queryClient.setQueryData(ctx.key, ctx.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de réordonner la liste.' })
    },
    onSuccess: (_d, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: lecteurPlItemsKey(playlistId) })
    },
  })
}

export function useRemoveFromLecteurPlaylist() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ itemId }: { itemId: string; playlistId: string }) => {
      const { error } = await supabase.from('playlist_items').delete().eq('id', itemId)
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
