import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Logo } from '@/components/Logo'
import { Sidebar } from './Sidebar'
import styles from './AppLayout.module.css'

/**
 * Layout di pianificatore e amministratore.
 * Da 960px in su: sidebar fissa a sinistra. Sotto: barra in alto con il pulsante "Menu"
 * che apre la sidebar a tutto schermo.
 */
export function AppLayout() {
  const { pathname } = useLocation()
  // Pagina in cui il menu è stato aperto: cambiando pagina il menu risulta chiuso da solo.
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const menuOpen = openedOn === pathname
  const setMenuOpen = (open: boolean) => setOpenedOn(open ? pathname : null)

  // Il menu si chiude anche con il tasto Esc.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenedOn(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className={styles.shell}>
      <a href="#contenuto" className="skip-link">
        Vai al contenuto
      </a>

      <header className={styles.topbar}>
        <Logo />
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={menuOpen}
          aria-controls="menu-principale"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <i className={`pi ${menuOpen ? 'pi-times' : 'pi-bars'}`} aria-hidden="true" />
          {menuOpen ? 'Chiudi' : 'Menu'}
        </button>
      </header>

      <Sidebar id="menu-principale" open={menuOpen} />

      <main id="contenuto" tabIndex={-1} className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
