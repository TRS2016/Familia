import { useMemo, useState } from 'react'
import { Pencil, Plus, Check, X } from 'lucide-react'
import SlideUpModal from '../../components/SlideUpModal'
import EmptyState from '../../components/EmptyState'
import { memberColor } from '../../lib/constants'
import type { HouseholdMember } from './useChores'
import { useMemberTotals } from './useGamification'
import {
  useRewards, useRedemptions, useUpsertReward, useDeleteReward,
  useRedeemReward, useResolveRedemption, spendableBalance,
  type Reward,
} from './useRewards'
import styles from './ChoresPage.module.css'

interface Props {
  members: HouseholdMember[]
  currentMemberId: string | null
}

const EMOJIS = ['🎁','🍕','🍿','🎮','😴','🛁','☕','🍫','🎬','🛍️','💆','🏖️','🍷','⚽']

export default function RewardsTab({ members, currentMemberId }: Props) {
  const { data: rewards = [] } = useRewards()
  const { data: redemptions = [] } = useRedemptions()
  const { data: totals = new Map<string, number>() } = useMemberTotals()
  const upsert = useUpsertReward()
  const del = useDeleteReward()
  const redeem = useRedeemReward()
  const resolve = useResolveRedemption()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Reward | null>(null)

  const balance = currentMemberId ? spendableBalance(totals, redemptions, currentMemberId) : 0
  const nameById = useMemo(() => new Map(members.map(m => [m.id, m.display_name])), [members])
  const colorById = useMemo(() => {
    const m = new Map<string, string>()
    members.forEach((mem, i) => m.set(mem.id, memberColor(i)))
    return m
  }, [members])

  const pending = redemptions.filter(r => r.status === 'requested' || r.status === 'approved')
  const history = redemptions.filter(r => r.status === 'fulfilled' || r.status === 'declined').slice(0, 15)

  return (
    <div className={styles.progression}>
      {/* Solde */}
      <div className={styles.balanceCard}>
        <span className={styles.balanceLabel}>Ton solde dépensable</span>
        <span className={styles.balanceValue}>{balance} pts</span>
      </div>

      {/* Demandes en cours */}
      {pending.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>⏳ En cours</h2>
          {pending.map(r => {
            const mine = r.member_id === currentMemberId
            return (
              <div key={r.id} className={styles.goalCard}>
                <div className={styles.goalHead}>
                  <span className={styles.goalLabel}>{r.label}</span>
                  <span className={styles.points}>{r.cost_points} pts</span>
                </div>
                <span className={styles.goalMeta} style={{ color: colorById.get(r.member_id) }}>
                  {nameById.get(r.member_id) ?? '?'} · {r.status === 'approved' ? 'approuvée' : 'en attente'}
                </span>
                <div className={styles.actionRow}>
                  {r.status === 'requested' && !mine && (
                    <>
                      <button className={styles.approveBtn} onClick={() => resolve.mutate({ id: r.id, status: 'approved' })}><Check size={15} /> Approuver</button>
                      <button className={styles.declineBtn} onClick={() => resolve.mutate({ id: r.id, status: 'declined' })}><X size={15} /> Refuser</button>
                    </>
                  )}
                  {r.status === 'requested' && mine && <span className={styles.hint}>En attente de validation</span>}
                  {r.status === 'approved' && (
                    <button className={styles.approveBtn} onClick={() => resolve.mutate({ id: r.id, status: 'fulfilled' })}><Check size={15} /> Marquer remise</button>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* Catalogue */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>🎁 Récompenses</h2>
          <button className={styles.linkBtn} onClick={() => { setEditing(null); setFormOpen(true) }}><Plus size={14} /> Ajouter</button>
        </div>
        {rewards.length === 0 ? (
          <EmptyState emoji="🎁" title="Aucune récompense" description="Crée des récompenses à débloquer avec tes points (soirée resto, grasse mat…)." />
        ) : (
          <ul className={styles.list} style={{ padding: 0 }}>
            {rewards.map(rw => {
              const affordable = balance >= rw.cost_points
              const owner = rw.member_id ? nameById.get(rw.member_id) : null
              return (
                <li key={rw.id} className={styles.row}>
                  <span className={styles.rowEmoji} style={{ background: 'var(--bg-input)' }}>{rw.emoji}</span>
                  <div className={styles.rowMain}>
                    <span className={styles.rowName}>{rw.name}</span>
                    <span className={styles.rowMeta}>
                      <span className={styles.points}>{rw.cost_points} pts</span>
                      {owner && <span>pour {owner}</span>}
                    </span>
                  </div>
                  <button className={styles.iconBtn} onClick={() => { setEditing(rw); setFormOpen(true) }} aria-label="Modifier"><Pencil size={15} /></button>
                  <button
                    className={[styles.redeemBtn, affordable ? '' : styles.redeemDisabled].join(' ')}
                    disabled={!affordable || !currentMemberId}
                    onClick={() => currentMemberId && redeem.mutate({ rewardId: rw.id, memberId: currentMemberId, label: rw.name, requesterName: nameById.get(currentMemberId) })}>
                    Échanger
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Historique */}
      {history.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>📜 Historique</h2>
          {history.map(r => (
            <div key={r.id} className={styles.historyRow}>
              <span>{r.status === 'declined' ? '❌' : '✅'} {r.label}</span>
              <span className={styles.goalMeta}>{nameById.get(r.member_id) ?? '?'} · {r.cost_points} pts</span>
            </div>
          ))}
        </section>
      )}

      {formOpen && (
        <RewardForm
          members={members}
          initial={editing ?? undefined}
          onClose={() => setFormOpen(false)}
          onSubmit={(input) => { upsert.mutate({ id: editing?.id, ...input }); setFormOpen(false) }}
          onDelete={editing ? () => { del.mutate(editing.id); setFormOpen(false) } : undefined}
        />
      )}
    </div>
  )
}

// ── Modale récompense ─────────────────────────────────────────────────────────

interface FormProps {
  members: HouseholdMember[]
  initial?: Reward
  onClose: () => void
  onSubmit: (input: { name: string; emoji: string; cost_points: number; member_id: string | null }) => void
  onDelete?: () => void
}

function RewardForm({ members, initial, onClose, onSubmit, onDelete }: FormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🎁')
  const [cost, setCost] = useState(initial?.cost_points ?? 100)
  const [member, setMember] = useState<string | null>(initial?.member_id ?? null)

  function submit() {
    if (!name.trim() || cost <= 0) return
    onSubmit({ name, emoji, cost_points: cost, member_id: member })
  }

  return (
    <SlideUpModal title={initial ? 'Modifier la récompense' : 'Nouvelle récompense'} onClose={onClose}>
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>Nom</span>
          <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. Soirée resto" autoFocus />
        </label>
        <div className={styles.field}>
          <span className={styles.label}>Emoji</span>
          <div className={styles.chipRow}>
            {EMOJIS.map(em => (
              <button type="button" key={em} className={[styles.emojiChip, emoji === em ? styles.chipActive : ''].join(' ')} onClick={() => setEmoji(em)}>{em}</button>
            ))}
          </div>
        </div>
        <label className={styles.field}>
          <span className={styles.label}>Coût (points)</span>
          <input className={styles.input} type="number" min={1} value={cost} onChange={e => setCost(Math.max(1, Number(e.target.value) || 0))} />
        </label>
        <div className={styles.field}>
          <span className={styles.label}>Réservée à</span>
          <div className={styles.chipRow}>
            <button type="button" className={[styles.chip, member === null ? styles.chipActive : ''].join(' ')} onClick={() => setMember(null)}>Tous</button>
            {members.map(m => (
              <button type="button" key={m.id} className={[styles.chip, member === m.id ? styles.chipActive : ''].join(' ')} onClick={() => setMember(m.id)}>{m.display_name}</button>
            ))}
          </div>
        </div>
        <button className={styles.submitBtn} onClick={submit}>{initial ? 'Enregistrer' : 'Créer'}</button>
        {onDelete && <button className={styles.deleteBtn} onClick={onDelete}>Supprimer</button>}
      </div>
    </SlideUpModal>
  )
}
