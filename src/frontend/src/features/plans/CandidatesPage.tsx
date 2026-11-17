import { useParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Placeholder } from '@/components/Placeholder'

export function CandidatesPage() {
  const { requestId } = useParams()
  return (
    <>
      <PageHeader
        title={`Confronto dei piani · ${requestId}`}
        subtitle="Economico, bilanciato e veloce, confrontati con le regole ATC ed EDD."
      />
      <Placeholder screen="4 · Confronto dei 3 piani" />
    </>
  )
}
