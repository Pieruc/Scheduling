import { Button } from 'primereact/button'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import type { AuditRecord } from '@/api/types/audit'
import { useToast } from '@/app/toast/toastContext'
import { Card } from '@/components/Card'
import { actionInfo, engineText } from '../format'
import styles from './audit.module.css'

const fullDate = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
})

function Hash({ label, value }: { label: string; value: string | null }) {
  const toast = useToast()
  if (!value) return null
  const copy = () =>
    navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${label} copiato`))
      .catch(() => toast.error('Copia non riuscita', 'Selezionalo e copialo a mano.'))
  return (
    <>
      <dt>{label}</dt>
      <dd className={styles.hashRow}>
        <span className={`mono ${styles.hash}`}>{value}</span>
        <Button
          icon="pi pi-copy"
          text
          rounded
          aria-label={`Copia ${label.toLowerCase()}`}
          onClick={copy}
          className={styles.copy}
        />
      </dd>
    </>
  )
}

type AuditDetailProps = { record: AuditRecord; onClose: () => void }

/** Pannello con tutti i campi di un record */
export function AuditDetail({ record: r, onClose }: AuditDetailProps) {
  const action = actionInfo(r)
  const d = r.details ?? {}
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Aperto un record, il fuoco va sul titolo del pannello (utile quando è sotto la tabella)
  useEffect(() => {
    headingRef.current?.focus()
  }, [r.id])

  return (
    <Card className={styles.detail}>
      <div className={styles.detailHead}>
        <div>
          <p className={`mono ${styles.recordId}`}>Record {r.id}</p>
          <h2 ref={headingRef} tabIndex={-1} className={styles.detailTitle}>
            {action.label} · {r.planId}
          </h2>
        </div>
        <Button
          icon="pi pi-times"
          text
          rounded
          aria-label="Chiudi il dettaglio"
          onClick={onClose}
        />
      </div>

      <dl className={styles.fields}>
        <dt>Quando</dt>
        <dd>{fullDate.format(new Date(r.timestamp))}</dd>
        <dt>Utente</dt>
        <dd>{r.user === 'system' ? 'Sistema (automatico)' : r.user}</dd>
        <dt>Piano</dt>
        <dd className="mono">
          {d.planIds && d.planIds.length > 1 ? d.planIds.join(', ') : r.planId}
          {d.newPlanId && <> → {d.newPlanId}</>}
        </dd>
        <dt>Motore</dt>
        <dd>{engineText(r)}</dd>
        {r.modelVersion && (
          <>
            <dt>Modello</dt>
            <dd className="mono">{r.modelVersion}</dd>
          </>
        )}
        {d.trigger && r.action === 'FALLBACK_USED' && (
          <>
            <dt>Causa</dt>
            <dd>{d.trigger}</dd>
          </>
        )}
        {d.reason && (
          <>
            <dt>Motivo</dt>
            <dd>{d.reason}</dd>
          </>
        )}
        {d.changes && d.changes.length > 0 && (
          <>
            <dt>Modifiche</dt>
            <dd>
              <ul className={styles.changes}>
                {d.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
        <Hash label="Hash input" value={r.inputHash} />
        <Hash label="Hash output" value={r.outputHash} />
      </dl>

      <p className={styles.repro}>
        Con lo stesso hash di input e la stessa versione del modello il piano si ricalcola identico.
      </p>

      {/* Senza hash di output non è stato prodotto nessun piano da aprire */}
      {(r.outputHash || d.newPlanId) && (
        <Link
          to={`/piani/${d.newPlanId ?? r.planId}`}
          className={`p-button p-button-outlined ${styles.open}`}
        >
          <i className="pi pi-chart-bar" aria-hidden="true" />
          Apri il piano {d.newPlanId ?? r.planId}
        </Link>
      )}
    </Card>
  )
}
