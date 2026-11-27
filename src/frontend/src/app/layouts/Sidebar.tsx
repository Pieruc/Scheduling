import { NavLink } from 'react-router'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/features/auth/authContext'
import { can, type Permission } from '@/features/auth/permissions'
import { UserBox } from '@/features/auth/UserBox'
import { useActiveModels } from '@/features/model-info/hooks'
import { useUsers } from '@/features/users/hooks'
import styles from './Sidebar.module.css'

/** "m2-policy-1.3.0" -> "M2 Policy v1.3" */
function shortModelName(version: string) {
  const m = version.match(/^m(\d+)-(\w+)-(\d+\.\d+)/)
  if (!m) return version
  return `M${m[1]} ${m[2][0].toUpperCase()}${m[2].slice(1)} v${m[3]}`
}

/** permission: chi vede la voce (assente = tutti quelli che usano questo layout) */
type NavItem = { to: string; label: string; end?: boolean; permission?: Permission }
type NavGroup = { title?: string; items: NavItem[] }

/** Voci del menu, filtrate per ruolo */
const NAV: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'Dashboard', end: true },
      { to: '/commesse', label: 'Commesse' },
      { to: '/pianifica', label: 'Nuova pianificazione', permission: 'plan' },
      { to: '/piani', label: 'Piani' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/configurazione', label: 'Configurazione' },
      { to: '/modello', label: 'Modello AI' },
      { to: '/utenti', label: 'Utenti', permission: 'admin' },
      { to: '/audit', label: 'Audit', permission: 'admin' },
    ],
  },
]

type SidebarProps = {
  id: string
  /** Sotto i 960px la sidebar è un menu a tutto schermo: open dice se è aperto */
  open: boolean
}

export function Sidebar({ id, open }: SidebarProps) {
  const { data: models, isError: modelsError } = useActiveModels()
  const { user } = useAuth()
  // L'amministratore vede quante registrazioni aspettano la sua approvazione
  const { data: users } = useUsers(can(user, 'admin'))
  const pending = users?.filter((u) => u.status === 'PENDING').length ?? 0
  const modelLabel = models
    ? models.policy
      ? shortModelName(models.policy.version)
      : 'nessuno (regole di riserva)'
    : modelsError
      ? 'non disponibile'
      : '…'

  return (
    <nav id={id} className={styles.sidebar} data-open={open} aria-label="Navigazione principale">
      <div className={styles.logo}>
        <Logo />
      </div>

      {NAV.map((group, i) => (
        <div key={group.title ?? i} className={styles.group}>
          {group.title && <div className={styles.groupTitle}>{group.title}</div>}
          {group.items
            .filter((item) => !item.permission || can(user, item.permission))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? `${styles.link} ${styles.active}` : styles.link
                }
              >
                {item.label}
                {item.to === '/utenti' && pending > 0 && (
                  <span
                    className={styles.badge}
                    aria-label={`${pending} ${pending === 1 ? 'richiesta' : 'richieste'} in attesa`}
                  >
                    {pending}
                  </span>
                )}
              </NavLink>
            ))}
        </div>
      ))}

      <div className={styles.footer}>
        <UserBox />
        <span>
          Modello attivo <span>{modelLabel}</span>
        </span>
      </div>
    </nav>
  )
}
