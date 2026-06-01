import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ShoppingCart, Calendar, Settings, BookOpen, Flame, Tv, Camera, Music } from 'lucide-react'
import { format, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { HOUSEHOLD_ID } from '../lib/config'
import { useMember } from '../auth/useMember'
import { GROCERIES_KEY } from '../features/groceries/useGroceries'
import { useToggleCompletion, completionsKey } from '../features/habits/useHabits'
import { QK } from '../lib/query-keys'
import { useToast } from '../components/useToast'
import LoadingPage from '../components/LoadingPage'
import { MEMBER_PALETTE } from '../lib/constants'
import { capitalize } from '../lib/utils'
import styles from './HomePage.module.css'

function Avatar({ name, index, size = 36 }: { name: string; index: number; size?: number }) {
  return (
    <div
      className={styles.avatar}
      style={{
        background: MEMBER_PALETTE[index % MEMBER_PALETTE.length],
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
      }}
    >
      {name.trim().slice(0, 2).toUpperCase()}
    </div>
  )
}

interface HouseholdDetails {
  name: string
  members: { id: string; display_name: string }[]
  note: string | null
  kakebo_objectif_epargne: number | null
}

interface UpcomingEvent {
  id: string
  title: string
  date: string
  member_id: string | null
}

interface GroceryPreview {
  id: string
  name: string
}

interface MomentPreview {
  id: string
  member_id: string
  text: string | null
  photo_path: string | null
  created_at: string
  member: { id: string; display_name: string } | null
}

interface HabitPreview {
  id: string
  name: string
  emoji: string
  frequency_days: number[] | null
  start_date: string | null
}

interface MediaInProgress {
  id: string
  title: string
  type: string
  member_id: string | null
  member: { display_name: string } | null
}

const MEDIA_EMOJI: Record<string, string> = {
  film: '🎬', série: '📺', livre: '📚', jeu: '🎮',
}

function eventDateLabel(dateStr: string): string {
  const today    = format(new Date(), 'yyyy-MM-dd')
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  if (dateStr === today)    return 'Auj.'
  if (dateStr === tomorrow) return 'Dem.'
  const [y, m, d] = dateStr.split('-').map(Number)
  return capitalize(format(new Date(y, m - 1, d), 'EEE d MMM', { locale: fr }))
}

export default function HomePage() {
  const { data: member } = useMember()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [noteText, setNoteText] = useState('')

  const { data: upcomingEvents } = useQuery({
    queryKey: QK.homeEvents,
    queryFn: async (): Promise<UpcomingEvent[]> => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('events')
        .select('id, title, date, member_id')
        .eq('household_id', HOUSEHOLD_ID)
        .gte('date', today)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: true })
        .limit(4)
      if (error) throw error
      return data as UpcomingEvent[]
    },
    enabled: !!member,
  })

  const { data: kakeboMonth } = useQuery({
    queryKey: QK.homeKakebo,
    queryFn: async () => {
      const now  = new Date()
      const from = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')
      const to   = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('kakebo_entries')
        .select('amount, category:kakebo_categories(type)')
        .eq('household_id', HOUSEHOLD_ID)
        .gte('date', from)
        .lte('date', to)
      if (error) throw error
      type Row = { amount: number; category: { type: string } | null }
      const rows = data as unknown as Row[]
      const income   = rows.filter(r => r.category?.type === 'income').reduce((s, r) => s + Number(r.amount), 0)
      const expenses = rows.filter(r => r.category?.type !== 'income').reduce((s, r) => s + Number(r.amount), 0)
      return { income, expenses, epargne: income - expenses }
    },
    enabled: !!member,
  })

  const { data: habitsToday } = useQuery({
    queryKey: QK.homeHabits,
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const dow   = new Date().getDay() === 0 ? 7 : new Date().getDay() // 1=lun…7=dim
      const [habitsRes, completionsRes] = await Promise.all([
        supabase.from('habits')
          .select('id, name, emoji, frequency_days, start_date')
          .eq('household_id', HOUSEHOLD_ID)
          .is('archived_at', null)
          .order('created_at', { ascending: true }),
        supabase.from('habit_completions').select('habit_id').eq('date', today).eq('completed', true),
      ])
      if (habitsRes.error) throw habitsRes.error
      const all = (habitsRes.data ?? []) as HabitPreview[]
      // filter to habits applicable today
      const applicable = all.filter(h => {
        if (h.start_date && today < h.start_date) return false
        if (h.frequency_days && h.frequency_days.length > 0) return h.frequency_days.includes(dow)
        return true
      })
      const doneIds = new Set((completionsRes.data ?? []).map((c: { habit_id: string }) => c.habit_id))
      const pending = applicable.filter(h => !doneIds.has(h.id))
      return { total: applicable.length, done: applicable.length - pending.length, pending }
    },
    enabled: !!member,
  })

  const { data: groceryPreview } = useQuery({
    queryKey: [...GROCERIES_KEY, 'preview'],
    queryFn: async (): Promise<GroceryPreview[]> => {
      const { data, error } = await supabase
        .from('groceries')
        .select('id, name')
        .eq('household_id', HOUSEHOLD_ID)
        .eq('checked', false)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data as GroceryPreview[]
    },
    enabled: !!member,
    staleTime: 0,
  })

  const { data: mediaInProgress } = useQuery({
    queryKey: QK.homeMedia,
    queryFn: async (): Promise<MediaInProgress[]> => {
      const { data, error } = await supabase
        .from('media_items')
        .select('id, title, type, member_id, member:members(display_name)')
        .eq('household_id', HOUSEHOLD_ID)
        .eq('status', 'en cours')
        .order('created_at', { ascending: false })
        .limit(4)
      if (error) throw error
      return data as unknown as MediaInProgress[]
    },
    enabled: !!member,
  })

  const { data: recentMoments } = useQuery({
    queryKey: QK.homeMoments,
    queryFn: async (): Promise<MomentPreview[]> => {
      const { data, error } = await supabase
        .from('moments')
        .select('id, member_id, text, photo_path, created_at, member:members(id, display_name)')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
        .limit(3)
      if (error) throw error
      return data as unknown as MomentPreview[]
    },
    enabled: !!member,
  })

  const { data: householdDetails, isLoading: householdLoading } = useQuery({
    queryKey: QK.householdDetails(member?.household_id ?? ''),
    queryFn: async (): Promise<HouseholdDetails> => {
      const [householdRes, membersRes] = await Promise.all([
        supabase
          .from('households')
          .select('name, note, kakebo_objectif_epargne')
          .eq('id', member!.household_id)
          .single(),
        supabase
          .from('members')
          .select('id, display_name')
          .eq('household_id', member!.household_id),
      ])
      if (householdRes.error) throw householdRes.error
      if (membersRes.error) throw membersRes.error
      const hd = householdRes.data as { name: string; note: string | null; kakebo_objectif_epargne: number | null }
      return {
        name: hd.name,
        note: hd.note,
        kakebo_objectif_epargne: hd.kakebo_objectif_epargne,
        members: membersRes.data as { id: string; display_name: string }[],
      }
    },
    enabled: !!member,
  })

  // Sync note text when household loads (async — must stay in effect)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (householdDetails?.note != null) setNoteText(householdDetails.note)
  }, [householdDetails?.note])
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleHabit = useToggleCompletion()

  const saveNote = useMutation({
    mutationFn: async (note: string) => {
      const { error } = await supabase.from('households').update({ note: note || null }).eq('id', member!.household_id)
      if (error) throw error
    },
    onSuccess: (_, note) => {
      queryClient.setQueryData(
        QK.householdDetails(member!.household_id),
        (old: HouseholdDetails | undefined) => old ? { ...old, note: note || null } : old
      )
    },
    onError: () => showToast({ type: 'error', message: 'Impossible de sauvegarder la note.' }),
  })

  if (!member) return <LoadingPage />

  const todayLabel = capitalize(format(new Date(), 'EEEE d MMMM', { locale: fr }))

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()
    if (error) showToast({ type: 'error', message: 'Impossible de se déconnecter.' })
  }

  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <div>
          <p className={styles.date}>{todayLabel}</p>
          <h1 className={styles.greeting}>Bonjour {member.display_name} 👋</h1>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.avatarStack}>
            {householdLoading || !householdDetails
              ? [0, 1].map(i => (
                  <div key={i} className={styles.avatarWrap}>
                    <div className={styles.skeletonAvatar} />
                  </div>
                ))
              : householdDetails.members.slice(0, 3).map((m, i) => (
                  <div key={m.id} className={styles.avatarWrap}>
                    <Avatar name={m.display_name} index={i} size={36} />
                  </div>
                ))
            }
          </div>
          <Link to="/settings" className={styles.settingsLink} aria-label="Réglages">
            <Settings size={20} strokeWidth={2} />
          </Link>
        </div>
      </header>

      {/* Nav cards */}
      <p className={styles.sectionLabel}>Accès rapide</p>
      <div className={styles.navGrid}>
        <Link to="/groceries" className={styles.navCard}>
          <div className={styles.navIconWrap} style={{ background: 'rgba(91,158,143,0.15)' }}>
            <ShoppingCart size={22} color="#5B9E8F" strokeWidth={2} />
          </div>
          <div className={styles.navText}>
            <div className={styles.navLabel}>Courses</div>
            <div className={styles.navSub}>Liste partagée</div>
          </div>
        </Link>
        <Link to="/calendar" className={styles.navCard}>
          <div className={styles.navIconWrap} style={{ background: 'rgba(224,123,84,0.15)', position: 'relative' }}>
            <Calendar size={22} color="var(--accent)" strokeWidth={2} />
            {upcomingEvents && upcomingEvents.length > 0 && (
              <span className={styles.navBadge}>{upcomingEvents.length}</span>
            )}
          </div>
          <div className={styles.navText}>
            <div className={styles.navLabel}>Calendrier</div>
            <div className={styles.navSub}>Agenda familial</div>
          </div>
        </Link>
        <Link to="/kakebo" className={styles.navCard}>
          <div className={styles.navIconWrap} style={{ background: 'rgba(155,122,196,0.15)' }}>
            <BookOpen size={22} color="#9B7AC4" strokeWidth={2} />
          </div>
          <div className={styles.navText}>
            <div className={styles.navLabel}>Budget</div>
            <div className={styles.navSub}>Kakebo familial</div>
          </div>
        </Link>
        <Link to="/habits" className={styles.navCard}>
          <div className={styles.navIconWrap} style={{ background: 'rgba(232,184,75,0.15)' }}>
            <Flame size={22} color="#E8B84B" strokeWidth={2} />
          </div>
          <div className={styles.navText}>
            <div className={styles.navLabel}>Habitudes</div>
            <div className={styles.navSub}>Suivi quotidien</div>
          </div>
        </Link>
        <Link to="/media" className={styles.navCard}>
          <div className={styles.navIconWrap} style={{ background: 'rgba(224,123,84,0.15)' }}>
            <Tv size={22} color="var(--accent)" strokeWidth={2} />
          </div>
          <div className={styles.navText}>
            <div className={styles.navLabel}>Médias</div>
            <div className={styles.navSub}>Films · Séries · Livres</div>
          </div>
        </Link>
        <Link to="/lecteur" className={styles.navCard}>
          <div className={styles.navIconWrap} style={{ background: 'rgba(155,122,196,0.15)' }}>
            <Music size={22} color="#9B7AC4" strokeWidth={2} />
          </div>
          <div className={styles.navText}>
            <div className={styles.navLabel}>Lecteur</div>
            <div className={styles.navSub}>Audio · Vidéo · Maison</div>
          </div>
        </Link>
        <Link to="/moments" className={styles.navCard}>
          <div className={styles.navIconWrap} style={{ background: 'rgba(212,119,138,0.15)' }}>
            <Camera size={22} color="#D4778A" strokeWidth={2} />
          </div>
          <div className={styles.navText}>
            <div className={styles.navLabel}>Moments</div>
            <div className={styles.navSub}>Journal photo</div>
          </div>
        </Link>
      </div>

      {/* Dashboard widgets — masonry 2 colonnes sur desktop */}
      <div className={styles.dashboard}>

      {/* Widget — Événements à venir */}
      {upcomingEvents && upcomingEvents.length > 0 && (
        <div className={styles.widget}>
          <div className={styles.widgetHead}>
            <span className={styles.widgetLabel}>À venir</span>
            <Link to="/calendar" className={styles.widgetLink}>Voir tout</Link>
          </div>
          <div className={styles.card}>
            <ul className={styles.eventsList}>
              {upcomingEvents.map((event, i) => {
                const members = householdDetails?.members ?? []
                const idx = members.findIndex(m => m.id === event.member_id)
                const color = idx >= 0 ? MEMBER_PALETTE[idx % MEMBER_PALETTE.length] : undefined
                return (
                  <li key={event.id} className={[styles.eventRow, i === 0 ? styles.eventRowFirst : ''].join(' ')}>
                    <span className={styles.eventDate}>{eventDateLabel(event.date)}</span>
                    <span className={styles.eventTitle}>{event.title}</span>
                    {color && <span className={styles.eventDot} style={{ background: color }} />}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Widget — Budget du mois */}
      {kakeboMonth && (kakeboMonth.expenses > 0 || kakeboMonth.income > 0) && (
        <div className={styles.widget}>
          <div className={styles.widgetHead}>
            <span className={styles.widgetLabel}>Budget du mois</span>
            <Link to="/kakebo" className={styles.widgetLink}>Voir tout</Link>
          </div>
          <div className={styles.card}>
            <div className={styles.budgetGrid}>
              <div className={styles.budgetCell}>
                <span className={styles.budgetCellLabel}>Revenus</span>
                <span className={styles.budgetCellValue} style={{ color: '#5B9E8F' }}>
                  +{kakeboMonth.income.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                </span>
              </div>
              <div className={styles.budgetCell}>
                <span className={styles.budgetCellLabel}>Dépenses</span>
                <span className={styles.budgetCellValue} style={{ color: 'var(--accent)' }}>
                  -{kakeboMonth.expenses.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                </span>
              </div>
              <div className={styles.budgetCell}>
                <span className={styles.budgetCellLabel}>Épargne</span>
                <span className={styles.budgetCellValue} style={{ color: kakeboMonth.epargne >= 0 ? '#5B9E8F' : '#c0392b' }}>
                  {kakeboMonth.epargne >= 0 ? '+' : ''}{kakeboMonth.epargne.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                </span>
              </div>
            </div>
            {(() => {
              const objectif = householdDetails?.kakebo_objectif_epargne ?? 0
              if (objectif <= 0) return null
              const pct = Math.max(0, Math.min(1, kakeboMonth.epargne / objectif))
              const ok  = kakeboMonth.epargne >= objectif
              return (
                <div className={styles.budgetBarWrap}>
                  <div className={styles.budgetBarTrack}>
                    <div className={styles.budgetBarFill} style={{ width: `${pct * 100}%`, background: ok ? '#5B9E8F' : 'var(--accent)' }} />
                  </div>
                  <span className={styles.budgetBarLabel}>
                    Objectif {objectif.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                  </span>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Widget — Médias en cours */}
      {mediaInProgress && mediaInProgress.length > 0 && (
        <div className={styles.widget}>
          <div className={styles.widgetHead}>
            <span className={styles.widgetLabel}>En cours</span>
            <Link to="/media" className={styles.widgetLink}>Catalogue</Link>
          </div>
          <div className={styles.card}>
            <ul className={styles.mediaList}>
              {mediaInProgress.map((m, i) => {
                const members   = householdDetails?.members ?? []
                const memberIdx = members.findIndex(hm => hm.id === m.member_id)
                const color     = memberIdx >= 0 ? MEMBER_PALETTE[memberIdx % MEMBER_PALETTE.length] : 'var(--text-muted)'
                return (
                  <li key={m.id} className={[styles.mediaRow, i > 0 ? styles.mediaRowBorder : ''].join(' ')}>
                    <span className={styles.mediaEmoji}>{MEDIA_EMOJI[m.type] ?? '📺'}</span>
                    <span className={styles.mediaTitle}>{m.title}</span>
                    {m.member && <span className={styles.mediaMember} style={{ color }}>{m.member.display_name}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Widget — Habitudes */}
      {habitsToday && habitsToday.total > 0 && (
        <div className={styles.widget}>
          <div className={styles.widgetHead}>
            <span className={styles.widgetLabel}>Habitudes</span>
            <Link to="/habits" className={styles.widgetLink}>Voir tout</Link>
          </div>
          <div className={styles.card}>
            <div className={styles.summaryRow}>
              <Flame size={15} color="#E8B84B" strokeWidth={2.5} />
              <span className={styles.summaryAmount}>{habitsToday.done}/{habitsToday.total}</span>
              <span className={styles.summarySub}>faites aujourd'hui</span>
            </div>
            {habitsToday.pending.length > 0 && (
              <div className={styles.habitsPending}>
                {habitsToday.pending.slice(0, 4).map(h => (
                  <button
                    key={h.id}
                    className={styles.habitPendingChip}
                    onClick={e => {
                      e.preventDefault()
                      const today = format(new Date(), 'yyyy-MM-dd')
                      toggleHabit.mutate({ habitId: h.id, date: today, done: true })
                      queryClient.invalidateQueries({ queryKey: QK.homeHabits })
                      queryClient.invalidateQueries({ queryKey: completionsKey('recent') })
                    }}
                  >
                    {h.emoji} {h.name}
                  </button>
                ))}
                {habitsToday.pending.length > 4 && (
                  <span className={styles.habitPendingMore}>+{habitsToday.pending.length - 4}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Widget — Courses */}
      {groceryPreview && groceryPreview.length > 0 && (
        <div className={styles.widget}>
          <div className={styles.widgetHead}>
            <span className={styles.widgetLabel}>Courses</span>
            <Link to="/groceries" className={styles.widgetLink}>Voir tout</Link>
          </div>
          <Link to="/groceries" className={[styles.card, styles.cardLink].join(' ')}>
            <div className={styles.groceryRow}>
              <ShoppingCart size={15} color="#5B9E8F" strokeWidth={2.5} />
              <span className={styles.groceryCount}>
                {groceryPreview.length} article{groceryPreview.length > 1 ? 's' : ''} à faire
              </span>
            </div>
            <p className={styles.groceryNames}>
              {groceryPreview.slice(0, 5).map(g => g.name).join(' · ')}
              {groceryPreview.length > 5 ? ' · …' : ''}
            </p>
          </Link>
        </div>
      )}

      {/* Widget — Moments récents */}
      {recentMoments && recentMoments.length > 0 && (
        <div className={styles.widget}>
          <div className={styles.widgetHead}>
            <span className={styles.widgetLabel}>Moments</span>
            <Link to="/moments" className={styles.widgetLink}>Voir tout</Link>
          </div>
          <div className={styles.card}>
            <ul className={styles.momentsList}>
              {recentMoments.map((m, i) => {
                const members    = householdDetails?.members ?? []
                const memberIdx  = members.findIndex(hm => hm.id === m.member_id)
                const color      = MEMBER_PALETTE[memberIdx >= 0 ? memberIdx % MEMBER_PALETTE.length : 0]
                const preview    = m.text
                  ? (m.text.length > 55 ? m.text.slice(0, 52) + '…' : m.text)
                  : '📸 Photo'
                return (
                  <li key={m.id} className={[styles.momentRow, i === 0 ? styles.momentRowFirst : ''].join(' ')}>
                    <span className={styles.momentDot} style={{ background: color }} />
                    <span className={styles.momentAuthor}>{m.member?.display_name ?? '?'}</span>
                    <span className={styles.momentPreview}>{preview}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Widget — Mémo partagé */}
      <div className={styles.widget}>
        <div className={styles.widgetHead}>
          <span className={styles.widgetLabel}>Mémo du foyer</span>
          {saveNote.isPending && <span className={styles.noteSaving}>enregistrement…</span>}
        </div>
        <div className={styles.card}>
          <textarea
            className={styles.noteTextarea}
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onBlur={() => {
              const trimmed = noteText.trim()
              const current = householdDetails?.note ?? ''
              if (trimmed !== current) saveNote.mutate(trimmed)
            }}
            placeholder="Laissez un message pour toute la famille…"
            rows={3}
          />
        </div>
      </div>

      </div>{/* /dashboard */}

      {/* Members */}
      <p className={styles.sectionLabel}>
        Foyer{householdDetails ? ` · ${householdDetails.name}` : ''}
      </p>
      <div className={styles.card}>
        <ul className={styles.membersList}>
          {householdLoading || !householdDetails
            ? [0, 1].map(i => (
                <li key={i} className={styles.memberRow}>
                  <div className={styles.skeletonAvatar} />
                  <div className={styles.skeletonText} style={{ width: 80 + i * 24 }} />
                </li>
              ))
            : householdDetails.members.map((m, i) => (
                <li key={m.id} className={styles.memberRow}>
                  <Avatar name={m.display_name} index={i} size={36} />
                  <span className={styles.memberName}>
                    {m.display_name}
                    {m.id === member.id && (
                      <span className={styles.memberYou}>· vous</span>
                    )}
                  </span>
                </li>
              ))
          }
        </ul>
      </div>

      {/* Sign out */}
      <div className={styles.footer}>
        <button onClick={handleSignOut} className={styles.signOutBtn}>
          Se déconnecter
        </button>
      </div>

    </div>
  )
}

