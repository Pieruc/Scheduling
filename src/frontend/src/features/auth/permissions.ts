import type { Role, User } from '@/api/types/auth'

/**
 * Cosa può fare ogni ruolo nell'interfaccia: le stesse regole dei contratti (A).
 * Il backend controlla comunque ogni chiamata (403): qui serve solo a non mostrare
 * pulsanti e pagine inutili.
 */
export const PERMISSIONS = {
  /** Dashboard, commesse, piani, Gantt in lettura, configurazione in lettura, modello AI */
  office: ['PLANNER', 'ADMIN'],
  /** Nuova pianificazione e decisioni sui piani */
  plan: ['PLANNER'],
  /** Creare e modificare commesse e attività */
  orders: ['PLANNER', 'ADMIN'],
  /** Scrivere la configurazione */
  configWrite: ['ADMIN'],
  /** Audit e storico delle versioni dei modelli */
  admin: ['ADMIN'],
  /** Attività di oggi e segnalazioni */
  operator: ['OPERATOR'],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

export function can(user: User | null, permission: Permission): boolean {
  if (!user) return false
  const allowed: readonly Role[] = PERMISSIONS[permission]
  return user.roles.some((r) => allowed.includes(r))
}

/** Pagina iniziale di ogni ruolo */
export const homeOf = (user: User) => (can(user, 'office') ? '/' : '/operatore')

export const ROLE_LABEL: Record<Role, string> = {
  PLANNER: 'Pianificatore',
  OPERATOR: 'Operatore',
  ADMIN: 'Amministratore',
}

export const roleText = (user: User) => user.roles.map((r) => ROLE_LABEL[r]).join(', ')
