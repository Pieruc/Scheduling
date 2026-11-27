import type { IsoDateTime } from '@/api/types/common'

/** Ruoli dell'API pubblica (contratti, A) */
export type Role = 'PLANNER' | 'OPERATOR' | 'ADMIN'

/** Utente collegato (contratti, A.1) */
export type User = {
  id: string
  username: string
  roles: Role[]
  /** v1.1: nome da mostrare, es. "Giulia Neri" (se manca si mostra lo username) */
  fullName?: string
  /** v1.1: reparto, per la vista operatore, es. "Reparto saldatura" */
  department?: string | null
}

/** Risposta di POST /auth/login e POST /auth/refresh (contratti, A.1) */
export type LoginResponse = {
  accessToken: string
  /** Assente con il backend finto, che non scade */
  refreshToken?: string
  /** Secondi di validità dell'access token (15 minuti nel backend) */
  expiresIn: number
  user: User
}

/** POST /auth/register (contratti, A.1): il ruolo lo sceglie l'amministratore all'approvazione */
export type RegisterRequest = {
  username: string
  email: string
  fullName: string
  password: string
}

/** Risposta della registrazione: nessun token, account in attesa */
export type RegistrationResponse = {
  id: string
  username: string
  status: 'PENDING'
  message: string
}

/** Stato di un account (gestione utenti, contratti A.1) */
export type AccountStatus = 'PENDING' | 'ACTIVE' | 'DISABLED'

/** Un utente come lo vede l'amministratore (GET /users) */
export type ManagedUser = {
  id: string
  username: string
  email: string
  fullName: string
  /** null finché l'account è in attesa */
  role: Role | null
  status: AccountStatus
  createdAt: IsoDateTime
  approvedAt: IsoDateTime | null
}

/** PATCH /users/{id}: campi assenti = invariati */
export type UpdateUserRequest = { role?: Role; active?: boolean }
