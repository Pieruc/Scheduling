import type { Baseline, PlanSummary } from '@/api/types/plans'
import { Card } from '@/components/Card'
import { formatEuro, formatHours, formatWorkDuration } from '@/lib/format'
import { VARIANT_INFO, VARIANT_LABEL } from '@/lib/labels'
import styles from './plans.module.css'

type BaselineComparisonProps = {
  recommended: PlanSummary
  baselines: Baseline[]
}

/** Lo stesso problema risolto con le regole classiche: quanto aggiunge l'AI. */
export function BaselineComparison({ recommended, baselines }: BaselineComparisonProps) {
  const variant = recommended.variant ?? 'BALANCED'
  const rows = [
    {
      key: 'ai',
      name: `AI · Piano ${VARIANT_INFO[variant].letter} (${VARIANT_LABEL[variant].toLowerCase()})`,
      kpis: recommended.kpis!,
      ai: true,
    },
    ...baselines.map((b) => ({
      key: b.solver,
      name: `Regola ${b.solver}`,
      kpis: b.kpis,
      ai: false,
    })),
  ]
  const maxTardiness = Math.max(1, ...rows.map((r) => r.kpis.totalTardinessMin))

  return (
    <Card title="Rispetto alle regole classiche">
      <p className={styles.muted}>
        Gli stessi dati pianificati con le regole di riserva, per vedere quanto aggiunge l’AI.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.compare}>
          <thead>
            <tr>
              <th scope="col">Metodo</th>
              <th scope="col">Durata totale</th>
              <th scope="col">Ritardo totale</th>
              <th scope="col">Straordinari</th>
              <th scope="col">Costo stimato</th>
              <th scope="col" className={styles.scaleCol}>
                Ritardo a confronto
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.ai ? styles.aiRow : undefined}>
                <th scope="row">{r.name}</th>
                <td>{formatWorkDuration(r.kpis.makespanMin)}</td>
                <td className={r.kpis.totalTardinessMin > 0 ? styles.bad : styles.good}>
                  {formatHours(r.kpis.totalTardinessMin)}
                </td>
                <td>{formatHours(r.kpis.overtimeMin)}</td>
                <td>{formatEuro(r.kpis.estimatedCost)}</td>
                <td className={styles.scaleCol} aria-hidden="true">
                  <span className={styles.track}>
                    <span
                      className={r.ai ? styles.fillAi : styles.fill}
                      style={{ width: `${(r.kpis.totalTardinessMin / maxTardiness) * 100}%` }}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
