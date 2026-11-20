import type { AuditRecord } from '@/api/types/audit'
import { StatusTag } from '@/components/StatusTag'
import { formatDateTime } from '@/lib/format'
import { actionInfo, engineText, plansText, shortHash, userLabel } from '../format'
import styles from './audit.module.css'

type AuditTableProps = {
  records: AuditRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/** Mockup v2, schermata 10. Sotto i 768px ogni record diventa una scheda. */
export function AuditTable({ records, selectedId, onSelect }: AuditTableProps) {
  return (
    <table className={styles.table}>
      <caption className="visually-hidden">Record di audit, dal più recente</caption>
      <thead>
        <tr>
          <th scope="col">Quando</th>
          <th scope="col">Azione</th>
          <th scope="col">Piano</th>
          <th scope="col">Utente</th>
          <th scope="col">Motore</th>
          <th scope="col">Input</th>
        </tr>
      </thead>
      <tbody>
        {records.map((r) => {
          const action = actionInfo(r)
          const selected = r.id === selectedId
          return (
            <tr
              key={r.id}
              className={selected ? styles.selected : undefined}
              // Il clic su tutta la riga è una comodità per il mouse; da tastiera c'è il pulsante
              onClick={() => onSelect(r.id)}
            >
              <td className={styles.when}>{formatDateTime(r.timestamp)}</td>
              <td className={styles.actionCell}>
                <button
                  type="button"
                  className={styles.rowButton}
                  aria-pressed={selected}
                  aria-label={`Dettagli: ${action.label}, ${plansText(r)}, ${formatDateTime(r.timestamp)}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(r.id)
                  }}
                >
                  <StatusTag label={action.label} tone={action.tone} />
                  <i className="pi pi-angle-right" aria-hidden="true" />
                </button>
              </td>
              <td className={`mono ${styles.planCell}`}>{plansText(r)}</td>
              <td data-label="Utente">{userLabel(r.user)}</td>
              <td data-label="Motore">{engineText(r)}</td>
              <td data-label="Input">
                <span className="mono">{shortHash(r.inputHash)}</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
