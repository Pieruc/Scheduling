import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { useAuth } from './authContext'
import { can, homeOf, type Permission } from './permissions'
import styles from './auth.module.css'

type RequireAuthProps = {
  /** Permesso necessario; assente = basta essere collegati */
  permission?: Permission
  children: ReactNode
}

/**
 * Protegge una rotta: senza sessione porta al login (e poi si torna qui);
 * con un ruolo non ammesso mostra un messaggio con il link alla propria pagina.
 */
export function RequireAuth({ permission, children }: RequireAuthProps) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (permission && !can(user, permission)) {
    // L'operatore che apre una pagina d'ufficio va dritto alle sue attività, e viceversa
    if (permission === 'office' || permission === 'operator') {
      return <Navigate to={homeOf(user)} replace />
    }
    return (
      <>
        <PageHeader title="Accesso non consentito" />
        <p className={styles.denied}>
          Questa pagina non è disponibile con il tuo ruolo.{' '}
          <Link to={homeOf(user)}>Torna alla pagina iniziale</Link>.
        </p>
      </>
    )
  }
  return children
}
