import { Button } from 'primereact/button'
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router'
import { PageHeader } from '@/components/PageHeader'

/** Mostrata quando la pagina non esiste o una pagina va in errore. */
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={notFound ? 'Pagina non trovata' : 'Qualcosa è andato storto'}
        subtitle={notFound ? 'L’indirizzo non corrisponde a nessuna pagina.' : String(error)}
      />
      <div>
        <Button label="Torna alla dashboard" icon="pi pi-home" onClick={() => navigate('/')} />
      </div>
    </div>
  )
}
