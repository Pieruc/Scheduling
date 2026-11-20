import { createContext, useContext } from 'react'
import type { User } from '@/api/types/auth'
import { can, type Permission } from './permissions'

export type AuthApi = {
  user: User | null
  /** Accede e restituisce l'utente; lancia ApiError (401) se le credenziali sono sbagliate */
  login: (username: string, password: string) => Promise<User>
  logout: () => void
}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth(): AuthApi {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth va usato dentro <AuthProvider>')
  return auth
}

/** L'utente collegato. Da usare solo nelle pagine protette, dove c'è sempre */
export function useUser(): User {
  const { user } = useAuth()
  if (!user) throw new Error('Nessun utente collegato')
  return user
}

/** true se l'utente collegato ha il permesso, es. useCan('plan') */
export function useCan(permission: Permission): boolean {
  return can(useAuth().user, permission)
}
