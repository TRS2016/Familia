import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { HOUSEHOLD_ID } from '../../lib/config'
import { useMember } from '../../auth/useMember'
import { useToast } from '../../components/useToast'
import { useRealtimeInvalidation } from '../../lib/useRealtimeInvalidation'
import { POINTS_KEY } from '../chores/useGamification'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RuleStatus = 'pending' | 'active' | 'rejected' | 'archived'
export type RuleAction = 'add' | 'edit' | 'remove'

export interface HouseholdRule {
  id: string
  household_id: string
  text: string
  emoji: string
  priority: 1 | 2 | 3
  points: number
  position: number
  status: RuleStatus
  action: RuleAction
  replaces_rule_id: string | null
  proposed_by: string | null
  decided_by: string | null
  created_at: string
  decided_at: string | null
  proposer: { display_name: string } | null
}

export const PRIORITY_META: Record<1 | 2 | 3, { label: string; points: number; color: string }> = {
  1: { label: 'Sacré',     points: 15, color: '#C0392B' },
  2: { label: 'Important', points: 10, color: '#E07B54' },
  3: { label: 'Rituel',    points: 5,  color: '#5B9E8F' },
}

export const RULES_KEY    = ['household-rules', HOUSEHOLD_ID] as const
export const BREACHES_KEY = ['rule-breaches', HOUSEHOLD_ID] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
  'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII', 'XXVIII', 'XXIX', 'XXX',
  'XXXI', 'XXXII', 'XXXIII', 'XXXIV', 'XXXV', 'XXXVI', 'XXXVII', 'XXXVIII', 'XXXIX', 'XL',
  'XLI', 'XLII', 'XLIII', 'XLIV', 'XLV', 'XLVI', 'XLVII', 'XLVIII', 'XLIX', 'L']

export function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n)
}

/** Commandement du jour : rotation déterministe sur les actifs (comme le Souffle du jour). */
export function ruleOfTheDay(active: HouseholdRule[]): HouseholdRule | null {
  if (active.length === 0) return null
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000)
  return active[dayOfYear % active.length]
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useRules() {
  return useQuery({
    queryKey: RULES_KEY,
    queryFn: async (): Promise<HouseholdRule[]> => {
      const { data, error } = await supabase
        .from('household_rules')
        .select('*, proposer:members!household_rules_proposed_by_fkey(display_name)')
        .eq('household_id', HOUSEHOLD_ID)
        .in('status', ['active', 'pending'])
        .order('position', { ascending: true })
      if (error) throw error
      return data as unknown as HouseholdRule[]
    },
  })
}

export function useRulesRealtime() {
  useRealtimeInvalidation('rules-changes', [
    { table: 'household_rules', keys: [RULES_KEY] },
    { table: 'point_events', keys: [BREACHES_KEY] },
  ])
}

export interface RuleBreach {
  id: string
  member_id: string
  points: number
  reason: string
  created_at: string
}

/** Manquements confessés des 7 derniers jours (ledger point_events). */
export function useRecentBreaches() {
  return useQuery({
    queryKey: BREACHES_KEY,
    queryFn: async (): Promise<RuleBreach[]> => {
      const from = subDays(new Date(), 7).toISOString()
      const { data, error } = await supabase
        .from('point_events')
        .select('id, member_id, points, reason, created_at')
        .eq('household_id', HOUSEHOLD_ID)
        .eq('ref_type', 'rule_breach')
        .gte('created_at', from)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as RuleBreach[]
    },
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export interface ProposeRuleInput {
  action: RuleAction
  text: string
  emoji: string
  priority: 1 | 2 | 3
  points: number
  replaces_rule_id?: string | null
}

/** Propose un ajout, une révision ou un retrait — à valider par l'autre parent. */
export function useProposeRule() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (input: ProposeRuleInput) => {
      const { error } = await supabase.from('household_rules').insert({
        household_id: HOUSEHOLD_ID,
        text: input.text.trim(),
        emoji: input.emoji,
        priority: input.priority,
        points: input.points,
        position: Date.now(),
        status: 'pending',
        action: input.action,
        replaces_rule_id: input.replaces_rule_id ?? null,
        proposed_by: member?.id ?? null,
      } as never)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY })
      showToast({ type: 'success', message: 'Proposition soumise à l\'autre parent 🕊️' })
    },
    onError: () => showToast({ type: 'error', message: 'Impossible de soumettre la proposition.' }),
  })
}

