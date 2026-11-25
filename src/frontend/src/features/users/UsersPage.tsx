import { Button } from 'primereact/button'
import { confirmDialog } from 'primereact/confirmdialog'
import { Dropdown } from 'primereact/dropdown'
import { IconField } from 'primereact/iconfield'
import { InputIcon } from 'primereact/inputicon'
import { InputText } from 'primereact/inputtext'
import { SelectButton } from 'primereact/selectbutton'
import { Skeleton } from 'primereact/skeleton'
import { useState } from 'react'
import { ApiError, errorMessage } from '@/api/errors'
import type { ManagedUser, Role } from '@/api/types/auth'
import { useToast } from '@/app/toast/toastContext'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { StatusTag } from '@/components/StatusTag'
import { useUser } from '@/features/auth/authContext'
import { ROLE_LABEL } from '@/features/auth/permissions'
import { formatDateTime, formatShortDate } from '@/lib/format'
import type { Tone } from '@/lib/labels'
import { useApproveUser, useRejectRegistration, useUpdateUser, useUsers } from './hooks'
import styles from './users.module.css'

const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as Role[]).map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
}))

const STATUS: Record<ManagedUser['status'], { label: string; tone: Tone }> = {
  PENDING: { label: 'In attesa', tone: 'amber' },
  ACTIVE: { label: 'Attivo', tone: 'green' },
  DISABLED: { label: 'Disattivato', tone: 'grey' },
}

const FILTERS = [
  { value: 'all', label: 'Tutti' },
  { value: 'ACTIVE', label: 'Attivi' },
  { value: 'DISABLED', label: 'Disattivati' },
]

/** Messaggi in italiano per i codici di conflitto del backend (contratto A.1) */
function failure(error: unknown) {
  const code = error instanceof ApiError ? error.errors[0]?.code : undefined
  switch (code) {
    case 'SELF_LOCKOUT':
      return 'Non puoi disattivarti né toglierti il ruolo di amministratore.'
    case 'NOT_PENDING':
      return 'La richiesta non è più in attesa: qualcuno l’ha già gestita.'
    case 'USER_PENDING':
      return 'Prima va approvata la registrazione.'
    default:
      return errorMessage(error)
  }
}

/** Una registrazione in attesa: si sceglie il ruolo e si approva, oppure si rifiuta */
function PendingRow({ user }: { user: ManagedUser }) {
  const toast = useToast()
  const approve = useApproveUser()
  const reject = useRejectRegistration()
  const [role, setRole] = useState<Role | null>(null)
  const busy = approve.isPending || reject.isPending

  const askReject = () =>
    confirmDialog({
      header: `Rifiutare la richiesta di ${user.fullName}?`,
      message: 'L’account viene cancellato. La persona potrà registrarsi di nuovo.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Rifiuta',
      rejectLabel: 'Annulla',
      acceptClassName: 'p-button-danger',
      defaultFocus: 'reject',
      accept: () =>
        reject.mutate(user.id, {
          onSuccess: () => toast.success('Richiesta rifiutata', user.username),
          onError: (e) => toast.error('Rifiuto non riuscito', failure(e)),
        }),
    })

  return (
    <li className={styles.pending}>
      <div className={styles.who}>
        <span className={styles.name}>{user.fullName}</span>
        <span className={styles.meta}>
          <span className="mono">{user.username}</span> · {user.email} · richiesta{' '}
          {formatDateTime(user.createdAt)}
        </span>
      </div>
      <div className={styles.pendingActions}>
        <label htmlFor={`role-${user.id}`} className="visually-hidden">
          Ruolo da assegnare a {user.fullName}
        </label>
        <Dropdown
          inputId={`role-${user.id}`}
          value={role}
          options={ROLE_OPTIONS}
          onChange={(e) => setRole(e.value)}
          placeholder="Scegli il ruolo"
          className={styles.roleSelect}
        />
        <Button
          label="Approva"
          icon="pi pi-check"
          disabled={!role || busy}
          loading={approve.isPending}
          onClick={() =>
            approve.mutate(
              { id: user.id, role: role! },
              {
                onSuccess: () =>
                  toast.success('Account approvato', `${user.fullName} · ${ROLE_LABEL[role!]}`),
                onError: (e) => toast.error('Approvazione non riuscita', failure(e)),
              },
            )
          }
          aria-label={`Approva ${user.fullName}`}
        />
        <Button
          label="Rifiuta"
          severity="danger"
          text
          disabled={busy}
          onClick={askReject}
          aria-label={`Rifiuta la richiesta di ${user.fullName}`}
        />
      </div>
    </li>
  )
}

