import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'

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
  tags: string[]
  recurring: boolean
  series_id: string | null
  series_end: string | null   // dernier mois inclus (date = dernier jour du mois), null = sans fin
  created_at: string
  category: KakeboCategory | null
  member: { display_name: string } | null
}

export interface NewEntryInput {
  category_id: string
  amount: number
  date: string
  description: string
  member_id: string | null // null = dépense commune (foyer)
  tags: string[]
  recurring: boolean
  series_end: string | null // dernier jour du mois d'échéance, null = sans fin
}

export interface EditEntryInput {
  id: string
  category_id: string
  amount: number
  date: string
  description: string
  member_id: string | null
  tags: string[]
  recurring: boolean
  series_id: string | null
  series_end: string | null
  // 'series' : applique les champs (sauf la date) à toutes les occurrences de la
  // série. Décocher `recurring` en scope série arrête la série de façon fiable.
  scope?: 'one' | 'series'
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

// ── Récurrences : génère les occurrences manquantes du mois affiché ─────────────

export function useMaterializeRecurring(year: number, month: number) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['kakebo-materialize', HOUSEHOLD_ID, year, month],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('kakebo_entries')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .not('series_id', 'is', null)
        .order('date', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as unknown as KakeboEntry[]

      const bySeries = new Map<string, KakeboEntry[]>()
      for (const r of rows) {
        const k = r.series_id as string
        const arr = bySeries.get(k) ?? []
        arr.push(r); bySeries.set(k, arr)
      }

      const targetKey = `${year}-${String(month).padStart(2, '0')}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toInsert: any[] = []

      for (const [sid, occ] of bySeries) {
        occ.sort((a, b) => a.date.localeCompare(b.date))
        const latest = occ[occ.length - 1]
        if (!latest.recurring) continue // série arrêtée (décochée)
        const end = latest.series_end // dernier jour du mois d'échéance, ou null
        const latestKey = latest.date.slice(0, 7)
        if (targetKey <= latestKey) continue // déjà à jour jusqu'au mois affiché

        const existingMonths = new Set(occ.map(o => o.date.slice(0, 7)))
        const day = Number(latest.date.slice(8, 10))
        let [y, m] = latest.date.split('-').map(Number)
        let guard = 0
        while (guard++ < 24) {
          m++; if (m > 12) { m = 1; y++ }
          const mk = `${y}-${String(m).padStart(2, '0')}`
          const lastDay = new Date(y, m, 0).getDate()
          const occDate = `${mk}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
          if (end && occDate > end) break // échéance dépassée : on arrête la série
          if (!existingMonths.has(mk)) {
            toInsert.push({
              household_id: HOUSEHOLD_ID,
              category_id: latest.category_id,
              member_id: latest.member_id,
              amount: latest.amount,
              date: occDate,
              description: latest.description,
              tags: latest.tags ?? [],
              recurring: true,
              series_id: sid,
              series_end: end,
            })
          }
          if (mk >= targetKey) break
        }
      }

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase
          .from('kakebo_entries')
          .upsert(toInsert as never, { onConflict: 'series_id,date', ignoreDuplicates: true })
        if (insErr) throw insErr
        queryClient.invalidateQueries({ queryKey: kakeboEntriesKey(year, month) })
        queryClient.invalidateQueries({ queryKey: ['kakebo-trend', HOUSEHOLD_ID] })
      }
      return toInsert.length
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useAddEntry(year: number, month: number) {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()
  const key = kakeboEntriesKey(year, month)

  return useMutation({
    mutationFn: async (input: NewEntryInput): Promise<KakeboEntry> => {
      const seriesId = input.recurring ? (crypto.randomUUID() as string) : null
      const { data, error } = await supabase
        .from('kakebo_entries')
        .insert({
          household_id: HOUSEHOLD_ID,
          category_id: input.category_id,
          member_id: input.member_id,
          amount: input.amount,
          date: input.date,
          description: input.description.trim() || null,
          tags: input.tags,
          recurring: input.recurring,
          series_id: seriesId,
          series_end: input.recurring ? input.series_end : null,
        } as never)
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
        member_id: input.member_id,
        amount: input.amount,
        date: input.date,
        description: input.description.trim() || null,
        tags: input.tags,
        recurring: input.recurring,
        series_id: null,
        series_end: input.recurring ? input.series_end : null,
        created_at: new Date().toISOString(),
        category: categories.find(c => c.id === input.category_id) ?? null,
        member: (input.member_id && member && input.member_id === member.id)
          ? { display_name: member.display_name }
          : null,
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
    mutationFn: async (input: EditEntryInput): Promise<KakeboEntry | null> => {
      // Scope « toute la série » : applique les champs partagés à toutes les
      // occurrences (la date reste propre à chaque mois). Décocher `recurring`
      // ici met fin à la série de façon fiable (toutes les lignes passent à false).
      if (input.scope === 'series' && input.series_id) {
        const endVal = input.recurring ? input.series_end : null
        const { error } = await supabase
          .from('kakebo_entries')
          .update({
            category_id: input.category_id,
            amount: input.amount,
            description: input.description.trim() || null,
            member_id: input.member_id,
            tags: input.tags,
            recurring: input.recurring,
            series_end: endVal,
          } as never)
          .eq('series_id', input.series_id)
        if (error) throw error
        // Échéance reculée/posée : supprime les occurrences déjà matérialisées
        // au-delà du mois de fin (les mois antérieurs/égal sont conservés).
        if (endVal) {
          const { error: delErr } = await supabase
            .from('kakebo_entries')
            .delete()
            .eq('series_id', input.series_id)
            .gt('date', endVal)
          if (delErr) throw delErr
        }
        return null
      }

      // Si on rend l'opération récurrente et qu'elle n'a pas encore de série, on lui en crée une.
      const seriesId = input.recurring ? (input.series_id ?? (crypto.randomUUID() as string)) : input.series_id
      const { data, error } = await supabase
        .from('kakebo_entries')
        .update({
          category_id: input.category_id,
          amount: input.amount,
          date: input.date,
          description: input.description.trim() || null,
          member_id: input.member_id,
          tags: input.tags,
          recurring: input.recurring,
          series_id: seriesId,
          series_end: input.recurring ? input.series_end : null,
        } as never)
        .eq('id', input.id)
        .select(`*, category:kakebo_categories(*), member:members(display_name)`)
        .single()
      if (error) throw error
      return data as unknown as KakeboEntry
    },
    onMutate: async (input: EditEntryInput) => {
      // Scope série : trop de mois potentiellement concernés pour un patch
      // optimiste fiable → on invalide en onSuccess.
      if (input.scope === 'series') return { previous: undefined }
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
          member_id: input.member_id,
          tags: input.tags,
          recurring: input.recurring,
          category: categories.find(c => c.id === input.category_id) ?? e.category,
        })
      )
      return { previous }
    },
    onSuccess: (updated, input) => {
      if (input.scope === 'series' || !updated) {
        // Plusieurs mois touchés (+ régénération récurrente) → on invalide large.
        queryClient.invalidateQueries({ queryKey: ['kakebo-entries', HOUSEHOLD_ID] })
        queryClient.invalidateQueries({ queryKey: ['kakebo-trend', HOUSEHOLD_ID] })
        queryClient.invalidateQueries({ queryKey: ['kakebo-materialize', HOUSEHOLD_ID] })
        return
      }
      queryClient.setQueryData<KakeboEntry[]>(key, old =>
        (old ?? []).map(e => e.id === updated.id ? updated : e)
      )
    },
    onError: (_err, input, context) => {
      if (input.scope !== 'series') queryClient.setQueryData(key, context?.previous ?? [])
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

export function useRenameCategory() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('kakebo_categories').update({ name }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: KAKEBO_CATS_KEY })
      const previous = queryClient.getQueryData<KakeboCategory[]>(KAKEBO_CATS_KEY) ?? []
      queryClient.setQueryData<KakeboCategory[]>(KAKEBO_CATS_KEY,
        previous.map(c => c.id === id ? { ...c, name } : c)
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(KAKEBO_CATS_KEY, ctx?.previous ?? [])
      showToast({ type: 'error', message: 'Impossible de renommer la catégorie.' })
    },
  })
}

