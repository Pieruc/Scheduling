import { NavLink } from 'react-router'
import { Logo } from '@/components/Logo'
import styles from './Sidebar.module.css'

type NavItem = { to: string; label: string; end?: boolean }
type NavGroup = { title?: string; items: NavItem[] }

/** Voci del menu. Con il login si aggiungerà un campo "roles" per filtrarle. */
const NAV: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'Dashboard', end: true },
      { to: '/commesse', label: 'Commesse' },
      { to: '/pianifica', label: 'Nuova pianificazione' },
      { to: '/piani', label: 'Piani' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/configurazione', label: 'Configurazione' },
      { to: '/modello', label: 'Modello AI' },
      { to: '/audit', label: 'Audit' },
    ],
  },
]

type SidebarProps = {
  id: string
  /** Sotto i 960px la sidebar è un menu a tutto schermo: open dice se è aperto */
  open: boolean
}

export function Sidebar({ id, open }: SidebarProps) {
  return (
    <nav id={id} className={styles.sidebar} data-open={open} aria-label="Navigazione principale">
      <div className={styles.logo}>
        <Logo />
      </div>

      {NAV.map((group, i) => (
        <div key={group.title ?? i} className={styles.group}>
          {group.title && <div className={styles.groupTitle}>{group.title}</div>}
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.active}` : styles.link
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}

      {/* Dati fissi finché non arrivano login e /models/active */}
      <div className={styles.footer}>
        Giulia Neri · Pianificatore
        <br />
        Modello attivo <span>M2 Policy v1.3</span>
      </div>
    </nav>
  )
}
