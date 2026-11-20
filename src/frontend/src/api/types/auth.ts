/** Ruoli dell'API pubblica (contratti, A) */
export type Role = 'PLANNER' | 'OPERATOR' | 'ADMIN'

/** Utente collegato (contratti, A.1) */
export type User = {
  id: string
  username: string
  roles: Role[]
  /** PROPOSTA §8: nome da mostrare, es. "Giulia Neri" */
  displayName?: string
  /** PROPOSTA §8: reparto, per la vista operatore */
  department?: string
}

/** Risposta di POST /auth/login (contratti, A.1; il refresh token per ora non si usa) */
export type LoginResponse = {
  accessToken: string
  expiresIn: number
  user: User
}
