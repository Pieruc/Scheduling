import { Skeleton } from 'primereact/skeleton'
import { Link, useParams } from 'react-router'
import type { PlanRequest, PlanRequestStage } from '@/api/types/plans'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { PipelineSteps, type Step, type StepState } from '@/components/PipelineSteps'
import { StatusTag } from '@/components/StatusTag'
import { solverLabel } from '@/lib/labels'
import { BaselineComparison } from './components/BaselineComparison'
import { PlanCard } from './components/PlanCard'
import { usePlanRequest } from './hooks'
import styles from './components/plans.module.css'

const ORDER: PlanRequestStage[] = ['VALIDATION', 'CONTEXT', 'POLICY', 'BASELINES']
const STAGE_TEXT: Record<PlanRequestStage, string> = {
  VALIDATION: 'Controllo i dati delle commesse',
  CONTEXT: 'Stimo le durate mancanti (M1)',
  POLICY: 'Costruisco i 3 piani (M2)',
  BASELINES: 'Confronto con le regole ATC ed EDD',
}

function steps(request: PlanRequest): Step[] {
  const done = request.status === 'COMPLETED'
  const current = request.stage ? ORDER.indexOf(request.stage) : -1
  const state = (i: number): StepState =>
    done
      ? 'done'
      : request.status === 'FAILED'
        ? 'todo'
        : i < current
          ? 'done'
          : i === current
            ? 'current'
            : 'todo'
  return [
    { label: '1 · LLM', title: 'Richiesta capita', state: 'done' },
    { label: '2 · Validazione', title: 'Dati completi', state: state(0) },
    { label: '3 · M1', title: 'Stima delle durate', state: state(1) },
    { label: '4 · M2', title: 'Costruzione dei piani', state: state(2) },
    { label: '5 · Confronto', title: 'AI contro ATC ed EDD', state: state(3) },
  ]
}

/** Mockup v2, schermata 4: /piani/richieste/:requestId */
export function CandidatesPage() {
  const { requestId } = useParams()
  const { data: request, isPending, isError, error, refetch } = usePlanRequest(requestId)

  const crumb = (
    <nav aria-label="Percorso" className={styles.crumb}>
      <Link to="/piani">Piani</Link> › Richiesta {requestId}
    </nav>
  )

  if (isPending) {
    return (
      <>
        {crumb}
        <PageHeader title="Confronto dei piani" />
        <Skeleton height="420px" />
      </>
    )
  }
  if (isError) {
    return (
      <>
        {crumb}
        <PageHeader title="Confronto dei piani" />
        <ErrorState error={error} onRetry={() => refetch()} />
      </>
    )
  }

  const recommended = request.plans.find((p) => p.id === request.recommendedPlanId)
  const policyPlan = request.plans[0]

  return (
    <>
      {crumb}
      <PageHeader
        title={
          request.status === 'COMPLETED'
            ? `${request.plans.length} piani pronti: scegli tu`
            : request.status === 'FAILED'
              ? 'Pianificazione non riuscita'
              : 'Sto preparando i piani…'
        }
        subtitle={
          request.status === 'COMPLETED'
            ? 'Tutti rispettano i vincoli. Cambia il compromesso tra tempo e costo.'
            : `${request.label} · ci vogliono pochi secondi.`
        }
        actions={
          request.status === 'COMPLETED' && policyPlan ? (
            <StatusTag
              label={`Generati in ${String(request.elapsedSeconds ?? '').replace('.', ',')} s · ${solverLabel(policyPlan.solver, policyPlan.modelVersion)}`}
              tone="blue"
            />
          ) : undefined
        }
      />

      {request.status !== 'COMPLETED' && (
        <PipelineSteps steps={steps(request)} label="Fasi della pianificazione" />
      )}
      {/* Annuncia ai lettori di schermo la fase in corso e la fine del calcolo */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {request.status === 'PENDING' && request.stage
          ? STAGE_TEXT[request.stage]
          : request.status === 'COMPLETED'
            ? 'I piani sono pronti.'
            : ''}
      </p>

      {request.status === 'PENDING' && (
        <div className={styles.planGrid} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height="360px" borderRadius="12px" />
          ))}
        </div>
      )}

      {request.status === 'FAILED' && (
        <Card>
          <ErrorState error={new Error(request.error ?? 'Errore sconosciuto')} />
          <p className={styles.muted}>
            Puoi riprovare da <Link to="/pianifica">Nuova pianificazione</Link>.
          </p>
        </Card>
      )}

      {request.status === 'COMPLETED' && (
        <>
          <div className={styles.planGrid}>
            {request.plans.map((p) => (
              <PlanCard key={p.id} plan={p} recommended={p.id === request.recommendedPlanId} />
            ))}
          </div>
          {recommended?.kpis && request.baselines?.length ? (
            <BaselineComparison recommended={recommended} baselines={request.baselines} />
          ) : null}
        </>
      )}
    </>
  )
}
