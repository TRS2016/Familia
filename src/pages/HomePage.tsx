import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ShoppingCart, Calendar, Settings, BookOpen } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { useMember } from '../auth/useMember'
import LoadingPage from '../components/LoadingPage'
import styles from './HomePage.module.css'

const MEMBER_COLORS = ['#E07B54', '#5B9E8F', '#9B7AC4', '#E8B84B']

function Avatar({ name, index, size = 36 }: { name: string; index: number; size?: number }) {
  return (
    <div
      className={styles.avatar}
      style={{
        background: MEMBER_COLORS[index % MEMBER_COLORS.length],
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

export default function HomePage() {
  const { data: member } = useMember()

  const { data: householdDetails } = useQuery({
    queryKey: ['household-details', member?.household_id],
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
    await supabase.auth.signOut()
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
          {householdDetails && (
            <div className={styles.avatarStack}>
              {householdDetails.members.slice(0, 3).map((m, i) => (
                <div key={m.id} className={styles.avatarWrap}>
                  <Avatar name={m.display_name} index={i} size={36} />
                </div>
              ))}
            </div>
          )}
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
      </div>

      {/* Members */}
      {householdDetails && (
        <>
          <p className={styles.sectionLabel}>Foyer · {householdDetails.name}</p>
          <div className={styles.card}>
            <ul className={styles.membersList}>
              {householdDetails.members.map((m, i) => (
                <li key={m.id} className={styles.memberRow}>
                  <Avatar name={m.display_name} index={i} size={36} />
                  <span className={styles.memberName}>
                    {m.display_name}
                    {m.id === member.id && (
                      <span className={styles.memberYou}>· vous</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Sign out */}
      <div className={styles.footer}>
        <button onClick={handleSignOut} className={styles.signOutBtn}>
          Se déconnecter
        </button>
      </div>

    </div>
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
