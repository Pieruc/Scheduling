import { Skeleton } from 'primereact/skeleton'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { useCan } from '@/features/auth/authContext'
import { FallbackCard } from './components/FallbackCard'
import { ModelCard } from './components/ModelCard'
import { VersionHistory } from './components/VersionHistory'
import { useActiveModels, useModelsStatus } from './hooks'
import styles from './components/modelInfo.module.css'

/** Stato dei servizi in cima alla pagina */
function ServiceStatus() {
  const { data, isError } = useModelsStatus()
  if (isError) return <p className={styles.statusUnknown}>Stato dei servizi non disponibile.</p>
  if (!data) return <Skeleton width="320px" height="32px" />
  const items = [
    { ok: data.aiServiceUp, on: 'Servizio AI attivo', off: 'Servizio AI non raggiungibile' },
    { ok: data.cpSatAvailable, on: 'CP-SAT disponibile', off: 'CP-SAT non disponibile' },
  ]
  return (
    <ul className={styles.status} aria-label="Stato dei servizi">
      {items.map((i) => (
        <li key={i.on} className={i.ok ? styles.statusOk : styles.statusDown}>
          <i className={`pi ${i.ok ? 'pi-check-circle' : 'pi-times-circle'}`} aria-hidden="true" />
          {i.ok ? i.on : i.off}
        </li>
      ))}
      {!data.aiServiceUp && (
        <li className={styles.statusDown}>I nuovi piani usano il metodo di riserva.</li>
      )}
    </ul>
  )
}

/** Mockup v2, schermata 9: /modello (sola lettura) */
export function ModelInfoPage() {
  const active = useActiveModels()
  const status = useModelsStatus()
  const isAdmin = useCan('admin')

  return (
    <>
      <PageHeader
        title="Modello AI"
        subtitle="Quali modelli stanno pianificando e quanto sono affidabili. Un nuovo modello si pubblica solo dalla pipeline di addestramento."
      />
      <ServiceStatus />

      {active.isPending && (
        <div className={styles.models}>
          <Skeleton height="320px" />
          <Skeleton height="320px" />
        </div>
      )}
      {active.isError && <ErrorState error={active.error} onRetry={() => active.refetch()} />}
      {active.data && (
        <div className={styles.models}>
          <ModelCard
            component="POLICY"
            title="M2 · Policy"
            role="Decide in che ordine e su quale risorsa fare le attività."
            model={active.data.policy}
            note="Confrontato a ogni richiesta con le regole ATC ed EDD."
            fallback="I piani li calcolano le regole di riserva (CP-SAT, ATC, EDD)."
          />
          <ModelCard
            component="CONTEXT"
            title="M1 · Context"
            role="Stima le durate e i setup che mancano nelle commesse."
            model={active.data.context}
            note="Impara dagli orari registrati dagli operatori."
            fallback="Le durate mancanti si stimano con un valore di default."
          />
        </div>
      )}

      {status.data && <FallbackCard status={status.data} />}
      {/* Lo storico lo restituisce il backend solo all'amministratore (contratti A.7) */}
      {isAdmin && <VersionHistory />}
    </>
  )
}
