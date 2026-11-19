import { Button } from 'primereact/button'
import { SelectButton } from 'primereact/selectbutton'
import type { GanttBar, GanttView, PlanChange } from '@/api/types/plans'
import { Card } from '@/components/Card'
import { formatHours, formatPercent } from '@/lib/format'
import { workTime } from '@/lib/schedule'
import styles from './review.module.css'

type ActivityPanelProps = {
  view: GanttView
  bar: GanttBar | undefined
  editable: boolean
  onMove: (change: PlanChange) => string | null
}

const SHIFTS = [
  { label: '−1 h', minutes: -60 },
  { label: '−15 min', minutes: -15 },
  { label: '+15 min', minutes: 15 },
  { label: '+1 h', minutes: 60 },
]

/**
 * Dettaglio dell'attività selezionata. "Sposta su" e "Anticipa / posticipa" fanno le stesse
 * modifiche del trascinamento: è l'alternativa da tastiera.
 */
export function ActivityPanel({ view, bar, editable, onMove }: ActivityPanelProps) {
  if (!bar) {
    return (
      <Card title="Attività">
        <p className={styles.muted}>
          Seleziona una barra del Gantt per vederne i dettagli
          {editable ? ' e spostarla con i pulsanti.' : '.'}
        </p>
      </Card>
    )
  }

  const resourceName = (id: string) => view.resources.find((r) => r.id === id)?.name ?? id
  const options = Object.keys(bar.durations)
    .filter((id) => view.resources.some((r) => r.id === id))
    .map((id) => ({ value: id, label: resourceName(id) }))

  return (
    <Card title={`${bar.orderId} · ${bar.activityName}`}>
      <dl className={styles.details}>
        <dt>Risorsa</dt>
        <dd>{resourceName(bar.resourceId)}</dd>
        <dt>Inizio</dt>
        <dd>{workTime(view, bar.start)}</dd>
        <dt>Fine</dt>
        <dd>{workTime(view, bar.end, true)}</dd>
        <dt>Durata dichiarata</dt>
        <dd>{bar.declaredMin === null ? 'non inserita' : formatHours(bar.declaredMin)}</dd>
        {bar.estimate && (
          <>
            <dt>Stima AI (M1)</dt>
            <dd>
              <strong>{formatHours(bar.estimate.value)}</strong>{' '}
              <span className={styles.muted}>
                ({formatHours(bar.estimate.low)} – {formatHours(bar.estimate.high)}, confidenza{' '}
                {formatPercent(bar.estimate.confidence)})
              </span>
            </dd>
          </>
        )}
      </dl>

      {editable && (
        <>
          <div className={styles.control}>
            <span id="move-to" className={styles.controlLabel}>
              Sposta su
            </span>
            <SelectButton
              value={bar.resourceId}
              options={options}
              onChange={(e) =>
                e.value &&
                onMove({ activityId: bar.activityId, resourceId: e.value, start: bar.start })
              }
              allowEmpty={false}
              aria-labelledby="move-to"
              className={styles.resourceChoice}
            />
          </div>
          <div className={styles.control}>
            <span id="shift" className={styles.controlLabel}>
              Anticipa o posticipa
            </span>
            <div className={styles.shiftButtons} role="group" aria-labelledby="shift">
              {SHIFTS.map((s) => (
                <Button
                  key={s.label}
                  type="button"
                  label={s.label}
                  outlined
                  size="small"
                  onClick={() =>
                    onMove({
                      activityId: bar.activityId,
                      resourceId: bar.resourceId,
                      start: bar.start + s.minutes,
                    })
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
