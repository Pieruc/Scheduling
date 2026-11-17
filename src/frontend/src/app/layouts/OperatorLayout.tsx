import { Outlet } from 'react-router'
import { Logo } from '@/components/Logo'
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
        {/* Dati fissi finché non arriva il login */}
        <span className={styles.user}>Reparto saldatura · Marco Rossi · Operatore</span>
      </header>
      <main id="contenuto" tabIndex={-1} className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
