import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Home, ShoppingCart, Calendar, Flame, Grid2x2,
  BookOpen, Camera, Tv, Music, Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import SlideUpModal from './SlideUpModal'
import styles from './BottomNav.module.css'

// ── Mobile bottom bar ─────────────────────────────────────────────────────────

const MOBILE_TABS: { to: string; Icon: LucideIcon; label: string; exact: boolean }[] = [
  { to: '/',          Icon: Home,         label: 'Accueil',    exact: true  },
  { to: '/groceries', Icon: ShoppingCart, label: 'Courses',    exact: false },
  { to: '/calendar',  Icon: Calendar,     label: 'Agenda',     exact: false },
  { to: '/habits',    Icon: Flame,        label: 'Habitudes',  exact: false },
]

const MOBILE_MORE = [
  { to: '/kakebo',   emoji: '📒', label: 'Budget'   },
  { to: '/moments',  emoji: '📸', label: 'Moments'  },
  { to: '/media',    emoji: '🎬', label: 'Médias'   },
  { to: '/lecteur',  emoji: '🎵', label: 'Lecteur'  },
  { to: '/settings', emoji: '⚙️', label: 'Réglages' },
]

// ── Desktop sidebar ───────────────────────────────────────────────────────────

const SIDEBAR_ITEMS: { to: string; Icon: LucideIcon; label: string; exact: boolean }[] = [
  { to: '/',          Icon: Home,         label: 'Accueil',    exact: true  },
  { to: '/groceries', Icon: ShoppingCart, label: 'Courses',    exact: false },
  { to: '/calendar',  Icon: Calendar,     label: 'Agenda',     exact: false },
  { to: '/habits',    Icon: Flame,        label: 'Habitudes',  exact: false },
  { to: '/kakebo',    Icon: BookOpen,     label: 'Budget',     exact: false },
  { to: '/moments',   Icon: Camera,       label: 'Moments',    exact: false },
  { to: '/media',     Icon: Tv,           label: 'Médias',     exact: false },
  { to: '/lecteur',   Icon: Music,        label: 'Lecteur',    exact: false },
]

const SIDEBAR_FOOTER: { to: string; Icon: LucideIcon; label: string; exact: boolean }[] = [
  { to: '/settings', Icon: Settings, label: 'Réglages', exact: false },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function BottomNav() {
  const { pathname } = useLocation()
  const [showMore, setShowMore] = useState(false)

  function isActive(to: string, exact: boolean) {
    if (exact) return pathname === to
    return pathname === to || pathname.startsWith(to + '/')
  }

  const moreActive = MOBILE_MORE.some(item => isActive(item.to, false))

  return (
    <>
      {/* ── Mobile bottom bar (hidden on tablet+) ─── */}
      <nav className={styles.mobileNav}>
        {MOBILE_TABS.map(({ to, Icon, label, exact }) => {
          const active = isActive(to, exact)
          return (
            <Link
              key={to}
              to={to}
              className={[styles.mobileTab, active ? styles.mobileTabActive : ''].join(' ')}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className={styles.mobileTabLabel}>{label}</span>
            </Link>
          )
        })}
        <button
          className={[styles.mobileTab, (showMore || moreActive) ? styles.mobileTabActive : ''].join(' ')}
          onClick={() => setShowMore(s => !s)}
          aria-label="Plus"
        >
          <Grid2x2 size={22} strokeWidth={(showMore || moreActive) ? 2.5 : 2} />
          <span className={styles.mobileTabLabel}>Plus</span>
        </button>
      </nav>

      {/* ── Desktop sidebar (hidden on mobile) ─── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <span className={styles.sidebarBrandName}>Familia</span>
          <span className={styles.sidebarBrandSub}>家族 · Journal</span>
        </div>

        <nav className={styles.sidebarNav}>
          {SIDEBAR_ITEMS.map(({ to, Icon, label, exact }) => {
            const active = isActive(to, exact)
            return (
              <Link
                key={to}
                to={to}
                className={[styles.sidebarItem, active ? styles.sidebarItemActive : ''].join(' ')}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                <span className={styles.sidebarItemLabel}>{label}</span>
              </Link>
            )
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          {SIDEBAR_FOOTER.map(({ to, Icon, label, exact }) => {
            const active = isActive(to, exact)
            return (
              <Link
                key={to}
                to={to}
                className={[styles.sidebarItem, active ? styles.sidebarItemActive : ''].join(' ')}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                <span className={styles.sidebarItemLabel}>{label}</span>
              </Link>
            )
          })}
        </div>
      </aside>

      {/* ── Mobile "Plus" overflow sheet ─── */}
      {showMore && (
        <SlideUpModal title="Toutes les sections" onClose={() => setShowMore(false)}>
          <div className={styles.moreGrid}>
            {MOBILE_MORE.map(item => {
              const active = isActive(item.to, false)
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
