import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'

export function OperatorTodayPage() {
  return (
    <>
      <PageHeader
        title="Le tue attività di oggi"
        subtitle="Inizia, metti in pausa e termina le attività; segnala i problemi."
      />
      <Placeholder screen="6 · Operatore" />
    </>
  )
}
