import { Button } from 'primereact/button'
import { Calendar } from 'primereact/calendar'
import { SelectButton } from 'primereact/selectbutton'
import { Slider } from 'primereact/slider'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage } from '@/api/errors'
import type { Alert } from '@/api/types/alerts'
import type {
  GanttBar,
  GanttView,
  ObjectiveWeights,
  RescheduleEvent,
  RescheduleRequest,
} from '@/api/types/plans'
import { useToast } from '@/app/toast/toastContext'
import { Card } from '@/components/Card'
import { StatusTag } from '@/components/StatusTag'
import { usePlanRequest } from '@/features/plans/hooks'
import { formatDateTime, formatHours } from '@/lib/format'
import { workRange, workTime } from '@/lib/schedule'
import { useReschedule } from '../hooks'
import styles from './reschedule.module.css'

const DEFAULT_WEIGHTS: ObjectiveWeights = { punctuality: 8, overtime: 4, setup: 4 }

const WEIGHTS: { key: keyof ObjectiveWeights; label: string }[] = [
  { key: 'punctuality', label: 'Rispettare le scadenze' },
  { key: 'overtime', label: 'Evitare gli straordinari' },
  { key: 'setup', label: 'Ridurre i cambi di setup' },
]

const SCOPES = [
  { value: 'MINIMAL', label: 'Cambia il meno possibile' },
  { value: 'FULL', label: 'Riottimizza tutto' },
]

/** Il problema in poche parole: "Saldatrice S2 ferma", "C-102 in ritardo di 2 h" */
function problemTitle(event: RescheduleEvent, view: GanttView) {
  if (event.type === 'RESOURCE_DOWN') {
    const name = view.resources.find((r) => r.id === event.resourceId)?.name ?? event.resourceId
    return `${name} ferma`
  }
  if (event.type === 'DELAY') return `${event.orderId} in ritardo di ${formatHours(event.delayMin)}`
  return `${event.orderId} diventata urgente`
}

/**
 * Attività toccate dal problema nel piano in esecuzione:
 * - dirette: sulla macchina ferma durante il fermo (o della commessa in ritardo/urgente)
 * - a catena: quelle che vengono dopo, per le precedenze
 */
function impact(event: RescheduleEvent, view: GanttView) {
  let direct: GanttBar[]
  if (event.type === 'RESOURCE_DOWN') {
    const blocks = view.resources.find((r) => r.id === event.resourceId)?.unavailable ?? []
    const onResource = view.bars.filter((b) => b.resourceId === event.resourceId)
    // Senza una fascia di fermo nel Gantt (durata ignota) contano tutte le sue attività
    direct = blocks.length
      ? onResource.filter((b) => blocks.some((u) => b.start < u.end && u.start < b.end))
      : onResource
  } else {
    direct = view.bars.filter((b) => b.orderId === event.orderId)
  }
  const hit = new Set(direct.map((b) => b.activityId))
  const chained = new Set<string>()
  let frontier = [...hit]
  while (frontier.length) {
    const next = view.precedences
      .filter((p) => frontier.includes(p.from) && !hit.has(p.to) && !chained.has(p.to))
      .map((p) => p.to)
    next.forEach((id) => chained.add(id))
    frontier = next
  }
  const dependent = view.bars.filter((b) => chained.has(b.activityId))
  const orders = [...new Set([...direct, ...dependent].map((b) => b.orderId))].sort()
  return { direct, dependent, orders }
}

type IncidentRescheduleProps = { view: GanttView; alert: Alert & { event: RescheduleEvent } }

/**
 * Ripianificazione da una segnalazione: il problema è già noto, quindi niente domande.
 * Mostra problema e impatto, lascia cambiare qualche parametro e ricalcola con l'AI.
 */
