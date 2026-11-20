import { Skeleton } from 'primereact/skeleton'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { StatusTag } from '@/components/StatusTag'
import { formatShortDate } from '@/lib/format'
import { useModelVersions } from '../hooks'
import { COMPONENT_LABEL, MAIN_METRIC, METRICS, VERSION_STATUS } from '../metrics'
import styles from './modelInfo.module.css'

/** Storico versioni: sotto i 768px ogni riga diventa una scheda */
export function VersionHistory() {
  const { data, isPending, isError, error, refetch } = useModelVersions()

  return (
    <Card title="Storico versioni">
      {isPending && <Skeleton height="220px" />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}
      {data && (
        <table className={styles.table}>
          <caption className="visually-hidden">Versioni dei modelli, dalla più recente</caption>
          <thead>
            <tr>
              <th scope="col">Versione</th>
              <th scope="col">Modello</th>
              <th scope="col">Pubblicata</th>
              <th scope="col">Metrica principale</th>
              <th scope="col">Stato</th>
            </tr>
          </thead>
          <tbody>
            {data.map((v) => {
              const key = MAIN_METRIC[v.component]
              const info = METRICS[v.component][key]
              const status = VERSION_STATUS[v.status]
              return (
                <tr key={v.version}>
                  <th scope="row" className="mono">
                    {v.version}
                  </th>
                  <td data-label="Modello">{COMPONENT_LABEL[v.component]}</td>
                  <td data-label="Pubblicata">{formatShortDate(v.publishedAt)}</td>
                  <td>
                    <span className={styles.metricLabelInline}>{info.label}: </span>
                    {key in v.metrics ? info.format(v.metrics[key]) : '—'}
                  </td>
                  <td>
                    <StatusTag label={status.label} tone={status.tone} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className={styles.note}>
        Una versione «In valutazione» lavora in ombra: calcola piani di confronto ma non li propone.
        Si pubblica solo dalla pipeline di addestramento.
      </p>
    </Card>
  )
}
