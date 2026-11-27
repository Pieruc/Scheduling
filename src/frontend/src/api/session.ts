import type { User } from '@/api/types/auth'

/**
 * Sessione: token, refresh token e utente in sessionStorage (restano ricaricando la pagina,
 * spariscono chiudendo la scheda). L'access token del backend dura 15 minuti: quando scade,
 * client.ts lo rinnova con il refresh token; se anche quello è scaduto si torna al login.
 */
export type Session = { token: string; refreshToken?: string; user: User } | null

const KEY = 'flowsync.session'

function read(): Session {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

let current: Session = read()
const listeners = new Set<() => void>()

export const session = {
  get: () => current,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  set(next: Session) {
    current = next
    try {
      if (next) sessionStorage.setItem(KEY, JSON.stringify(next))
      else sessionStorage.removeItem(KEY)
    } catch {
      // senza sessionStorage la sessione dura fino al prossimo ricaricamento
    }
    listeners.forEach((l) => l())
  },
}
