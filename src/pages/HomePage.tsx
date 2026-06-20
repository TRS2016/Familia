import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ShoppingCart, Settings, Flame, Bell, Camera } from 'lucide-react'
import { useSignedPhotoUrls } from '../features/moments/useMoments'
import { quoteOfTheDay } from '../data/quotes'
import SlideUpModal from '../components/SlideUpModal'
import { format, addDays, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { HOUSEHOLD_ID } from '../lib/config'
import { useMember } from '../auth/useMember'
import { GROCERIES_KEY } from '../features/groceries/useGroceries'
import { useToggleCompletion, completionsKey } from '../features/habits/useHabits'
import { calcStreak } from '../features/habits/habits.utils'
import ChoresHomeWidget from '../features/chores/ChoresHomeWidget'
import type { HabitCompletion } from '../features/habits/useHabits'
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

interface HomeMoment {
  id: string
  member_id: string
  text: string | null
  photo_path: string | null
  photo_archived: boolean
  created_at: string
  member: { display_name: string } | null
  photos: { photo_path: string; position: number }[]
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
  const quote = quoteOfTheDay()

  // Notification manuelle au foyer
  const NOTIFY_PRESETS = ['J\'ai ajouté une ligne 📝', 'Je suis en route 🚗', 'À table ! 🍽️', 'Appelle-moi 📞', 'Pense aux courses 🛒']
  const [showNotify, setShowNotify]   = useState(false)
  const [notifyText, setNotifyText]   = useState('Coucou 👋')
  const [notifySending, setNotifySending] = useState(false)

  async function sendNotify() {
    const body = notifyText.trim()
    if (!body || !member) return
    setNotifySending(true)
    try {
      const { error } = await supabase.functions.invoke('notify-household', {
        body: { title: member.display_name, body, module: 'message' },
      })
      if (error) throw error
      showToast({ type: 'success', message: 'Notification envoyée au foyer.' })
      setShowNotify(false)
    } catch {
      showToast({ type: 'error', message: 'Impossible d\'envoyer la notification.' })
    } finally {
      setNotifySending(false)
    }
  }

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
        .is('member_id', null) // budget du foyer uniquement (opérations communes), pas les dépenses perso des membres
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
    queryKey: [...QK.homeHabits, member?.id],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd')
      const since = format(subDays(new Date(), 35), 'yyyy-MM-dd') // fenêtre pour le streak
      const dow   = new Date().getDay() === 0 ? 7 : new Date().getDay() // 1=lun…7=dim
      const [habitsRes, completionsRes] = await Promise.all([
        supabase.from('habits')
          .select('id, name, emoji, frequency_days, start_date')
          .eq('household_id', HOUSEHOLD_ID)
          .eq('member_id', member!.id) // uniquement les habitudes du membre connecté
          .is('archived_at', null)
          .order('created_at', { ascending: true }),
        supabase.from('habit_completions').select('habit_id, date, completed').gte('date', since).lte('date', today),
      ])
      if (habitsRes.error) throw habitsRes.error
      const all = (habitsRes.data ?? []) as HabitPreview[]
      const completions = (completionsRes.data ?? []) as HabitCompletion[]
      // filter to habits applicable today
      const applicable = all.filter(h => {
        if (h.start_date && today < h.start_date) return false
        if (h.frequency_days && h.frequency_days.length > 0) return h.frequency_days.includes(dow)
        return true
      })
      const doneIds = new Set(completions.filter(c => c.date === today && c.completed).map(c => c.habit_id))
      const pending = applicable
        .filter(h => !doneIds.has(h.id))
        .map(h => ({ ...h, streak: calcStreak(h, completions) }))
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

  const { data: lastMoment } = useQuery({
    queryKey: QK.homeMoments,
    queryFn: async (): Promise<HomeMoment | null> => {
      const { data, error } = await supabase
        .from('moments')
        .select('id, member_id, text, photo_path, photo_archived, created_at, member:members(display_name), photos:moment_photos(photo_path, position)')
        .eq('household_id', HOUSEHOLD_ID)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as unknown as HomeMoment | null
    },
    enabled: !!member,
  })

  // Photos du dernier moment : album trié, sinon photo_path legacy. Puis signed URLs.
  const momentPhotoPaths = useMemo(() => {
    if (!lastMoment) return []
    const album = (lastMoment.photos ?? []).slice().sort((a, b) => a.position - b.position).map(p => p.photo_path)
    if (album.length > 0) return album
    if (lastMoment.photo_path && !lastMoment.photo_archived) return [lastMoment.photo_path]
    return []
  }, [lastMoment])

  const { data: momentUrlMap = {} } = useSignedPhotoUrls(momentPhotoPaths)

  const { data: householdDetails, isLoading: householdLoading } = useQuery({
    queryKey: QK.householdDetails(member?.household_id ?? ''),
    queryFn: async (): Promise<HouseholdDetails> => {
      const [householdRes, membersRes] = await Promise.all([
        supabase
          .from('households')
          .select('name, kakebo_objectif_epargne')
          .eq('id', member!.household_id)
          .single(),
        supabase
          .from('members')
          .select('id, display_name')
          .eq('household_id', member!.household_id),
      ])
      if (householdRes.error) throw householdRes.error
      if (membersRes.error) throw membersRes.error
      const hd = householdRes.data as { name: string; kakebo_objectif_epargne: number | null }
      return {
        name: hd.name,
        kakebo_objectif_epargne: hd.kakebo_objectif_epargne,
        members: membersRes.data as { id: string; display_name: string }[],
      }
    },
    enabled: !!member,
  })

  const toggleHabit = useToggleCompletion()

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
          <button
            className={styles.settingsLink}
            onClick={() => { setNotifyText('Coucou 👋'); setShowNotify(true) }}
            aria-label="Notifier le foyer"
            title="Notifier le foyer"
          >
            <Bell size={20} strokeWidth={2} />
          </button>
          <Link to="/settings" className={styles.settingsLink} aria-label="Réglages">
            <Settings size={20} strokeWidth={2} />
          </Link>
        </div>
      </header>

      {showNotify && (
        <SlideUpModal title="Notifier le foyer" onClose={() => setShowNotify(false)}>
          <div className={styles.notifyForm}>
            <div className={styles.notifyPresets}>
              {NOTIFY_PRESETS.map(p => (
                <button
                  key={p}
                  type="button"
                  className={styles.notifyChip}
                  onClick={() => setNotifyText(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <textarea
              className={styles.notifyTextarea}
              value={notifyText}
              onChange={e => setNotifyText(e.target.value)}
              rows={3}
              placeholder="Votre message au foyer…"
              autoFocus
            />
            <button
              className={styles.notifySend}
              onClick={sendNotify}
              disabled={notifySending || !notifyText.trim()}
            >
              {notifySending ? 'Envoi…' : 'Envoyer au foyer'}
            </button>
          </div>
        </SlideUpModal>
      )}

      {/* Dashboard widgets — masonry 2 colonnes sur desktop */}
      <div className={styles.dashboard}>

      {/* Widget — Souffle du jour */}
      <div className={styles.widget}>
        <div className={styles.widgetHead}>
          <span className={styles.widgetLabel}>Souffle du jour</span>
        </div>
        <div className={[styles.card, styles.quoteCard].join(' ')}>
          <span className={styles.quoteMark} aria-hidden="true">“</span>
          <p className={styles.quoteText}>{quote.text}</p>
          <p className={styles.quoteAuthor}>— {quote.author}</p>
        </div>
      </div>

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
                <span className={styles.budgetCellValue} style={{ color: kakeboMonth.epargne >= 0 ? '#5B9E8F' : 'var(--danger)' }}>
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
                    {h.streak > 1 && <span className={styles.habitStreak}>🔥{h.streak}</span>}
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

      {/* Widget — Tâches / gamification */}
      {householdDetails && householdDetails.members.length > 0 && (
        <div className={styles.widget}>
          <ChoresHomeWidget members={householdDetails.members} />
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

      {/* Widget — Dernier moment */}
      {lastMoment && (() => {
        const photoCount = momentPhotoPaths.length
        const heroUrl    = photoCount > 0 ? momentUrlMap[momentPhotoPaths[0]] : undefined
        const author     = lastMoment.member?.display_name ?? '?'
        const members     = householdDetails?.members ?? []
        const memberIdx   = members.findIndex(hm => hm.id === lastMoment.member_id)
        const authorColor = MEMBER_PALETTE[memberIdx >= 0 ? memberIdx % MEMBER_PALETTE.length : 0]
        return (
          <div className={styles.widget}>
            <div className={styles.widgetHead}>
              <span className={styles.widgetLabel}>Dernier moment</span>
              <Link to="/moments" className={styles.widgetLink}>Voir tout</Link>
            </div>
            <Link to="/moments" className={[styles.card, styles.cardLink, styles.momentCard].join(' ')}>
              {photoCount > 0 && (
                <div className={styles.momentMedia}>
                  {photoCount > 1 && <span className={styles.momentStackBack2} />}
                  {photoCount > 1 && <span className={styles.momentStackBack1} />}
                  {heroUrl
                    ? <img src={heroUrl} className={styles.momentHero} alt="" loading="lazy" />
                    : <div className={styles.momentHeroSkeleton} />}
                  {photoCount > 1 && (
                    <span className={styles.momentCountBadge}>
                      <Camera size={12} strokeWidth={2.5} /> {photoCount}
                    </span>
                  )}
                </div>
              )}
              <div className={styles.momentFooter}>
                <span className={styles.momentDot} style={{ background: authorColor }} />
                <span className={styles.momentAuthor}>{author}</span>
                <span className={styles.momentPreview}>
                  {lastMoment.text ?? (photoCount > 0 ? '📸 Photo' : '')}
                </span>
              </div>
            </Link>
          </div>
        )
      })()}

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