export function IncidentReschedule({ view, alert }: IncidentRescheduleProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const reschedule = useReschedule(view.planId)
  const { data: request } = usePlanRequest(view.requestId)
  const { event } = alert
  const { direct, dependent, orders } = impact(event, view)

  const [until, setUntil] = useState<Date | null>(
    event.type === 'RESOURCE_DOWN' && event.to ? new Date(event.to) : null,
  )
  // null = non ancora toccati: valgono i pesi della pianificazione di partenza
  const [weights, setWeights] = useState<ObjectiveWeights | null>(null)
  const [scope, setScope] = useState<'MINIMAL' | 'FULL'>('MINIMAL')
  const current = weights ?? request?.weights ?? DEFAULT_WEIGHTS

  const run = () => {
    const body: RescheduleRequest = {
      event:
        event.type === 'RESOURCE_DOWN' ? { ...event, to: until?.toISOString() ?? null } : event,
      freezeBefore: new Date().toISOString(),
      alertId: alert.id,
      weights: current,
      scope,
    }
    reschedule.mutate(body, {
      onSuccess: (res) => {
        toast.success('Ripianificazione avviata', 'L’AI sta cercando una soluzione.')
        navigate(`/piani/richieste/${res.id}`)
      },
      onError: (e) => toast.error('Ripianificazione non avviata', errorMessage(e)),
    })
  }

  const row = (b: GanttBar) => (
    <li key={b.activityId} className={styles.activity}>
      <span>
        <strong>{b.orderId}</strong> · {b.activityName}
      </span>
      <span className={styles.when}>
        {view.resources.find((r) => r.id === b.resourceId)?.name} ·{' '}
        {workRange(view, b.start, b.end)}
      </span>
    </li>
  )

  return (
    <>
      {/* Il problema, così come è stato segnalato */}
      <section className={styles.problem} aria-labelledby="problem-title">
        <i className="pi pi-exclamation-triangle" aria-hidden="true" />
        <div>
          <h2 id="problem-title" className={styles.problemTitle}>
            {problemTitle(event, view)}
          </h2>
          <p className={styles.problemDetail}>
            {alert.title} · {formatDateTime(alert.createdAt)} · «{alert.detail}»
          </p>
        </div>
      </section>

      <div className={styles.overview}>
        <Card title="Impatto sul piano in esecuzione">
          <div className={styles.numbers}>
            <div>
              <span className={styles.number}>{direct.length}</span>
              <span className={styles.numberLabel}>attività bloccate dal problema</span>
            </div>
            <div>
              <span className={styles.number}>{dependent.length}</span>
              <span className={styles.numberLabel}>attività che vengono dopo e slittano</span>
            </div>
            <div>
              <span className={styles.number}>{orders.length}</span>
              <span className={styles.numberLabel}>commesse coinvolte</span>
            </div>
          </div>

          {direct.length === 0 ? (
            <p className={styles.muted}>
              Il piano non usa questa risorsa nel periodo del problema: ricalcolare serve solo a
              liberarla del tutto.
            </p>
          ) : (
            <>
              <h3 className={styles.listTitle}>Bloccate</h3>
              <ul className={styles.activities}>{direct.map(row)}</ul>
              {dependent.length > 0 && (
                <>
                  <h3 className={styles.listTitle}>A catena</h3>
                  <ul className={styles.activities}>{dependent.map(row)}</ul>
                </>
              )}
            </>
          )}

          {orders.length > 0 && (
            <p className={styles.orders}>
              Scadenze:{' '}
              {orders.map((o, i) => {
                const due = view.dueByOrder[o]
                return (
                  <span key={o}>
                    {i > 0 && ' · '}
                    <strong>{o}</strong>{' '}
                    {due === null || due === undefined
                      ? 'senza scadenza'
                      : `entro ${workTime(view, due, true)}`}
                  </span>
                )
              })}
            </p>
          )}
        </Card>

        <Card title="Come ripianificare">
          <p className={styles.muted}>
            L’AI ricalcola da adesso tenendo conto del problema e propone fino a 3 soluzioni,
            confrontate con le regole ATC ed EDD. Puoi lasciare tutto com’è.
          </p>

          {event.type === 'RESOURCE_DOWN' && (
            <div className={styles.param}>
              <label htmlFor="rs-until" className={styles.paramLabel}>
                Fino a quando resterà ferma
              </label>
              <Calendar
                inputId="rs-until"
                value={until}
                onChange={(e) => setUntil(e.value ?? null)}
                showTime
                hourFormat="24"
                dateFormat="D d M"
                showIcon
                showButtonBar
                placeholder="Non si sa: fino a fine periodo"
                aria-describedby="rs-until-hint"
              />
              <small id="rs-until-hint" className={styles.hint}>
                Se il tecnico ti ha dato un orario, l’AI può tornare a usarla dopo.
              </small>
            </div>
          )}

          <fieldset className={styles.param}>
            <legend className={styles.paramLabel}>Cosa conta di più</legend>
            {WEIGHTS.map((w) => (
              <div key={w.key} className={styles.weight}>
                <span id={`rw-${w.key}`}>{w.label}</span>
                <Slider
                  value={current[w.key]}
                  onChange={(e) => setWeights({ ...current, [w.key]: e.value as number })}
                  min={0}
                  max={10}
                  aria-labelledby={`rw-${w.key}`}
                  className={styles.slider}
                />
                <output className={styles.weightValue}>{current[w.key]}</output>
              </div>
            ))}
            <small className={styles.hint}>
              {weights ? 'Valori cambiati da te.' : 'Valori della pianificazione di partenza.'}
            </small>
          </fieldset>

          <div className={styles.param}>
            <span id="rs-scope" className={styles.paramLabel}>
              Quanto cambiare
            </span>
            <SelectButton
              value={scope}
              options={SCOPES}
              onChange={(e) => e.value && setScope(e.value)}
              allowEmpty={false}
              aria-labelledby="rs-scope"
              className={styles.scope}
            />
            <small className={styles.hint}>
              {scope === 'MINIMAL'
                ? 'Sposta solo le attività toccate e quelle che vengono dopo: il reparto ritrova quasi lo stesso piano.'
                : 'Ricalcola tutto il periodo restante: può trovare un piano migliore ma cambia di più.'}
            </small>
          </div>

          <div className={styles.footer}>
            <StatusTag label="Le attività già iniziate restano dove sono" tone="grey" />
            <Button
              label="Ripianifica con l’AI"
              icon="pi pi-sparkles"
              loading={reschedule.isPending}
              onClick={run}
              className={styles.submit}
            />
          </div>
        </Card>
      </div>
    </>
  )
}
