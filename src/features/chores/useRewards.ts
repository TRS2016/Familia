import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useToast } from '../../components/useToast'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Reward {
  id: string
  household_id: string
  name: string
  emoji: string
  cost_points: number
  member_id: string | null
  active: boolean
  created_at: string
}

export interface RewardRedemption {
  id: string
  household_id: string
  reward_id: string | null
  member_id: string
  label: string
  cost_points: number
  status: 'requested' | 'approved' | 'fulfilled' | 'declined'
  created_at: string
  resolved_at: string | null
}

export interface RewardInput {
  name: string
  emoji: string
  cost_points: number
  member_id: string | null
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const REWARDS_KEY     = ['rewards', HOUSEHOLD_ID] as const
export const REDEMPTIONS_KEY = ['reward-redemptions', HOUSEHOLD_ID] as const

// ── Solde dépensable (pur) ────────────────────────────────────────────────────
// = XP gagné (total serveur) − coût des échanges non refusés. L'XP à vie reste
// intact ; seul le solde dépensable baisse. Reflète spendable_balance() en SQL.
export function spendableBalance(totals: Map<string, number>, redemptions: RewardRedemption[], memberId: string): number {
  const earned = totals.get(memberId) ?? 0
  const spent = redemptions
    .filter(r => r.member_id === memberId && r.status !== 'declined')
    .reduce((s, r) => s + r.cost_points, 0)
  return earned - spent
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useRewards() {
  return useQuery({
    queryKey: REWARDS_KEY,
    queryFn: async (): Promise<Reward[]> => {
      const { data, error } = await supabase
        .from('rewards')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .eq('active', true)
        .order('cost_points', { ascending: true })
      if (error) throw error
      return data as unknown as Reward[]
    },
  })
}

export function useRedemptions() {
  return useQuery({
    queryKey: REDEMPTIONS_KEY,
    queryFn: async (): Promise<RewardRedemption[]> => {
      const { data, error } = await supabase
        .from('reward_redemptions')
        .select('*')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as RewardRedemption[]
    },
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useUpsertReward() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (input: RewardInput & { id?: string }) => {
      const payload = { name: input.name.trim(), emoji: input.emoji, cost_points: input.cost_points, member_id: input.member_id }
      if (input.id) {
        const { error } = await supabase.from('rewards').update(payload as never).eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('rewards').insert({ household_id: HOUSEHOLD_ID, ...payload } as never)
        if (error) throw error
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REWARDS_KEY }),
    onError: () => showToast({ type: 'error', message: 'Impossible d\'enregistrer la récompense.' }),
  })
}

export function useDeleteReward() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rewards').update({ active: false } as never).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REWARDS_KEY }),
  })
}

export function useRedeemReward() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async ({ rewardId, memberId }: { rewardId: string; memberId: string }) => {
      const { error } = await supabase.rpc('redeem_reward', { p_reward_id: rewardId, p_member_id: memberId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: REDEMPTIONS_KEY })
      showToast({ type: 'success', message: 'Demande envoyée 🎁' })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error && /solde insuffisant/.test(err.message)
        ? 'Solde insuffisant pour cette récompense.'
        : 'Impossible d\'échanger cette récompense.'
      showToast({ type: 'error', message: msg })
    },
  })
}

export function useResolveRedemption() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'fulfilled' | 'declined' }) => {
      const { error } = await supabase.rpc('resolve_redemption', { p_redemption_id: id, p_status: status })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REDEMPTIONS_KEY }),
    onError: () => showToast({ type: 'error', message: 'Action impossible.' }),
  })
}
