import { useNavigate } from 'react-router'
import { useAuth, useUser } from './authContext'
import { roleText } from './permissions'
import styles from './auth.module.css'

/** Nome, ruolo e "Esci": in fondo alla barra laterale e nella barra dell'operatore */
export function UserBox({ className }: { className?: string }) {
  const user = useUser()
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className={`${styles.userBox} ${className ?? ''}`}>
      <span className={styles.userName}>
        <span>{user.displayName ?? user.username}</span>
        <span className={styles.userRole}>
          {[user.department, roleText(user)].filter(Boolean).join(' · ')}
        </span>
      </span>
      <button
        type="button"
        className={styles.logout}
        onClick={() => {
          logout()
          navigate('/login', { replace: true })
        }}
      >
        <i className="pi pi-sign-out" aria-hidden="true" />
        Esci
      </button>
    </div>
  )
}
