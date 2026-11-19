import { Button } from 'primereact/button'
import type { ExecutionEvent, OperatorActivity } from '@/api/types/execution'
import { StatusTag } from '@/components/StatusTag'
import { formatHours, formatTime } from '@/lib/format'
import { formatWorked, workedMinutes } from '../time'
import styles from './operator.module.css'

const weekday = new Intl.DateTimeFormat('it-IT', { weekday: 'short' })

/** "13:30 – 17:00" oppure, se finisce un altro giorno, "13:30 – ven 10:00" */
function span(startIso: string, endIso: string) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const endText =
    start.toDateString() === end.toDateString()
      ? formatTime(endIso)
      : `${weekday.format(end)} ${formatTime(endIso)}`
  return `${formatTime(startIso)} – ${endText}`
}

/** Minuti previsti, solo se l'attività inizia e finisce oggi (altrimenti il confronto non ha senso) */
function plannedMinutes(a: OperatorActivity) {
  const start = new Date(a.plannedStart)
  const end = new Date(a.plannedEnd)
  if (start.toDateString() !== end.toDateString()) return null
  return (end.getTime() - start.getTime()) / 60_000
}

const title = (a: OperatorActivity) => `${a.orderId} · ${a.activityName}`

type SendFn = (activity: OperatorActivity, event: ExecutionEvent) => void

type CommonProps = {
  activity: OperatorActivity
  /** Evento in invio per questa attività, per mostrare la rotellina sul pulsante giusto */
  sending: ExecutionEvent | null
  /** Una richiesta qualsiasi è in corso: tutti i pulsanti restano fermi */
  busy: boolean
  onSend: SendFn
}

/** Attività in corso o in pausa: cronometro e pulsanti grandi */
export function CurrentActivity({
  activity: a,
  sending,
  busy,
  onSend,
  now,
  blocked,
}: CommonProps & { now: number; blocked: boolean }) {
  const worked = workedMinutes(a, now)
  const planned = plannedMinutes(a)
  const over = planned !== null ? worked - planned : 0
  const paused = a.state === 'PAUSED'

  return (
    <article className={styles.current} aria-labelledby={`att-${a.activityId}`}>
      <StatusTag
        label={
          paused
            ? `In pausa · ${formatWorked(worked)} di lavoro`
            : worked < 1
              ? 'Appena iniziata'
              : `In corso da ${formatHours(worked)}`
        }
        tone={paused ? 'amber' : 'green'}
      />
      <h3 id={`att-${a.activityId}`} className={styles.currentTitle}>
        {title(a)}
      </h3>
      <p className={styles.meta}>
        {a.resourceName} · previsto {span(a.plannedStart, a.plannedEnd)} · {a.customer}
      </p>
      {paused && blocked && (
        <p className={styles.meta}>Per riprenderla, prima metti in pausa quella in corso.</p>
      )}
      {over > 0 && (
        <p className={styles.over}>
          <i className="pi pi-clock" aria-hidden="true" /> Oltre il tempo previsto di{' '}
          {formatHours(over)}. Se serve, segnalalo qui sotto con «Sono in ritardo».
        </p>
      )}
      <div className={styles.bigButtons}>
        {paused ? (
          <Button
            label="Riprendi"
            icon="pi pi-play"
            outlined
            loading={sending === 'RESUME'}
            disabled={busy || blocked}
            onClick={() => onSend(a, 'RESUME')}
            aria-label={`Riprendi ${title(a)}`}
          />
        ) : (
          <Button
            label="Pausa"
            icon="pi pi-pause"
            outlined
            loading={sending === 'PAUSE'}
            disabled={busy}
            onClick={() => onSend(a, 'PAUSE')}
            aria-label={`Metti in pausa ${title(a)}`}
          />
        )}
        <Button
          label="Termina"
          icon="pi pi-check"
          severity="success"
          loading={sending === 'END'}
          disabled={busy}
          onClick={() => onSend(a, 'END')}
          aria-label={`Termina ${title(a)}`}
        />
      </div>
    </article>
  )
}

/** Attività ancora da iniziare. `blocked` = un'altra è in corso */
export function NextActivity({
  activity: a,
  sending,
  busy,
  onSend,
  blocked,
}: CommonProps & { blocked: boolean }) {
  const waiting = a.waitingFor
  return (
    <li className={styles.item}>
      <div className={styles.itemText}>
        <span className={styles.itemTitle}>{title(a)}</span>
        <span className={styles.meta}>
          {a.resourceName} · {span(a.plannedStart, a.plannedEnd)} · {a.customer}
        </span>
        {waiting && (
          <span className={styles.waiting}>
            <i className="pi pi-hourglass" aria-hidden="true" /> Dopo la{' '}
            {waiting.activityName.toLowerCase()}, prevista finire alle{' '}
            {formatTime(waiting.plannedEnd)}
          </span>
        )}
      </div>
      <Button
        label="Inizia"
        icon="pi pi-play"
        className={styles.startButton}
        loading={sending === 'START'}
        disabled={Boolean(waiting) || blocked || busy}
        onClick={() => onSend(a, 'START')}
        aria-label={`Inizia ${title(a)}`}
      />
    </li>
  )
}

/** Attività terminata oggi, con gli orari reali */
export function DoneActivity({ activity: a }: { activity: OperatorActivity }) {
  return (
    <li className={styles.item}>
      <div className={styles.itemText}>
        <span className={styles.itemTitle}>{title(a)}</span>
        <span className={styles.meta}>
          {a.resourceName} · {a.actualStart && a.actualEnd ? span(a.actualStart, a.actualEnd) : ''}{' '}
          · {formatWorked(a.workedMin)} di lavoro
        </span>
      </div>
      <i className={`pi pi-check-circle ${styles.doneIcon}`} aria-label="Terminata" />
    </li>
  )
}
