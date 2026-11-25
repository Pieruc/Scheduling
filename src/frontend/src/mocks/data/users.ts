import type { ManagedUser, User } from '@/api/types/auth'
import { daysAgo } from './time'

/** Password di prova degli utenti demo: vale solo con il backend finto (anche vuota) */
export const MOCK_PASSWORD = 'demo'

/** Un account del backend finto: dati di gestione + password in chiaro (solo per i test) */
type MockAccount = ManagedUser & { password: string; department?: string }

/**
 * Account del backend finto. I primi tre sono gli utenti demo (il nome utente è il ruolo);
 * gli altri mostrano una registrazione in attesa e un utente disattivato.
 * Gli handler li modificano in memoria.
 */
export const accounts: MockAccount[] = [
  {
    id: 'U-1',
    username: 'pianificatore',
    email: 'pianificatore@flowsync.local',
    fullName: 'Giulia Neri',
    role: 'PLANNER',
    status: 'ACTIVE',
    createdAt: daysAgo(40),
    approvedAt: daysAgo(40),
    password: MOCK_PASSWORD,
  },
  {
    id: 'U-2',
    username: 'operatore',
    email: 'operatore@flowsync.local',
    fullName: 'Marco Rossi',
    role: 'OPERATOR',
    status: 'ACTIVE',
    createdAt: daysAgo(40),
    approvedAt: daysAgo(40),
    password: MOCK_PASSWORD,
    department: 'Reparto saldatura',
  },
  {
    id: 'U-3',
    username: 'amministratore',
    email: 'amministratore@flowsync.local',
    fullName: 'Luca Bianchi',
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: daysAgo(40),
    approvedAt: daysAgo(40),
    password: MOCK_PASSWORD,
  },
  {
    id: 'U-4',
    username: 'sverdi',
    email: 's.verdi@example.com',
    fullName: 'Sara Verdi',
    role: null,
    status: 'PENDING',
    createdAt: daysAgo(1, 16, 20),
    approvedAt: null,
    password: 'password-sara',
  },
  {
    id: 'U-5',
    username: 'pbianco',
    email: 'p.bianco@example.com',
    fullName: 'Paolo Bianco',
    role: 'OPERATOR',
    status: 'DISABLED',
    createdAt: daysAgo(30),
    approvedAt: daysAgo(29),
    password: 'password-paolo',
  },
]

/** Le tre persone demo hanno la password "demo" oppure vuota */
export const isDemo = (a: MockAccount) => ['U-1', 'U-2', 'U-3'].includes(a.id)

/** L'utente come lo restituisce il login */
export const toUser = (a: MockAccount): User => ({
  id: a.id,
  username: a.username,
  fullName: a.fullName,
  roles: a.role ? [a.role] : [],
  department: a.department ?? null,
})

/** L'utente come lo vede l'amministratore (senza password e reparto) */
export const toManaged = ({ password: _p, department: _d, ...rest }: MockAccount): ManagedUser =>
  rest
