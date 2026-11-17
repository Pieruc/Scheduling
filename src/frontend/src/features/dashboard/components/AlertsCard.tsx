import { Skeleton } from 'primereact/skeleton'
import { Link } from 'react-router'
import type { Alert, AlertType } from '@/api/types/alerts'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { formatDateTime } from '@/lib/format'
import { useAlerts } from '../hooks'
import styles from './dashboard.module.css'

const TONE: Record<AlertType, string> = {
  INCIDENT: styles.alertRed,
  PLANS_TO_REVIEW: styles.alertBlue,
  MAINTENANCE: styles.alertAmber,
}

function alertHref(link: NonNullable<Alert['link']>) {
  if (link.planRequestId) return `/piani/richieste/${link.planRequestId}`
  if (link.planId) return `/piani/${link.planId}`
  return null
}

export function AlertsCard() {
  const { data, isPending, isError, error, refetch } = useAlerts()

  return (
    <Card title="Avvisi" className={styles.half}>
      {isPending && [0, 1, 2].map((i) => <Skeleton key={i} height="58px" />)}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}
      {data?.length === 0 && <p className={styles.empty}>Nessun avviso aperto.</p>}
      {data?.map((alert) => {
        const href = alert.link && alertHref(alert.link)
        return (
          <div key={alert.id} className={`${styles.alert} ${TONE[alert.type]}`}>
            <span className={styles.dot} aria-hidden="true" />
            <div>
              <div className={styles.alertTitle}>{alert.title}</div>
              <div className={styles.alertDetail}>
                {alert.detail} · {formatDateTime(alert.createdAt)}
                {href && alert.link && (
                  <>
                    {' · '}
                    <Link to={href}>{alert.link.label.toLowerCase()}</Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </Card>
  )
}
