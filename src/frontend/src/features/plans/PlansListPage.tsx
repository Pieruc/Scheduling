import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'

export function PlansListPage() {
  return (
    <>
      <PageHeader
        title="Piani"
        subtitle="Tutte le richieste di pianificazione e i piani generati."
      />
      <Placeholder screen="7 · Elenco piani" />
    </>
  )
}
