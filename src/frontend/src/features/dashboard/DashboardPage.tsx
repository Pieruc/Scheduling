import { Button } from 'primereact/button'
import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'

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
      <Placeholder screen="1 · Dashboard" />
    </>
  )
}
