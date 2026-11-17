import type { ReactNode } from 'react'
import styles from './FormField.module.css'

type FormFieldProps = {
  /** id del controllo: collega l'etichetta e il messaggio d'errore */
  id: string
  label: string
  error?: string
  hint?: string
  /** Riceve gli attributi aria da passare al controllo */
  children: (aria: {
    id: string
    'aria-invalid': boolean
    'aria-describedby'?: string
  }) => ReactNode
}

/** Campo di un form: etichetta visibile, controllo, suggerimento ed errore sotto il campo. */
export function FormField({ id, label, error, hint, children }: FormFieldProps) {
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ')
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy || undefined,
      })}
      {hint && !error && (
        <small id={`${id}-hint`} className={styles.hint}>
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-error`} className={styles.error}>
          {error}
        </small>
      )}
    </div>
  )
}
