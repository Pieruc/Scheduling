import { Skeleton } from 'primereact/skeleton'
import { ErrorState } from '@/components/ErrorState'
import { KpiCard } from '@/components/KpiCard'
import { formatPercent, formatPointsDelta } from '@/lib/format'
import { useKpis } from '../hooks'
import styles from './dashboard.module.css'

/** I quattro indicatori della settimana in corso, confrontati con la precedente. */
export function KpiRow() {
  const { data, isPending, isError, error, refetch } = useKpis()

  if (isPending) {
    return (
      <div className={styles.kpiRow}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height="106px" borderRadius="12px" />
        ))}
      </div>
    )
  }
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const current = data.points.at(-1)
  const previous = data.points.at(-2)
  if (!current) return null
  const onTimeDelta = previous ? current.onTimeRate - previous.onTimeRate : 0

  return (
    <section aria-label="Indicatori della settimana" className={styles.kpiRow}>
      <KpiCard
        label="Puntualità (settimana)"
        value={formatPercent(current.onTimeRate)}
        note={`${formatPointsDelta(onTimeDelta)} rispetto alla scorsa`}
        noteTone={onTimeDelta > 0 ? 'good' : onTimeDelta < 0 ? 'bad' : 'neutral'}
      />
      <KpiCard
        label="Commesse in ritardo"
        value={String(current.lateOrders)}
        note={current.lateOrders > 0 ? 'oltre la scadenza questa settimana' : 'tutte nei tempi'}
        noteTone={current.lateOrders > 0 ? 'bad' : 'good'}
      />
      <KpiCard
        label="Utilizzo medio risorse"
        value={formatPercent(current.avgUtilization)}
        note={`${data.utilizationByResource.length} risorse attive`}
      />
      <KpiCard
        label="Aderenza al piano"
        value={formatPercent(current.planAdherence)}
        note="attività iniziate in orario"
      />
    </section>
  )
}
