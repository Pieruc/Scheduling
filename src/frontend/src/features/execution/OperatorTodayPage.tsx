import { confirmDialog } from 'primereact/confirmdialog'
import { Skeleton } from 'primereact/skeleton'
import { ApiError, errorMessage } from '@/api/errors'
import type { ExecutionEvent, OperatorActivity, OperatorDay } from '@/api/types/execution'
import { useToast } from '@/app/toast/toastContext'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { useNow } from '@/lib/useNow'
import { CurrentActivity, DoneActivity, NextActivity } from './components/ActivityItems'
import { IncidentForm } from './components/IncidentForm'
import { useExecution, useOperatorDay } from './hooks'
import { formatWorked, workedMinutes } from './time'
import styles from './components/operator.module.css'

const longDate = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** "Giovedì 19 novembre · turno 8:00–12:00 / 13:00–17:00" */
function daySubtitle(day: OperatorDay) {
  const date = longDate.format(new Date(`${day.date}T12:00:00`))
  const shifts = day.shifts.map((s) => `${s.start.replace(/^0/, '')}–${s.end}`).join(' / ')
  return `${date.charAt(0).toUpperCase()}${date.slice(1)} · turno ${shifts}`
}

const DONE_TOAST: Record<ExecutionEvent, string> = {
  START: 'Attività iniziata',
  PAUSE: 'Attività in pausa',
  RESUME: 'Attività ripresa',
  END: 'Attività terminata',
}

/** Mockup v2, schermata 6: /operatore */
export function OperatorTodayPage() {
  const { data: day, isPending, isError, error, refetch } = useOperatorDay()
  const execution = useExecution()
  const toast = useToast()
  const now = useNow()

  const sendingFor = (a: OperatorActivity): ExecutionEvent | null =>
    execution.isPending && execution.variables?.activityId === a.activityId
      ? execution.variables.event
      : null

  const send = (a: OperatorActivity, event: ExecutionEvent) => {
    const go = () =>
      execution.mutate(
        {
          planId: a.planId,
          activityId: a.activityId,
          resourceIds: [a.resourceId],
          event,
          timestamp: new Date().toISOString(),
        },
        {
          onSuccess: () => toast.success(DONE_TOAST[event], `${a.orderId} · ${a.activityName}`),
          onError: (e) => {
            toast.error('Operazione non riuscita', errorMessage(e))
            // 409: lo stato sul server è diverso da quello mostrato, si ricarica
            if (e instanceof ApiError && e.status === 409) void refetch()
          },
        },
      )
    if (event !== 'END') return go()
    confirmDialog({
      header: `Terminare ${a.orderId} · ${a.activityName}?`,
      message: `Registro la fine adesso, con ${formatWorked(workedMinutes(a, Date.now()))} di lavoro. Non si potrà riprendere.`,
      icon: 'pi pi-check-circle',
      acceptLabel: 'Termina',
      rejectLabel: 'Annulla',
      accept: go,
    })
  }

  if (isPending) {
    return (
      <>
        <PageHeader title="Le tue attività di oggi" />
        <Skeleton height="220px" />
        <Skeleton height="160px" />
      </>
    )
  }
  if (isError) {
    return (
      <>
        <PageHeader title="Le tue attività di oggi" />
        <ErrorState error={error} onRetry={() => refetch()} />
      </>
    )
  }

  // Prima quella che sta lavorando, poi quelle in pausa
  const current = [
    ...day.activities.filter((a) => a.state === 'IN_PROGRESS'),
    ...day.activities.filter((a) => a.state === 'PAUSED'),
  ]
  const running = day.activities.find((a) => a.state === 'IN_PROGRESS')
  const next = day.activities.filter((a) => a.state === 'TODO')
  const done = day.activities.filter((a) => a.state === 'DONE')

  return (
    <>
      <PageHeader title="Le tue attività di oggi" subtitle={daySubtitle(day)} />

      <div className={styles.layout}>
        <div className={styles.column}>
          <Card title="In corso">
            {current.length === 0 ? (
              <p className={styles.muted}>
                Nessuna attività in corso. Inizia la prossima qui sotto.
              </p>
            ) : (
              current.map((a) => (
                <CurrentActivity
                  key={a.activityId}
                  activity={a}
                  now={now}
                  blocked={Boolean(running) && running !== a}
                  sending={sendingFor(a)}
                  busy={execution.isPending}
                  onSend={send}
                />
              ))
            )}
          </Card>

          <Card title="Prossime">
            {running && next.length > 0 && (
              <p className={styles.muted}>
                Per iniziarne un’altra, prima metti in pausa o termina quella in corso.
              </p>
            )}
            {next.length === 0 ? (
              <p className={styles.muted}>Nessun’altra attività per oggi.</p>
            ) : (
              <ul className={styles.list}>
                {next.map((a) => (
                  <NextActivity
                    key={a.activityId}
                    activity={a}
                    blocked={Boolean(running)}
                    sending={sendingFor(a)}
                    busy={execution.isPending}
                    onSend={send}
                  />
                ))}
              </ul>
            )}
          </Card>

          {done.length > 0 && (
            <Card title="Terminate oggi">
              <ul className={styles.list}>
                {done.map((a) => (
                  <DoneActivity key={a.activityId} activity={a} />
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className={styles.column}>
          <IncidentForm day={day} current={running ?? current[0]} />
          <p className={styles.footnote}>
            Gli orari di inizio e fine che registri qui servono al sistema per stimare meglio le
            durate delle prossime attività.
          </p>
        </div>
      </div>
    </>
  )
}
