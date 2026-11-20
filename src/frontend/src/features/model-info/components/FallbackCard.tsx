import type { ModelsStatus } from '@/api/types/models'
import { Card } from '@/components/Card'
import { formatPercent } from '@/lib/format'
import styles from './modelInfo.module.css'

const CHAIN = [
  { name: 'AI · Policy', detail: 'di norma' },
  { name: 'CP-SAT', detail: 'ottimizzatore esatto' },
  { name: 'Regola ATC', detail: 'priorità e scadenze' },
  { name: 'Regola EDD', detail: 'scadenza più vicina' },
]

/** Quando e quanto spesso il piano non viene dall'AI */
export function FallbackCard({ status }: { status: ModelsStatus }) {
  const p = status.plansBySolver
  const total = p.POLICY + p.CP_SAT + p.ATC + p.EDD
  const share = (n: number) => (total > 0 ? ` · ${formatPercent(n / total)}` : '')
  const tiles = [
    { label: 'Piani dall’AI', value: p.POLICY },
    { label: 'Riserva CP-SAT', value: p.CP_SAT },
    { label: 'Riserva ATC / EDD', value: p.ATC + p.EDD },
  ]

  return (
    <Card title="Cosa succede se l’AI non è sicura">
      <p className={styles.text}>
        Sotto il {formatPercent(status.confidenceThreshold)} di confidenza, o se il servizio AI non
        risponde, il piano viene calcolato con un metodo di riserva, nell’ordine:
      </p>
      <ol className={styles.chain}>
        {CHAIN.map((step, i) => (
          <li key={step.name} className={i === 0 ? styles.chainFirst : undefined}>
            <span className={styles.chainName}>{step.name}</span>
            <span className={styles.chainDetail}>{step.detail}</span>
          </li>
        ))}
      </ol>
      <div className={styles.tiles}>
        {tiles.map((t) => (
          <div key={t.label} className={styles.tile}>
            <span className={styles.tileLabel}>{t.label}</span>
            <span className={styles.tileValue}>{t.value}</span>
            <span className={styles.tileNote}>
              {t.value === 1 ? 'piano' : 'piani'}
              {share(t.value)}
            </span>
          </div>
        ))}
      </div>
      <p className={styles.note}>
        Ultimi {status.days} giorni · {total} piani in tutto.
      </p>
    </Card>
  )
}