/** /utenti (solo ADMIN): richieste di registrazione e gestione degli account */
export function UsersPage() {
  const me = useUser()
  const toast = useToast()
  const { data, isPending, isError, error, refetch } = useUsers()
  const update = useUpdateUser()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const pending = data?.filter((u) => u.status === 'PENDING') ?? []
  const q = search.trim().toLowerCase()
  const others = (data ?? [])
    .filter((u) => u.status !== 'PENDING')
    .filter((u) => filter === 'all' || u.status === filter)
    .filter(
      (u) =>
        !q ||
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    )

  const change = (u: ManagedUser, body: { role?: Role; active?: boolean }, done: string) =>
    update.mutate(
      { id: u.id, body },
      {
        onSuccess: () => toast.success(done, u.fullName),
        onError: (e) => toast.error('Modifica non riuscita', failure(e)),
      },
    )

  const toggleActive = (u: ManagedUser) => {
    if (u.status === 'DISABLED') return change(u, { active: true }, 'Account riattivato')
    confirmDialog({
      header: `Disattivare ${u.fullName}?`,
      message: 'Non potrà più accedere finché non lo riattivi. Il suo storico resta nell’audit.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Disattiva',
      rejectLabel: 'Annulla',
      acceptClassName: 'p-button-danger',
      defaultFocus: 'reject',
      accept: () => change(u, { active: false }, 'Account disattivato'),
    })
  }

  return (
    <>
      <PageHeader
        title="Utenti"
        subtitle="Approva le richieste di accesso, assegna i ruoli e disattiva gli account che non servono più."
      />

      <Card title={`Richieste in attesa${data ? ` (${pending.length})` : ''}`}>
        {isPending && <Skeleton height="80px" />}
        {isError && <ErrorState error={error} onRetry={() => refetch()} />}
        {data &&
          (pending.length === 0 ? (
            <p className={styles.muted}>Nessuna richiesta in attesa.</p>
          ) : (
            <ul className={styles.pendingList}>
              {pending.map((u) => (
                <PendingRow key={u.id} user={u} />
              ))}
            </ul>
          ))}
      </Card>

      <Card title="Account">
        <div className={styles.toolbar}>
          <IconField iconPosition="left" className={styles.search}>
            <InputIcon className="pi pi-search" />
            <InputText
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, nome utente o email"
              aria-label="Cerca un utente per nome, nome utente o email"
            />
          </IconField>
          <SelectButton
            value={filter}
            options={FILTERS}
            onChange={(e) => e.value && setFilter(e.value)}
            allowEmpty={false}
            aria-label="Quali account mostrare"
          />
        </div>
        {isPending && <Skeleton height="200px" />}
        {data && (
          <table className={styles.table}>
            <caption className="visually-hidden">Account approvati</caption>
            <thead>
              <tr>
                <th scope="col">Utente</th>
                <th scope="col">Email</th>
                <th scope="col">Ruolo</th>
                <th scope="col">Stato</th>
                <th scope="col">Approvato</th>
                <th scope="col">
                  <span className="visually-hidden">Azioni</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {others.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.muted}>
                    Nessun account corrisponde alla ricerca.
                  </td>
                </tr>
              )}
              {others.map((u) => {
                const self = u.id === me.id || u.username === me.username
                const status = STATUS[u.status]
                return (
                  <tr key={u.id} className={u.status === 'DISABLED' ? styles.disabled : undefined}>
                    <th scope="row">
                      <span className={styles.name}>{u.fullName}</span>
                      {self && <span className={styles.you}> (tu)</span>}
                      <br />
                      <span className={`mono ${styles.meta}`}>{u.username}</span>
                    </th>
                    <td>{u.email}</td>
                    <td>
                      <label htmlFor={`urole-${u.id}`} className="visually-hidden">
                        Ruolo di {u.fullName}
                      </label>
                      <Dropdown
                        inputId={`urole-${u.id}`}
                        value={u.role}
                        options={ROLE_OPTIONS}
                        onChange={(e) =>
                          e.value !== u.role &&
                          change(
                            u,
                            { role: e.value },
                            `Ruolo cambiato in ${ROLE_LABEL[e.value as Role]}`,
                          )
                        }
                        // Il proprio ruolo di amministratore non si toglie (SELF_LOCKOUT)
                        disabled={self || update.isPending}
                        className={styles.roleSelect}
                      />
                    </td>
                    <td>
                      <StatusTag label={status.label} tone={status.tone} />
                    </td>
                    <td>{u.approvedAt ? formatShortDate(u.approvedAt) : '—'}</td>
                    <td className={styles.actions}>
                      {self ? (
                        <span className={styles.meta}>Sei tu</span>
                      ) : (
                        <Button
                          label={u.status === 'DISABLED' ? 'Riattiva' : 'Disattiva'}
                          severity={u.status === 'DISABLED' ? undefined : 'danger'}
                          text
                          disabled={update.isPending}
                          onClick={() => toggleActive(u)}
                          aria-label={`${u.status === 'DISABLED' ? 'Riattiva' : 'Disattiva'} ${u.fullName}`}
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
