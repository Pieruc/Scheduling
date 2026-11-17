import { useParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'

export function PlanGanttPage() {
  const { planId } = useParams()
  return (
    <>
      <PageHeader
        title={`Revisione del piano · ${planId}`}
        subtitle="Gantt delle risorse: modifica, approva o rifiuta."
      />
      <Placeholder screen="5 · Gantt delle risorse" />
    </>
  )
}