/** Approuve ou refuse une proposition (réservé à l'autre parent — vérifié en UI). */
export function useDecideRule() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async ({ rule, approve }: { rule: HouseholdRule; approve: boolean }) => {
      const decided = { decided_by: member?.id ?? null, decided_at: new Date().toISOString() }
      if (!approve) {
        const { error } = await supabase.from('household_rules')
          .update({ status: 'rejected', ...decided } as never).eq('id', rule.id)
        if (error) throw error
        return
      }
      if (rule.action === 'add') {
        const { error } = await supabase.from('household_rules')
          .update({ status: 'active', ...decided } as never).eq('id', rule.id)
        if (error) throw error
        return
      }
      // edit / remove : l'original est archivé dans les deux cas.
      if (rule.replaces_rule_id) {
        const { error } = await supabase.from('household_rules')
          .update({ status: 'archived', ...decided } as never).eq('id', rule.replaces_rule_id)
        if (error) throw error
      }
      if (rule.action === 'edit') {
        // La révision prend la place de l'original dans l'ordre de lecture.
        const { data: orig } = rule.replaces_rule_id
          ? await supabase.from('household_rules').select('position').eq('id', rule.replaces_rule_id).single()
          : { data: null }
        const { error } = await supabase.from('household_rules')
          .update({ status: 'active', position: orig?.position ?? rule.position, ...decided } as never)
          .eq('id', rule.id)
        if (error) throw error
      } else {
        // remove : la proposition elle-même est classée (l'original est archivé).
        const { error } = await supabase.from('household_rules')
          .update({ status: 'archived', ...decided } as never).eq('id', rule.id)
        if (error) throw error
      }
    },
    onSuccess: (_d, { approve }) => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY })
      showToast({
        type: 'success',
        message: approve ? 'Qu\'il en soit ainsi — la loi du foyer est amendée 📜' : 'Proposition refusée.',
      })
    },
    onError: () => showToast({ type: 'error', message: 'Décision impossible.' }),
  })
}

/** Retire une proposition qu'on a soi-même soumise (avant décision). */
export function useWithdrawProposal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('household_rules').delete().eq('id', id).eq('status', 'pending')
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RULES_KEY }),
  })
}

/** Confession d'un manquement : retire les points du commandement au membre. */
export function useConfessBreach() {
  const queryClient = useQueryClient()
  const { data: member } = useMember()
  const { showToast } = useToast()
  return useMutation({
    mutationFn: async (rule: HouseholdRule) => {
      if (!member) throw new Error('no member')
      const shortText = rule.text.length > 70 ? `${rule.text.slice(0, 70)}…` : rule.text
      const { error } = await supabase.from('point_events').insert({
        household_id: HOUSEHOLD_ID,
        member_id: member.id,
        points: -Math.abs(rule.points),
        reason: `⚖️ ${rule.emoji} ${shortText}`,
        ref_type: 'rule_breach',
        ref_id: rule.id,
      } as never)
      if (error) throw error
      return rule.points
    },
    onSuccess: (points) => {
      queryClient.invalidateQueries({ queryKey: BREACHES_KEY })
      queryClient.invalidateQueries({ queryKey: POINTS_KEY })
      showToast({ type: 'success', message: `Confession reçue : -${points} pts. Le foyer apprécie ton honnêteté 🙏` })
    },
    onError: () => showToast({ type: 'error', message: 'Impossible d\'enregistrer la confession.' }),
  })
}

/** Date de manquement lisible (aujourd'hui / hier / jour). */
export function breachDayLabel(iso: string): string {
  const d = iso.slice(0, 10)
  const today = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  if (d === today) return 'aujourd\'hui'
  if (d === yesterday) return 'hier'
  return format(new Date(d + 'T12:00'), 'EEEE', { locale: fr })
}
