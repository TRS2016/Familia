import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ShoppingCart, Calendar, Settings, BookOpen, Flame, Tv } from 'lucide-react'
import { format, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { HOUSEHOLD_ID } from '../lib/config'
import { useMember } from '../auth/useMember'
import { QK } from '../lib/query-keys'
import { useToast } from '../components/Toast'
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

  const { data: upcomingEvents } = useQuery({
    queryKey: ['home-events-upcoming', HOUSEHOLD_ID],
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

  const { data: groceryPreview } = useQuery({
    queryKey: ['home-groceries', HOUSEHOLD_ID],
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
  })

  const { data: householdDetails, isLoading: householdLoading } = useQuery({
    queryKey: QK.householdDetails(member?.household_id ?? ''),
    queryFn: async (): Promise<HouseholdDetails> => {
      const [householdRes, membersRes] = await Promise.all([
        supabase
          .from('households')
          .select('name')
          .eq('id', member!.household_id)
          .single(),
        supabase
          .from('members')
          .select('id, display_name')
          .eq('household_id', member!.household_id),
      ])
      if (householdRes.error) throw householdRes.error
      if (membersRes.error) throw membersRes.error
      return {
        name: (householdRes.data as { name: string }).name,
        members: membersRes.data as { id: string; display_name: string }[],
      }
    },
    enabled: !!member,
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
          <div>
            <div className={styles.navLabel}>Courses</div>
            <div className={styles.navSub}>Liste partagée</div>
          </div>
        </Link>
        <Link to="/calendar" className={styles.navCard}>
          <div className={styles.navIconWrap} style={{ background: 'rgba(224,123,84,0.15)' }}>
            <Calendar size={22} color="var(--accent)" strokeWidth={2} />
          </div>
          <div>
            <div className={styles.navLabel}>Calendrier</div>
            <div className={styles.navSub}>Agenda familial</div>
          </div>
        </Link>
        <Link to="/kakebo" className={styles.navCard}>
          <div className={styles.navIconWrap} style={{ background: 'rgba(155,122,196,0.15)' }}>
            <BookOpen size={22} color="#9B7AC4" strokeWidth={2} />
          </div>
          <div>
            <div className={styles.navLabel}>Budget</div>
            <div className={styles.navSub}>Kakebo familial</div>
          </div>
        </Link>
        <Link to="/habits" className={styles.navCard}>
          <div className={styles.navIconWrap} style={{ background: 'rgba(232,184,75,0.15)' }}>
            <Flame size={22} color="#E8B84B" strokeWidth={2} />
          </div>
          <div>
            <div className={styles.navLabel}>Habitudes</div>
            <div className={styles.navSub}>Suivi quotidien</div>
          </div>
        </Link>
        <Link to="/media" className={styles.navCard}>
          <div className={styles.navIconWrap} style={{ background: 'rgba(224,123,84,0.15)' }}>
            <Tv size={22} color="var(--accent)" strokeWidth={2} />
          </div>
          <div>
            <div className={styles.navLabel}>Médias</div>
            <div className={styles.navSub}>Films · Séries · Livres</div>
          </div>
        </Link>
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

      {/* Widget — Courses */}
      {groceryPreview && groceryPreview.length > 0 && (
        <div className={styles.widget}>
          <div className={styles.widgetHead}>
            <span className={styles.widgetLabel}>Courses</span>
            <Link to="/groceries" className={styles.widgetLink}>Voir tout</Link>
          </div>
          <div className={styles.card}>
            <div className={styles.groceryRow}>
              <ShoppingCart size={15} color="#5B9E8F" strokeWidth={2.5} />
              <span className={styles.groceryCount}>
                {groceryPreview.length} article{groceryPreview.length > 1 ? 's' : ''}
              </span>
            </div>
            <p className={styles.groceryNames}>
              {groceryPreview.slice(0, 5).map(g => g.name).join(' · ')}
              {groceryPreview.length > 5 ? ' · …' : ''}
            </p>
          </div>
        </div>
      )}

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

