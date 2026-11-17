import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'

export function NewPlanPage() {
  return (
    <>
      <PageHeader
        title="Nuova pianificazione"
        subtitle="Descrivi cosa ti serve: il sistema lo traduce, controlla i dati e prepara 3 piani alternativi."
      />
      <Placeholder screen="3 · Nuova pianificazione" />
    </>
  )
}
