import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, ShoppingCart, Calendar, Flame, Grid2x2 } from 'lucide-react'
import SlideUpModal from './SlideUpModal'
import styles from './BottomNav.module.css'

const MAIN_TABS = [
  { to: '/',          Icon: Home,         label: 'Accueil',   exact: true  },
  { to: '/groceries', Icon: ShoppingCart, label: 'Courses',   exact: false },
  { to: '/calendar',  Icon: Calendar,     label: 'Agenda',    exact: false },
  { to: '/habits',    Icon: Flame,        label: 'Habitudes', exact: false },
]

const MORE_ITEMS = [
  { to: '/kakebo',   emoji: '📒', label: 'Budget'   },
  { to: '/moments',  emoji: '📸', label: 'Moments'  },
  { to: '/media',    emoji: '🎬', label: 'Médias'   },
  { to: '/lecteur',  emoji: '🎵', label: 'Lecteur'  },
  { to: '/settings', emoji: '⚙️', label: 'Réglages' },
]

export default function BottomNav() {
  const { pathname } = useLocation()
  const [showMore, setShowMore] = useState(false)

  function isActive(to: string, exact: boolean) {
    if (exact) return pathname === to
    return pathname === to || pathname.startsWith(to + '/')
  }

  const moreActive = MORE_ITEMS.some(
    item => pathname === item.to || pathname.startsWith(item.to + '/')
  )

  return (
    <>
      <nav className={styles.nav}>
        {MAIN_TABS.map(({ to, Icon, label, exact }) => {
          const active = isActive(to, exact)
          return (
            <Link
              key={to}
              to={to}
              className={[styles.tab, active ? styles.tabActive : ''].join(' ')}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className={styles.tabLabel}>{label}</span>
            </Link>
          )
        })}
        <button
          className={[styles.tab, (showMore || moreActive) ? styles.tabActive : ''].join(' ')}
          onClick={() => setShowMore(s => !s)}
          aria-label="Plus"
        >
          <Grid2x2 size={22} strokeWidth={(showMore || moreActive) ? 2.5 : 2} />
          <span className={styles.tabLabel}>Plus</span>
        </button>
      </nav>

      {showMore && (
        <SlideUpModal title="Toutes les sections" onClose={() => setShowMore(false)}>
          <div className={styles.moreGrid}>
            {MORE_ITEMS.map(item => {
              const active = pathname === item.to || pathname.startsWith(item.to + '/')
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={[styles.moreItem, active ? styles.moreItemActive : ''].join(' ')}
                  onClick={() => setShowMore(false)}
                >
                  <span className={styles.moreEmoji}>{item.emoji}</span>
                  <span className={styles.moreLabel}>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </SlideUpModal>
      )}
    </>
  )
}
