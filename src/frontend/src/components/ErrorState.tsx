import { Button } from 'primereact/button'
import { errorMessage } from '@/api/errors'
import styles from './ErrorState.module.css'

type ErrorStateProps = {
  error: unknown
  /** Se presente, mostra il pulsante "Riprova" */
  onRetry?: () => void
}

/** Messaggio d'errore di una sezione, con il motivo in italiano e "Riprova". */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className={styles.error} role="alert">
      <i className="pi pi-exclamation-circle" aria-hidden="true" />
      <span className={styles.text}>{errorMessage(error)}</span>
      {onRetry && (
        <Button label="Riprova" icon="pi pi-refresh" size="small" outlined onClick={onRetry} />
      )}
    </div>
  )
}
