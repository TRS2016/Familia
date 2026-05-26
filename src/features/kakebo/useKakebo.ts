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
  monthly_budget: number | null
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

export interface EditEntryInput {
  id: string
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
  { name: 'Revenus', type: 'income',   color: '#E8B84B' },
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

      // Back-fill income category for households created before this feature
      if (!data.some(c => c.type === 'income')) {
        const { data: newCat, error: insertErr } = await supabase
          .from('kakebo_categories')
          .insert({ name: 'Revenus', type: 'income', color: '#E8B84B', household_id: HOUSEHOLD_ID })
          .select('*')
          .single()
        if (!insertErr && newCat) {
          const updated = [...data, newCat] as KakeboCategory[]
          queryClient.setQueryData(KAKEBO_CATS_KEY, updated)
          return updated
        }
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
    onMutate: async (input: NewEntryInput) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<KakeboEntry[]>(key) ?? []
      const categories = queryClient.getQueryData<KakeboCategory[]>(KAKEBO_CATS_KEY) ?? []
      const optimistic: KakeboEntry = {
        id: `optimistic-${Date.now()}`,
        household_id: HOUSEHOLD_ID,
        category_id: input.category_id,
        member_id: member?.id ?? null,
        amount: input.amount,
        date: input.date,
        description: input.description.trim() || null,
        created_at: new Date().toISOString(),
        category: categories.find(c => c.id === input.category_id) ?? null,
        member: member ? { display_name: member.display_name } : null,
      }
      queryClient.setQueryData<KakeboEntry[]>(key, [optimistic, ...previous])
      return { previous, optimisticId: optimistic.id }
    },
    onSuccess: (newEntry, _input, context) => {
      queryClient.setQueryData<KakeboEntry[]>(key, old =>
        (old ?? []).map(e => e.id === context?.optimisticId ? newEntry : e)
      )
    },
    onError: (_err, _input, context) => {
      queryClient.setQueryData(key, context?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible d\'ajouter l\'opération.' })
    },
  })
}

export function useEditEntry(year: number, month: number) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const key = kakeboEntriesKey(year, month)

  return useMutation({
    mutationFn: async (input: EditEntryInput): Promise<KakeboEntry> => {
      const { data, error } = await supabase
        .from('kakebo_entries')
        .update({
          category_id: input.category_id,
          amount: input.amount,
          date: input.date,
          description: input.description.trim() || null,
        })
        .eq('id', input.id)
        .select(`*, category:kakebo_categories(*), member:members(display_name)`)
        .single()
      if (error) throw error
      return data as unknown as KakeboEntry
    },
    onMutate: async (input: EditEntryInput) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<KakeboEntry[]>(key) ?? []
      const categories = queryClient.getQueryData<KakeboCategory[]>(KAKEBO_CATS_KEY) ?? []
      queryClient.setQueryData<KakeboEntry[]>(key, old =>
        (old ?? []).map(e => e.id !== input.id ? e : {
          ...e,
          category_id: input.category_id,
          amount: input.amount,
          date: input.date,
          description: input.description.trim() || null,
          category: categories.find(c => c.id === input.category_id) ?? e.category,
        })
      )
      return { previous }
    },
    onSuccess: updated => {
      queryClient.setQueryData<KakeboEntry[]>(key, old =>
        (old ?? []).map(e => e.id === updated.id ? updated : e)
      )
    },
    onError: (_err, _input, context) => {
      queryClient.setQueryData(key, context?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de modifier l\'opération.' })
    },
  })
}

// ── Objectif d'épargne partagé (stocké dans households) ──────────────────────

export const KAKEBO_OBJECTIF_KEY = ['kakebo-objectif', HOUSEHOLD_ID] as const

export function useKakeboObjectif() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  const query = useQuery({
    queryKey: KAKEBO_OBJECTIF_KEY,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('households')
        .select('kakebo_objectif_epargne')
        .eq('id', HOUSEHOLD_ID)
        .single()
      if (error) throw error
      return data.kakebo_objectif_epargne ?? 400
    },
  })

  const update = useMutation({
    mutationFn: async (objectif: number) => {
      const { error } = await supabase
        .from('households')
        .update({ kakebo_objectif_epargne: objectif })
        .eq('id', HOUSEHOLD_ID)
      if (error) throw error
    },
    onSuccess: (_, objectif) => {
      queryClient.setQueryData(KAKEBO_OBJECTIF_KEY, objectif)
    },
    onError: () => showToast({ type: 'error', message: 'Impossible de sauvegarder l\'objectif.' }),
  })

  return { objectif: query.data ?? 400, isLoading: query.isLoading, update }
}

// ── Tendance : entrées sur les N derniers mois ────────────────────────────────

export function useKakeboTrend(monthsBack = 6) {
  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  const from = `${fromDate.getFullYear()}-${pad(fromDate.getMonth() + 1)}-01`
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDay)}`

  return useQuery({
    queryKey: ['kakebo-trend', HOUSEHOLD_ID, monthsBack],
    queryFn: async (): Promise<KakeboEntry[]> => {
      const { data, error } = await supabase
        .from('kakebo_entries')
        .select('*, category:kakebo_categories(*)')
        .eq('household_id', HOUSEHOLD_ID)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
      if (error) throw error
      return data as unknown as KakeboEntry[]
    },
  })
}

export function useUpdateCategoryBudget() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, monthly_budget }: { id: string; monthly_budget: number | null }) => {
      const { error } = await supabase.from('kakebo_categories').update({ monthly_budget }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, monthly_budget }) => {
      await queryClient.cancelQueries({ queryKey: KAKEBO_CATS_KEY })
      const previous = queryClient.getQueryData<KakeboCategory[]>(KAKEBO_CATS_KEY) ?? []
      queryClient.setQueryData<KakeboCategory[]>(KAKEBO_CATS_KEY,
        previous.map(c => c.id === id ? { ...c, monthly_budget } : c)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(KAKEBO_CATS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de sauvegarder le budget.' })
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
