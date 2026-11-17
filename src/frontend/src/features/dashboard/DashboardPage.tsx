import { Button } from 'primereact/button'
import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { AlertsCard } from './components/AlertsCard'
import { KpiRow } from './components/KpiRow'
import { RecentRequestsCard } from './components/RecentRequestsCard'
import { UtilizationCard } from './components/UtilizationCard'
import styles from './components/dashboard.module.css'

/** Mockup v2, schermata 1. Ogni sezione carica i suoi dati: un errore non blocca le altre. */
export function DashboardPage() {
  const navigate = useNavigate()

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Panoramica della settimana: indicatori, avvisi e piani recenti."
        actions={
          <Button
            label="Nuova pianificazione"
            icon="pi pi-plus"
            onClick={() => navigate('/pianifica')}
          />
        }
      />
      <KpiRow />
      <div className={styles.columns}>
        <AlertsCard />
        <UtilizationCard />
      </div>
      <RecentRequestsCard />
    </>
  )
}
