import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { MultiSelect } from 'primereact/multiselect'
import { useMemo } from 'react'
import type { Activity, Precedence } from '@/api/types/orders'
import { formatHours } from '@/lib/format'
import styles from './orders.module.css'

type ActivityTableProps = {
  activities: Activity[]
  precedences: Precedence[]
  resourceName: (id: string) => string
  skillName: (code: string) => string
  /** Come nel grafo: restituisce il motivo del rifiuto oppure null */
  onAdd: (from: string, to: string) => string | null
  onRemove: (from: string, to: string) => void
  onRejected: (reason: string) => void
}

/** Riga già pronta da mostrare: tutto il testo è calcolato prima. */
type Row = {
  id: string
  name: string
  skills: string[]
  resources: string
  duration: string | null
  predecessors: string[]
}

/** Durata: un valore, un intervallo tra i modi, oppure null se manca (la stima l'AI). */
function durationText(a: Activity) {
  const known = a.modes.flatMap((m) => (m.durationMin === null ? [] : [m.durationMin]))
  if (known.length === 0) return null
  const min = Math.min(...known)
  const max = Math.max(...known)
  return min === max ? formatHours(min) : `${formatHours(min)} – ${formatHours(max)}`
}

/**
 * Tabella delle attività. La colonna "Dopo" modifica le precedenze come il grafo:
 * è l'alternativa da tastiera (e da telefono) al trascinamento.
 */
export function ActivityTable(props: ActivityTableProps) {
  const { activities, precedences, resourceName, skillName, onAdd, onRemove, onRejected } = props

  // Nuovo array a ogni cambio di dati: PrimeReact ridisegna le righe solo se cambia `value`.
  const rows: Row[] = useMemo(
    () =>
      activities.map((a) => {
        const durations = new Set(a.modes.map((m) => m.durationMin))
        return {
          id: a.id,
          name: a.name,
          skills: a.requiredSkills.map(skillName),
          resources: a.modes
            .map((m) => {
              const names = m.resourceIds.map(resourceName).join(' + ')
              // La durata per risorsa serve solo se cambia da un modo all'altro
              return durations.size > 1 && m.durationMin !== null
                ? `${names} (${formatHours(m.durationMin)})`
                : names
            })
            .join(', '),
          duration: durationText(a),
          predecessors: precedences.filter((p) => p.to === a.id).map((p) => p.from),
        }
      }),
    [activities, precedences, resourceName, skillName],
  )

  const changePredecessors = (row: Row, next: string[]) => {
    row.predecessors.filter((p) => !next.includes(p)).forEach((p) => onRemove(p, row.id))
    for (const p of next.filter((x) => !row.predecessors.includes(x))) {
      const problem = onAdd(p, row.id)
      if (problem) onRejected(problem)
    }
  }

  return (
    <DataTable
      value={rows}
      dataKey="id"
      size="small"
      responsiveLayout="stack"
      breakpoint="768px"
      className={styles.activityTable}
      aria-label="Attività della commessa"
    >
      <Column field="name" header="Attività" />
      <Column
        header="Competenza"
        body={(r: Row) =>
          r.skills.map((s) => (
            <span key={s} className={styles.chip}>
              {s}
            </span>
          ))
        }
      />
      <Column field="resources" header="Risorse ammesse" />
      <Column
        header="Durata"
        body={(r: Row) => r.duration ?? <span className={styles.estimate}>da stimare (AI)</span>}
      />
      <Column
        header="Dopo"
        body={(r: Row) => (
          <MultiSelect
            value={r.predecessors}
            options={activities.filter((x) => x.id !== r.id)}
            optionLabel="name"
            optionValue="id"
            onChange={(e) => changePredecessors(r, e.value as string[])}
            placeholder="Nessuna"
            display="comma"
            maxSelectedLabels={2}
            selectedItemsLabel="{0} attività"
            className={styles.afterSelect}
            aria-label={`Attività che devono finire prima di ${r.name}`}
          />
        )}
      />
    </DataTable>
  )
}
