import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'

export function OrdersPage() {
  return (
    <>
      <PageHeader
        title="Commesse"
        subtitle="I lavori da pianificare: scadenza, priorità e attività collegate da precedenze."
      />
      <Placeholder screen="2 · Commesse" />
    </>
  )
}
