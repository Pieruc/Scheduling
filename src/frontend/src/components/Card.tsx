import type { ReactNode } from 'react'
import styles from './Card.module.css'

type CardProps = {
  title?: string
  /** Link o pulsante a destra del titolo */
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** Riquadro bianco con bordo: il contenitore standard delle sezioni di una pagina. */
export function Card({ title, action, children, className }: CardProps) {
  return (
    <section className={`${styles.card} ${className ?? ''}`}>
      {(title || action) && (
        <div className={styles.head}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
