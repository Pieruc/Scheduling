import { useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore, type ReactNode } from 'react'
import { login as apiLogin } from '@/api/auth'
import { session } from '@/api/session'
import { AuthContext, type AuthApi } from './authContext'

/** Login di prova: sessione in sessionStorage, nessun rinnovo del token */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const current = useSyncExternalStore(session.subscribe, session.get)

  const api: AuthApi = {
    user: current?.user ?? null,
    login: async (username, password) => {
      const res = await apiLogin(username, password)
      // I dati in cache erano dell'utente precedente
      queryClient.clear()
      session.set({ token: res.accessToken, refreshToken: res.refreshToken, user: res.user })
      return res.user
    },
    logout: () => {
      session.set(null)
      queryClient.clear()
    },
  }

  return <AuthContext value={api}>{children}</AuthContext>
}
