import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/Toast'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KakeboCategory {
  id: string
  household_id: string
  name: string
  type: 'income' | 'fixed' | 'variable' | 'leisure' | 'extra'
  color: string | null
  created_at: string
}

export interface KakeboEntry {
  id: string
  household_id: string
  category_id: string | null
  member_id: string | null
  amount: number
  date: string
  description: string | null
  created_at: string
  category: KakeboCategory | null
  member: { display_name: string } | null
}

export interface NewEntryInput {
  category_id: string
  amount: number
  date: string
  description: string
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const KAKEBO_CATS_KEY = ['kakebo-categories', HOUSEHOLD_ID] as const

export function kakeboEntriesKey(year: number, month: number) {
  return ['kakebo-entries', HOUSEHOLD_ID, year, month] as const
}

// ── Default categories seeded on first load ───────────────────────────────────

const DEFAULT_CATS: { name: string; type: KakeboCategory['type']; color: string }[] = [
  { name: 'Survie',  type: 'fixed',    color: '#5B9E8F' },
  { name: 'Loisirs', type: 'leisure',  color: '#E07B54' },
  { name: 'Culture', type: 'variable', color: '#9B7AC4' },
  { name: 'Extras',  type: 'extra',    color: '#C89A5B' },
]

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useKakeboCategories() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useQuery({
    queryKey: KAKEBO_CATS_KEY,
    queryFn: async (): Promise<KakeboCategory[]> => {
      const { data, error } = await supabase
        .from('kakebo_categories')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: true })
      if (error) throw error

      // Auto-seed default categories if none exist yet
      if (data.length === 0) {
        const { data: seeded, error: seedErr } = await supabase
          .from('kakebo_categories')
          .insert(DEFAULT_CATS.map(c => ({ ...c, household_id: HOUSEHOLD_ID })))
          .select('*')
        if (seedErr) {
          showToast({ type: 'error', message: 'Impossible de créer les catégories par défaut.' })
          return []
        }
        queryClient.setQueryData(KAKEBO_CATS_KEY, seeded)
        return seeded as KakeboCategory[]
      }

      return data as KakeboCategory[]
    },
  })
}

export function useKakeboEntries(year: number, month: number) {
  const key = kakeboEntriesKey(year, month)
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<KakeboEntry[]> => {
      const { data, error } = await supabase
        .from('kakebo_entries')
        .select(`
          *,
          category:kakebo_categories(*),
          member:members(display_name)
        `)
        .eq('household_id', HOUSEHOLD_ID)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as KakeboEntry[]
    },
  })
}

export function useAddEntry(year: number, month: number) {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()
  const key = kakeboEntriesKey(year, month)

  return useMutation({
    mutationFn: async (input: NewEntryInput): Promise<KakeboEntry> => {
      const { data, error } = await supabase
        .from('kakebo_entries')
        .insert({
          household_id: HOUSEHOLD_ID,
          category_id: input.category_id,
          member_id: member?.id ?? null,
          amount: input.amount,
          date: input.date,
          description: input.description.trim() || null,
        })
        .select(`*, category:kakebo_categories(*), member:members(display_name)`)
        .single()
      if (error) throw error
      return data as unknown as KakeboEntry
    },
    onSuccess: newEntry => {
      queryClient.setQueryData<KakeboEntry[]>(key, old => [newEntry, ...(old ?? [])])
    },
    onError: () => {
      showToast({ type: 'error', message: 'Impossible d\'ajouter l\'opération.' })
    },
  })
}

export function useDeleteEntry(year: number, month: number) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const key = kakeboEntriesKey(year, month)

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kakebo_entries').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<KakeboEntry[]>(key) ?? []
      queryClient.setQueryData<KakeboEntry[]>(key, previous.filter(e => e.id !== id))
      return { previous }
    },
    onError: (_err, _id, context) => {
      queryClient.setQueryData(key, context?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de supprimer l\'opération.' })
    },
  })
}
