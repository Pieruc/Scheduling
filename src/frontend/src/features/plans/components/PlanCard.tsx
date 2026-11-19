import { Link } from 'react-router'
import type { PlanSummary } from '@/api/types/plans'
import { StatusTag } from '@/components/StatusTag'
import { formatEuro, formatHours, formatPercent, formatWorkDuration } from '@/lib/format'
import { PLAN_STATUS, VARIANT_INFO, VARIANT_LABEL } from '@/lib/labels'
import styles from './plans.module.css'

/** Stati di un piano già deciso (i piani da valutare non mostrano nulla) */
const DECIDED: PlanSummary['status'][] = ['APPROVED', 'REJECTED', 'SUPERSEDED']

type PlanCardProps = {
  plan: PlanSummary
  recommended: boolean
}

/** Una delle tre alternative: KPI, frase di riepilogo, link al Gantt. */
export function PlanCard({ plan, recommended }: PlanCardProps) {
  const variant = plan.variant ?? 'BALANCED'
  const info = VARIANT_INFO[variant]
  const k = plan.kpis
  const titleId = `plan-${plan.id}`

  return (
    <article
      className={`${styles.planCard} ${recommended ? styles.recommended : ''} ${plan.status === 'APPROVED' ? styles.approved : ''}`}
      aria-labelledby={titleId}
    >
      {recommended && plan.status === 'PROPOSED' && (
        <span className={styles.ribbon}>Migliore con i tuoi pesi</span>
      )}
      <div className={styles.cardTags}>
        <StatusTag label={info.tagline} tone={info.tone} />
        {DECIDED.includes(plan.status) && (
          <StatusTag label={PLAN_STATUS[plan.status].label} tone={PLAN_STATUS[plan.status].tone} />
        )}
      </div>
      <h2 id={titleId} className={styles.planTitle}>
        Piano {info.letter} · {VARIANT_LABEL[variant]}
      </h2>

      {k && (
        <dl className={styles.kpis}>
          <dt>Durata totale</dt>
          <dd>{formatWorkDuration(k.makespanMin)}</dd>
          <dt>Ritardo totale</dt>
          <dd className={k.totalTardinessMin > 0 ? styles.bad : styles.good}>
            {formatHours(k.totalTardinessMin)}
            {k.lateOrders > 0 &&
              ` (${k.lateOrders} ${k.lateOrders === 1 ? 'commessa' : 'commesse'})`}
          </dd>
          <dt>Straordinari</dt>
          <dd>{formatHours(k.overtimeMin)}</dd>
          <dt>Cambi di setup</dt>
          <dd>{k.setupCount}</dd>
          <dt>Utilizzo medio</dt>
          <dd>{formatPercent(k.avgUtilization)}</dd>
          <dt>Costo stimato</dt>
          <dd className={styles.cost}>{formatEuro(k.estimatedCost)}</dd>
        </dl>
      )}

      {plan.summary && <p className={styles.summary}>{plan.summary}</p>}

      <Link
        to={`/piani/${plan.id}`}
        className={`p-button ${recommended ? '' : 'p-button-outlined'} ${styles.openLink}`}
        aria-label={`Apri nel Gantt il piano ${info.letter}, ${VARIANT_LABEL[variant].toLowerCase()}`}
      >
        <i className="pi pi-chart-bar" aria-hidden="true" />
        Apri nel Gantt
      </Link>
    </article>
  )
}
