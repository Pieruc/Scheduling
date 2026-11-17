import type { Tone } from '@/lib/labels'
import styles from './StatusTag.module.css'

/** Etichetta di stato a pillola: "Da valutare", "Approvato", "Fallita"... */
export function StatusTag({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`${styles.tag} ${styles[tone]}`}>{label}</span>
}
