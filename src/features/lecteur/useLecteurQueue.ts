import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'
import { MEDIA_FILES_KEY, type MediaFile } from './useLecteur'

// ── Type ────────────────────────────────────────────────────────────────────
export interface QueueItem {
  id: string
  media_file_id: string
  position: number
  added_by: string | null
  guest_name: string | null
  played: boolean
  votes: number
  created_at: string
  media_file: MediaFile | null
  added_by_member: { display_name: string } | null
}

export const LECTEUR_QUEUE_KEY   = ['lecteur-queue',         HOUSEHOLD_ID] as const
export const LECTEUR_HISTORY_KEY = ['lecteur-queue-history', HOUSEHOLD_ID] as const

const SELECT =
  '*, media_file:media_files(*, member:members(display_name)), added_by_member:members!lecteur_queue_added_by_fkey(display_name)'

// File d'attente partagée : morceaux non encore joués, ordonnés.
export function useLecteurQueue() {
  return useQuery({
    queryKey: LECTEUR_QUEUE_KEY,
    queryFn: async (): Promise<QueueItem[]> => {
      const { data, error } = await supabase
        .from('lecteur_queue')
        .select(SELECT)
        .eq('household_id', HOUSEHOLD_ID)
        .eq('played', false)
        .eq('approved', true)
        .order('position', { ascending: true })
      if (error) throw error
      return data as unknown as QueueItem[]
    },
  })
}

export const LECTEUR_PENDING_KEY = ['lecteur-queue-pending', HOUSEHOLD_ID] as const

// Demandes invitées en attente de validation (modération active). Ordre d'arrivée.
export function usePendingRequests() {
  return useQuery({
    queryKey: LECTEUR_PENDING_KEY,
    queryFn: async (): Promise<QueueItem[]> => {
      const { data, error } = await supabase
        .from('lecteur_queue')
        .select(SELECT)
        .eq('household_id', HOUSEHOLD_ID)
        .eq('played', false)
        .eq('approved', false)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as QueueItem[]
    },
  })
}

// Le DJ valide une demande : elle entre en file (renvoyée en fin via position).
export function useApproveRequest() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lecteur_queue')
        .update({ approved: true, position: Date.now() } as never)
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: LECTEUR_PENDING_KEY })
      const previous = queryClient.getQueryData<QueueItem[]>(LECTEUR_PENDING_KEY) ?? []
      queryClient.setQueryData<QueueItem[]>(LECTEUR_PENDING_KEY, previous.filter(q => q.id !== id))
      return { previous }
    },
    onError: (_e, _id, ctx) => {
      queryClient.setQueryData(LECTEUR_PENDING_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Validation impossible.' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LECTEUR_PENDING_KEY })
      queryClient.invalidateQueries({ queryKey: LECTEUR_QUEUE_KEY })
    },
  })
}

// Le DJ refuse une demande : suppression définitive. Si le morceau avait été
// créé par l'Edge Function pour cet invité (lien collé → media_files taggué
// « soirée », sans membre) et qu'il n'est plus référencé nulle part, on le
// retire aussi : sinon chaque refus laissait un résidu dans la bibliothèque.
export function useRejectRequest() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (item: QueueItem) => {
      const { error } = await supabase.from('lecteur_queue').delete().eq('id', item.id)
      if (error) throw error

      const mf = item.media_file
      if (!mf || mf.member_id !== null || !(mf.tags ?? []).includes('soirée')) return

      const [{ count: queued }, { count: listed }] = await Promise.all([
        supabase.from('lecteur_queue').select('id', { count: 'exact', head: true })
          .eq('media_file_id', mf.id),
        supabase.from('playlist_items').select('id', { count: 'exact', head: true })
          .eq('media_file_id', mf.id),
      ])
      if ((queued ?? 0) === 0 && (listed ?? 0) === 0) {
        await supabase.from('media_files').delete().eq('id', mf.id)
      }
    },
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: LECTEUR_PENDING_KEY })
      const previous = queryClient.getQueryData<QueueItem[]>(LECTEUR_PENDING_KEY) ?? []
      queryClient.setQueryData<QueueItem[]>(LECTEUR_PENDING_KEY, previous.filter(q => q.id !== item.id))
      return { previous }
    },
    onError: (_e, _item, ctx) => {
      queryClient.setQueryData(LECTEUR_PENDING_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Action impossible.' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LECTEUR_PENDING_KEY })
      queryClient.invalidateQueries({ queryKey: MEDIA_FILES_KEY })
    },
  })
}

// Morceaux déjà joués ces dernières 24 h (« joué ce soir »), du plus récent
// au plus ancien (la file se joue par position croissante).
export function useLecteurPlayedHistory() {
  return useQuery({
    queryKey: LECTEUR_HISTORY_KEY,
    queryFn: async (): Promise<QueueItem[]> => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const { data, error } = await supabase
        .from('lecteur_queue')
        .select(SELECT)
        .eq('household_id', HOUSEHOLD_ID)
        .eq('played', true)
        .gte('created_at', since)
        .order('position', { ascending: false })
        .limit(30)
      if (error) throw error
      return data as unknown as QueueItem[]
    },
  })
}

