import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { IconField } from 'primereact/iconfield'
import { InputIcon } from 'primereact/inputicon'
import { InputText } from 'primereact/inputtext'
import { Skeleton } from 'primereact/skeleton'
import { useNavigate, useSearchParams } from 'react-router'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { useCan } from '@/features/auth/authContext'
import { PlansTable } from './components/PlansTable'
import {
  applyFilters,
  DEFAULT_PERIOD,
  PERIOD_OPTIONS,
  readFilters,
  STATUS_OPTIONS,
  type Filters,
} from './filters'
import { usePlanRequests } from './hooks'
import styles from './components/plansList.module.css'

/** Mockup v2, schermata 7: /piani */
export function PlansListPage() {
  // Solo il pianificatore crea nuove richieste
  const canPlan = useCan('plan')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const { data, dataUpdatedAt, isPending, isError, error, refetch } = usePlanRequests()

  // I filtri stanno nell'indirizzo: tornando indietro dal Gantt si ritrovano uguali
  const setFilter = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch }
    const p = new URLSearchParams()
    if (next.q) p.set('q', next.q)
    if (next.status !== 'all') p.set('stato', next.status)
    if (next.period !== DEFAULT_PERIOD) p.set('periodo', next.period)
    setParams(p, { replace: true })
  }

  // Il periodo si conta dall'ultimo caricamento dei dati (pochi elementi: filtro a ogni render)
  const inPeriod = data
    ? applyFilters(data, { ...filters, q: '', status: 'all' }, dataUpdatedAt)
    : []
  const visible = applyFilters(inPeriod, filters, dataUpdatedAt)
  const narrowed = filters.q !== '' || filters.status !== 'all'

  return (
    <>
      <PageHeader
        title="Piani"
        subtitle="Tutte le richieste di pianificazione e i piani generati. Ogni richiesta produce 3 piani."
        actions={
          canPlan && (
            <Button
              label="Nuova pianificazione"
              icon="pi pi-plus"
              onClick={() => navigate('/pianifica')}
            />
          )
        }
      />

      <Card>
        <div className={styles.toolbar} role="search" aria-label="Filtra i piani">
          <IconField iconPosition="left" className={styles.search}>
            <InputIcon className="pi pi-search" />
            <InputText
              value={filters.q}
              onChange={(e) => setFilter({ q: e.target.value })}
              placeholder="Commessa, piano o richiesta"
              aria-label="Cerca per commessa, piano o richiesta"
            />
          </IconField>
          <label htmlFor="filtro-stato" className="visually-hidden">
            Stato
          </label>
          <Dropdown
            inputId="filtro-stato"
            value={filters.status}
            options={STATUS_OPTIONS}
            onChange={(e) => setFilter({ status: e.value })}
            className={styles.filter}
          />
          <label htmlFor="filtro-periodo" className="visually-hidden">
            Periodo
          </label>
          <Dropdown
            inputId="filtro-periodo"
            value={filters.period}
            options={PERIOD_OPTIONS}
            onChange={(e) => setFilter({ period: e.value })}
            className={styles.filter}
          />
        </div>

        {isPending && <Skeleton height="360px" />}
        {isError && <ErrorState error={error} onRetry={() => refetch()} />}
        {data && (
          <>
            <p className={styles.count} aria-live="polite">
              {visible.length === 1 ? '1 richiesta' : `${visible.length} richieste`}
              {narrowed && ` su ${inPeriod.length} nel periodo`}
            </p>
            {visible.length > 0 ? (
              <PlansTable requests={visible} />
            ) : (
              <div className={styles.empty}>
                <p>Nessuna richiesta corrisponde ai filtri.</p>
                <Button
                  label="Azzera i filtri"
                  icon="pi pi-filter-slash"
                  outlined
                  onClick={() => setParams(new URLSearchParams(), { replace: true })}
                />
              </div>
            )}
          </>
        )}
      </Card>

      <p className={styles.legend}>
        Un piano approvato va in esecuzione; gli altri due della stessa richiesta risultano
        «Scartati». Una nuova versione modificata nel Gantt prende il posto dell’originale.
      </p>
    </>
  )
}
