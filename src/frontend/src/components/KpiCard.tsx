import styles from './KpiCard.module.css'

type KpiCardProps = {
  label: string
  value: string
  note?: string
  /** Colore della nota: good = verde, bad = rosso */
  noteTone?: 'good' | 'bad' | 'neutral'
}

/** Un indicatore: etichetta, valore grande e una nota sotto. */
export function KpiCard({ label, value, note, noteTone = 'neutral' }: KpiCardProps) {
  return (
    <div className={styles.kpi}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {note && <div className={`${styles.note} ${styles[noteTone]}`}>{note}</div>}
    </div>
  )
}