// Échange les positions de deux items adjacents (flèches ↑↓ de la file).
export function useMoveQueueItem() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ a, b }: { a: QueueItem; b: QueueItem }) => {
      // Échange atomique en base (RPC transactionnelle) : deux UPDATE séquentiels
      // laissaient deux positions identiques si le second échouait.
      const { error } = await supabase.rpc('swap_lecteur_queue_position', { a: a.id, b: b.id })
      if (error) throw error
    },
    onMutate: async ({ a, b }) => {
      await queryClient.cancelQueries({ queryKey: LECTEUR_QUEUE_KEY })
      const previous = queryClient.getQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY) ?? []
      queryClient.setQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY,
        previous
          .map(q => q.id === a.id ? { ...q, position: b.position }
                  : q.id === b.id ? { ...q, position: a.position } : q)
          .sort((x, y) => x.position - y.position))
      return { previous }
    },
    onError: (_e, _vars, ctx) => {
      queryClient.setQueryData(LECTEUR_QUEUE_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de déplacer le morceau.' })
    },
  })
}

// Réordonne toute la file en un appel (glisser-déposer). `ids` = ordre voulu
// des items non joués, tête de file comprise.
export function useReorderQueue() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('reorder_lecteur_queue', { p_ids: ids })
      if (error) throw error
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: LECTEUR_QUEUE_KEY })
      const previous = queryClient.getQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY) ?? []
      const byId = new Map(previous.map(q => [q.id, q]))
      const next = ids.map(id => byId.get(id)).filter(Boolean) as QueueItem[]
      // Sécurité : n'écrase le cache que si l'ordre couvre bien toute la file.
      if (next.length === previous.length) {
        queryClient.setQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY, next)
      }
      return { previous }
    },
    onError: (_e, _ids, ctx) => {
      queryClient.setQueryData(LECTEUR_QUEUE_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de réordonner la file.' })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LECTEUR_QUEUE_KEY }),
  })
}

export function useAddToQueue() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()

  // Accepte un id simple (toast de confirmation) ou { mediaFileId, silent } pour
  // l'auto-remplissage anti-silence (sans toast à chaque ajout).
  return useMutation({
    mutationFn: async (input: string | { mediaFileId: string; silent?: boolean }) => {
      const mediaFileId = typeof input === 'string' ? input : input.mediaFileId
      const { error } = await supabase
        .from('lecteur_queue')
        .insert({
          household_id:  HOUSEHOLD_ID,
          media_file_id: mediaFileId,
          added_by:      member?.id ?? null,
          position:      Date.now(), // clé d'ordre = ordre d'ajout
        } as never)
      if (error) throw error
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: LECTEUR_QUEUE_KEY })
      if (typeof input === 'string' || !input.silent) {
        showToast({ type: 'success', message: 'Ajouté à la file 🎉' })
      }
    },
    onError: () => showToast({ type: 'error', message: "Impossible d'ajouter à la file." }),
  })
}

export function useRemoveFromQueue() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lecteur_queue').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: LECTEUR_QUEUE_KEY })
      const previous = queryClient.getQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY) ?? []
      queryClient.setQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY, previous.filter(q => q.id !== id))
      return { previous }
    },
    onError: (_e, _id, ctx) => {
      queryClient.setQueryData(LECTEUR_QUEUE_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Action impossible.' })
    },
  })
}

// Marque un item comme joué (le retire de la file active). Utilisé par le DJ
// quand la piste se termine.
export function useMarkQueuePlayed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lecteur_queue')
        .update({ played: true } as never)
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: LECTEUR_QUEUE_KEY })
      const previous = queryClient.getQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY) ?? []
      queryClient.setQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY, previous.filter(q => q.id !== id))
      return { previous }
    },
    onError: (_e, _id, ctx) => {
      queryClient.setQueryData(LECTEUR_QUEUE_KEY, ctx?.previous ?? [])
    },
  })
}

// Vote d'un membre pour un morceau de la file (modèle « le DJ arbitre » :
// incrémente un compteur, ne réordonne pas). Dédup par member_id en base.
export function useVoteQueueItem() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  return useMutation({
    mutationFn: async (itemId: string) => {
      if (!member?.id) throw new Error('Membre inconnu')
      // La clé de vote est dérivée de auth.uid() côté serveur : l'envoyer depuis
      // le client permettait d'usurper l'empreinte d'un invité.
      const { error } = await supabase.rpc('vote_lecteur_queue', { p_item_id: itemId })
      if (error) throw error
    },
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: LECTEUR_QUEUE_KEY })
      const previous = queryClient.getQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY) ?? []
      queryClient.setQueryData<QueueItem[]>(LECTEUR_QUEUE_KEY,
        previous.map(q => q.id === itemId ? { ...q, votes: (q.votes ?? 0) + 1 } : q))
      return { previous }
    },
    onError: (_e, _id, ctx) => { queryClient.setQueryData(LECTEUR_QUEUE_KEY, ctx?.previous ?? []) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LECTEUR_QUEUE_KEY }),
  })
}

// Le DJ range la file par votes (action explicite, un tap). Le morceau en cours
// (tête de file) reste en place côté serveur.
export function useSortQueueByVotes() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('sort_lecteur_queue_by_votes', { p_household: HOUSEHOLD_ID })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LECTEUR_QUEUE_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de ranger la file.' }),
  })
}

export function useClearQueue() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async () => {
      // Ne vide que la file à venir : les lignes played=true servent
      // d'historique « joué ce soir ».
      const { error } = await supabase
        .from('lecteur_queue')
        .delete()
        .eq('household_id', HOUSEHOLD_ID)
        .eq('played', false)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LECTEUR_QUEUE_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible de vider la file.' }),
  })
}
