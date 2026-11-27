import { Link } from 'react-router'
import type { PlanRequest, PlanSummary } from '@/api/types/plans'
import { StatusTag } from '@/components/StatusTag'
import {
  formatDateTime,
  formatEuro,
  formatHours,
  formatShortDate,
  formatWorkDuration,
} from '@/lib/format'
import { PLAN_STATUS, requestStatus, solverLabel, VARIANT_INFO, VARIANT_LABEL } from '@/lib/labels'
import { useResources } from '@/features/configuration/hooks'
import { failureReasons, requestTitle } from '../requestText'
import styles from './plansList.module.css'

/** "C-101, C-102" oppure "C-101 … C-104 · 4 commesse" */
function ordersText(ids: string[]) {
  if (ids.length <= 2) return ids.join(', ')
  return `${ids[0]} … ${ids[ids.length - 1]} · ${ids.length} commesse`
}

function planName(plan: PlanSummary) {
  if (!plan.variant) return 'Piano di riserva'
  return `${VARIANT_INFO[plan.variant].letter} · ${VARIANT_LABEL[plan.variant]}`
}

/** Prima riga di ogni gruppo: di che richiesta si tratta e dove andare */
function RequestHeader({ request }: { request: PlanRequest }) {
  const status = requestStatus(request)
  const resources = useResources()
  const title = requestTitle(request, resources.data)
  const toRequest = `/piani/richieste/${request.id}`
  const link =
    request.status === 'PENDING'
      ? "Segui l'avanzamento"
      : request.plans.length > 1
        ? 'Confronta i piani'
        : null

  return (
    <tr className={styles.requestRow}>
      <th colSpan={7} scope="rowgroup">
        <div className={styles.requestHead}>
          <div className={styles.requestText}>
            <span className={styles.requestTitle}>{title}</span>
            <span className={styles.requestMeta}>
              {formatDateTime(request.createdAt)} · {request.createdBy} · orizzonte{' '}
              {formatShortDate(request.horizonStart)} – {formatShortDate(request.horizonEnd)} ·{' '}
              {ordersText(request.orderIds)}
            </span>
          </div>
          <div className={styles.requestSide}>
            <StatusTag label={status.label} tone={status.tone} />
            {link && (
              <Link to={toRequest} className={styles.requestLink} aria-label={`${link}: ${title}`}>
                {link}
                <i className="pi pi-arrow-right" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </th>
    </tr>
  )
}

function PlanRow({ plan }: { plan: PlanSummary }) {
  const k = plan.kpis
  const status = PLAN_STATUS[plan.status]
  return (
    <tr className={styles.planRow}>
      <td className={styles.planCell}>
        <span className={styles.planName}>{planName(plan)}</span>
        <span className={`mono ${styles.planId}`}>{plan.id}</span>
      </td>
      <td data-label="Generato da">{solverLabel(plan.solver, plan.modelVersion)}</td>
      <td data-label="Durata" className={styles.num}>
        {k ? formatWorkDuration(k.makespanMin) : '—'}
      </td>
      <td data-label="Ritardo" className={styles.num}>
        {k ? formatHours(k.totalTardinessMin) : '—'}
      </td>
      <td data-label="Costo" className={styles.num}>
        {k ? formatEuro(k.estimatedCost) : '—'}
      </td>
      <td className={styles.statusCell}>
        <StatusTag label={status.label} tone={status.tone} />
      </td>
      <td className={styles.actionCell}>
        <Link
          to={`/piani/${plan.id}`}
          className={styles.ganttLink}
          aria-label={`Apri nel Gantt il piano ${plan.id}`}
        >
          <i className="pi pi-chart-bar" aria-hidden="true" />
          Gantt
        </Link>
      </td>
    </tr>
  )
}

/** Una riga al posto dei piani, se la richiesta non ne ha (ancora) */
function MessageRow({ request }: { request: PlanRequest }) {
  const text =
    request.status === 'PENDING'
      ? 'Il motore sta calcolando i 3 piani…'
      : request.status === 'FAILED'
        ? `Nessun piano: ${failureReasons(request.error).causes.join('; ')}.`
        : 'Nessun piano.'
  return (
    <tr className={styles.messageRow}>
      <td colSpan={7}>
        {request.status === 'PENDING' && <i className="pi pi-spin pi-spinner" aria-hidden="true" />}
        {text}
      </td>
    </tr>
  )
}

/**
 * Mockup v2, schermata 7: una tabella sola, con un gruppo di righe per richiesta.
 * Sotto i 768px ogni gruppo diventa un riquadro e ogni piano una scheda.
 */
export function PlansTable({ requests }: { requests: PlanRequest[] }) {
  return (
    <table className={styles.table}>
      <caption className="visually-hidden">
        Richieste di pianificazione e piani generati, dalla più recente
      </caption>
      <thead>
        <tr>
          <th scope="col">Piano</th>
          <th scope="col">Generato da</th>
          <th scope="col" className={styles.num}>
            Durata
          </th>
          <th scope="col" className={styles.num}>
            Ritardo
          </th>
          <th scope="col" className={styles.num}>
            Costo
          </th>
          <th scope="col">Stato</th>
          <th scope="col">
            <span className="visually-hidden">Azioni</span>
          </th>
        </tr>
      </thead>
      {requests.map((r) => (
        <tbody key={r.id} className={styles.group}>
          <RequestHeader request={r} />
          {r.plans.length > 0 ? (
            r.plans.map((p) => <PlanRow key={p.id} plan={p} />)
          ) : (
            <MessageRow request={r} />
          )}
        </tbody>
      ))}
    </table>
  )
}
