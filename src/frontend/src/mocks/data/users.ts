import type { User } from '@/api/types/auth'

/** Password di prova, uguale per tutti: vale solo con il backend finto */
export const MOCK_PASSWORD = 'demo'

/** Utenti di prova, uno per ruolo */
export const mockUsers: User[] = [
  { id: 'U-1', username: 'gneri', displayName: 'Giulia Neri', roles: ['PLANNER'] },
  {
    id: 'U-2',
    username: 'mrossi',
    displayName: 'Marco Rossi',
    department: 'Reparto saldatura',
    roles: ['OPERATOR'],
  },
  { id: 'U-3', username: 'lbianchi', displayName: 'Luca Bianchi', roles: ['ADMIN'] },
]
