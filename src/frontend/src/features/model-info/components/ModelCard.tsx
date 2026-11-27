import type { ActiveModel, ModelComponent } from '@/api/types/models'
import { Card } from '@/components/Card'
import { formatShortDate } from '@/lib/format'
import { METRICS } from '../metrics'
import styles from './modelInfo.module.css'

type ModelCardProps = {
  component: ModelComponent
  title: string
  role: string
  /** null = nessuna versione pubblicata */
  model: ActiveModel | null
  note: string
  /** Cosa succede senza modello, es. "I piani li fanno le regole di riserva." */
  fallback: string
}

/** Un modello attivo: versione, da quando, metriche spiegate a parole */
export function ModelCard({ component, title, role, model, note, fallback }: ModelCardProps) {
  if (!model) {
    return (
      <Card className={styles.modelCard}>
        <div>
          <h2 className={styles.modelTitle}>{title}</h2>
          <p className={styles.role}>{role}</p>
        </div>
        <p className={styles.version}>
          <span className={styles.since}>Nessuna versione pubblicata</span>
        </p>
        <p className={styles.note}>
          {fallback} Il primo modello arriva dalla pipeline di addestramento.
        </p>
      </Card>
    )
  }
  const known = Object.entries(METRICS[component]).filter(([key]) => key in model.metrics)

  return (
    <Card className={styles.modelCard}>
      <div>
        <h2 className={styles.modelTitle}>{title}</h2>
        <p className={styles.role}>{role}</p>
      </div>
      <p className={styles.version}>
        <span className="mono">{model.version}</span>
        <span className={styles.since}>attivo dal {formatShortDate(model.publishedAt)}</span>
      </p>
      <dl className={styles.metrics}>
        {known.map(([key, info]) => (
          <div key={key} className={styles.metric}>
            <dt>{info.label}</dt>
            <dd className={styles.metricValue}>{info.format(model.metrics[key])}</dd>
            <dd className={styles.metricHint}>{info.hint}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.note}>
        {note}
        {model.datasetVersion && (
          <>
            {' '}
            Addestrato sul dataset <span className="mono">{model.datasetVersion}</span>
            {model.specVersion && <> · legge la ProblemSpec {model.specVersion}</>}.
          </>
        )}
      </p>
    </Card>
  )
}