// ── Budgets par membre ────────────────────────────────────────────────────────

export interface KakeboMemberBudget {
  member_id: string
  category_id: string
  household_id: string
  monthly_budget: number | null
}

export type KakeboMember = { id: string; display_name: string; kakebo_objectif_epargne: number | null }

export function useKakeboMembers() {
  return useQuery({
    queryKey: ['kakebo-members', HOUSEHOLD_ID],
    queryFn: async (): Promise<KakeboMember[]> => {
      const { data, error } = await supabase
        .from('members')
        .select('id, display_name, kakebo_objectif_epargne')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as KakeboMember[]
    },
  })
}

export function useKakeboMemberBudgets(memberId: string | null) {
  return useQuery({
    queryKey: ['kakebo-member-budgets', HOUSEHOLD_ID, memberId],
    queryFn: async (): Promise<KakeboMemberBudget[]> => {
      const { data, error } = await supabase
        .from('kakebo_member_budgets')
        .select('*')
        .eq('member_id', memberId!)
        .eq('household_id', HOUSEHOLD_ID)
      if (error) throw error
      return data as KakeboMemberBudget[]
    },
    enabled: !!memberId,
  })
}

export function useUpdateMemberBudget() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ memberId, categoryId, monthly_budget }: {
      memberId: string; categoryId: string; monthly_budget: number | null
    }) => {
      if (monthly_budget === null) {
        const { error } = await supabase.from('kakebo_member_budgets')
          .delete().eq('member_id', memberId).eq('category_id', categoryId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('kakebo_member_budgets')
          .upsert({ member_id: memberId, category_id: categoryId, household_id: HOUSEHOLD_ID, monthly_budget }, { onConflict: 'member_id,category_id' })
        if (error) throw error
      }
    },
    onMutate: async ({ memberId, categoryId, monthly_budget }) => {
      const key = ['kakebo-member-budgets', HOUSEHOLD_ID, memberId] as const
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<KakeboMemberBudget[]>(key) ?? []
      if (monthly_budget === null) {
        queryClient.setQueryData<KakeboMemberBudget[]>(key, previous.filter(b => b.category_id !== categoryId))
      } else {
        const exists = previous.some(b => b.category_id === categoryId)
        queryClient.setQueryData<KakeboMemberBudget[]>(key, exists
          ? previous.map(b => b.category_id === categoryId ? { ...b, monthly_budget } : b)
          : [...previous, { member_id: memberId, category_id: categoryId, household_id: HOUSEHOLD_ID, monthly_budget }]
        )
      }
      return { previous, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.previous)
      showToast({ type: 'error', message: 'Impossible de sauvegarder le budget.' })
    },
  })
}

export function useUpdateMemberObjectif() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()

  return useMutation({
    mutationFn: async ({ memberId, objectif }: { memberId: string; objectif: number | null }) => {
      const { error } = await supabase.from('members')
        .update({ kakebo_objectif_epargne: objectif })
        .eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kakebo-members', HOUSEHOLD_ID] })
    },
    onError: () => showToast({ type: 'error', message: 'Impossible de sauvegarder l\'objectif.' }),
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
