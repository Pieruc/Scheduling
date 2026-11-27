import { Skeleton } from 'primereact/skeleton'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { formatPercent } from '@/lib/format'
import { useKpis } from '../hooks'
import styles from './dashboard.module.css'

/** Barre di utilizzo per risorsa (stessa chiamata di KpiRow: la cache evita il doppione). */
export function UtilizationCard() {
  const { data, isPending, isError, error, refetch } = useKpis()

  return (
    <Card title="Utilizzo per risorsa (settimana)" className={styles.half}>
      {isPending && <Skeleton height="190px" />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}
      {data && data.utilizationByResource.length === 0 && (
        <p className={styles.empty}>
          Nessun dato per questa settimana: l’utilizzo si calcola dalle attività registrate dagli
          operatori.
        </p>
      )}
      {data && data.utilizationByResource.length > 0 && (
        <ul className={styles.bars}>
          {data.utilizationByResource.map((r) => (
            <li key={r.resourceId} className={styles.barRow}>
              <span>{r.resourceName}</span>
              <span
                className={styles.track}
                role="img"
                aria-label={`${r.resourceName}: ${formatPercent(r.utilization)}`}
              >
                <span className={styles.fill} style={{ width: `${r.utilization * 100}%` }} />
              </span>
              <span className={styles.barValue}>{formatPercent(r.utilization)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
