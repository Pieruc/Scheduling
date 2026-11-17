import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

type PageHeaderProps = {
  title: string
  subtitle?: string
  /** Pulsanti a destra del titolo */
  actions?: ReactNode
}

/** Titolo di pagina: uguale in tutte le schermate. */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {/* React 19 sposta <title> nell'head: ogni pagina ha il suo titolo nella scheda */}
      <title>{`${title} · FlowSync`}</title>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
