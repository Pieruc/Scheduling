import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Skeleton } from 'primereact/skeleton'
import { Link } from 'react-router'
import type { PlanRequest } from '@/api/types/plans'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { StatusTag } from '@/components/StatusTag'
import { formatDateTime, formatEuro, formatWorkDuration } from '@/lib/format'
import { requestStatus, solverLabel, VARIANT_LABEL } from '@/lib/labels'
import { useRecentPlanRequests } from '../hooks'
import styles from './dashboard.module.css'

/** Un valore unico o un intervallo "min – max" sui piani della richiesta */
function range(values: number[], format: (v: number) => string) {
  if (values.length === 0) return '—'
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? format(min) : `${format(min)} – ${format(max)}`
}

function requestHref(r: PlanRequest) {
  if (r.plans.length === 1) return `/piani/${r.plans[0].id}`
  return `/piani/richieste/${r.id}`
}

export function RecentRequestsCard() {
  const { data, isPending, isError, error, refetch } = useRecentPlanRequests()

  return (
    <Card title="Piani recenti" action={<Link to="/piani">Vedi tutti i piani</Link>}>
      {isPending && <Skeleton height="200px" />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}
      {data && (
        <DataTable
          value={data}
          dataKey="id"
          size="small"
          className={styles.table}
          stripedRows={false}
        >
          <Column
            header="Richiesta"
            body={(r: PlanRequest) => (
              <div>
                <Link to={requestHref(r)}>{r.label}</Link>
                <div className={styles.sub}>
                  {r.plans.length > 1
                    ? `${r.plans.length} piani`
                    : r.plans[0]?.variant
                      ? VARIANT_LABEL[r.plans[0].variant]
                      : ''}
                </div>
              </div>
            )}
          />
          <Column header="Creata" body={(r: PlanRequest) => formatDateTime(r.createdAt)} />
          <Column
            header="Generato da"
            body={(r: PlanRequest) =>
              r.plans[0] ? solverLabel(r.plans[0].solver, r.plans[0].modelVersion) : '—'
            }
          />
          <Column
            header="Durata totale"
            body={(r: PlanRequest) =>
              range(
                r.plans.flatMap((p) => (p.kpis ? [p.kpis.makespanMin] : [])),
                formatWorkDuration,
              )
            }
          />
          <Column
            header="Costo stimato"
            body={(r: PlanRequest) =>
              range(
                r.plans.flatMap((p) => (p.kpis ? [p.kpis.estimatedCost] : [])),
                formatEuro,
              )
            }
          />
          <Column
            header="Stato"
            body={(r: PlanRequest) => {
              const s = requestStatus(r)
              return <StatusTag label={s.label} tone={s.tone} />
            }}
          />
        </DataTable>
      )}
    </Card>
  )
}
