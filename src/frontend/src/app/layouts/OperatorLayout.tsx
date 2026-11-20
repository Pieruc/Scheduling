import { Outlet } from 'react-router'
import { Logo } from '@/components/Logo'
import { UserBox } from '@/features/auth/UserBox'
import styles from './OperatorLayout.module.css'

/** Layout dell'operatore: barra in alto, niente sidebar, contenuto centrato. */
export function OperatorLayout() {
  return (
    <div className={styles.shell}>
      <a href="#contenuto" className="skip-link">
        Vai al contenuto
      </a>
      <header className={styles.topbar}>
        <Logo />
        <UserBox className={styles.user} />
      </header>
      <main id="contenuto" tabIndex={-1} className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
