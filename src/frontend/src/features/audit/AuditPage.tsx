import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { IconField } from 'primereact/iconfield'
import { InputIcon } from 'primereact/inputicon'
import { InputText } from 'primereact/inputtext'
import { Skeleton } from 'primereact/skeleton'
import { useSearchParams } from 'react-router'
import type { AuditAction, AuditRecord } from '@/api/types/audit'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { PageHeader } from '@/components/PageHeader'
import { DEFAULT_PERIOD, PERIOD_OPTIONS, type PeriodFilter } from '@/lib/period'
import { AuditDetail } from './components/AuditDetail'
import { AuditTable } from './components/AuditTable'
import { ACTION_OPTIONS, toCsv, userLabel } from './format'
import { useAudit } from './hooks'
import styles from './components/audit.module.css'

type Filters = {
  q: string
  action: AuditAction | 'all'
  user: string
  period: PeriodFilter
  record: string | null
}

function readFilters(p: URLSearchParams): Filters {
  const action = p.get('azione') as Filters['action'] | null
  const period = p.get('periodo') as PeriodFilter | null
  return {
    q: p.get('q') ?? '',
    action: ACTION_OPTIONS.some((o) => o.value === action) ? action! : 'all',
    user: p.get('utente') ?? 'all',
    period: PERIOD_OPTIONS.some((o) => o.value === period) ? period! : DEFAULT_PERIOD,
    record: p.get('record'),
  }
}

function matches(r: AuditRecord, f: Filters) {
  const q = f.q.trim().toLowerCase()
  const plans = [r.planId, r.details?.newPlanId, ...(r.details?.planIds ?? [])]
  return (
    (f.action === 'all' || r.action === f.action) &&
    (f.user === 'all' || r.user === f.user) &&
    (!q || plans.some((id) => id?.toLowerCase().includes(q)) || r.id.toLowerCase().includes(q))
  )
}

/** Scarica il CSV generato nel browser */
function download(records: AuditRecord[]) {
  const url = URL.createObjectURL(new Blob([toCsv(records)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Mockup v2, schermata 10: /audit */
export function AuditPage() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const { data, isPending, isError, error, refetch } = useAudit(filters.period)

  // Filtri e record aperto stanno nell'indirizzo: il link a un record si può condividere
  const setFilter = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch }
    const p = new URLSearchParams()
    if (next.q) p.set('q', next.q)
    if (next.action !== 'all') p.set('azione', next.action)
    if (next.user !== 'all') p.set('utente', next.user)
    if (next.period !== DEFAULT_PERIOD) p.set('periodo', next.period)
    if (next.record) p.set('record', next.record)
    setParams(p, { replace: true })
  }

  const visible = data?.filter((r) => matches(r, filters)) ?? []
  const users = [...new Set(data?.map((r) => r.user) ?? [])].sort()
  const userOptions = [
    { value: 'all', label: 'Tutti gli utenti' },
    ...users.map((u) => ({ value: u, label: userLabel(u) })),
  ]
  const selected = data?.find((r) => r.id === filters.record)

  return (
    <>
      <PageHeader
        title="Audit"
        subtitle="Chi ha fatto cosa, quando e con quale modello. Ogni piano è riproducibile dallo stesso input e dalla stessa versione."
        actions={
          <Button
            label="Esporta CSV"
            icon="pi pi-download"
            outlined
            disabled={visible.length === 0}
            onClick={() => download(visible)}
          />
        }
      />

      <div className={`${styles.layout} ${selected ? styles.withDetail : ''}`}>
        <Card className={styles.tableCard}>
          <div className={styles.toolbar} role="search" aria-label="Filtra l'audit">
            <IconField iconPosition="left" className={styles.search}>
              <InputIcon className="pi pi-search" />
              <InputText
                value={filters.q}
                onChange={(e) => setFilter({ q: e.target.value })}
                placeholder="Piano, es. PLAN-0041"
                aria-label="Cerca per piano o record"
              />
            </IconField>
            {(
              [
                ['filtro-azione', 'Azione', 'action', ACTION_OPTIONS],
                ['filtro-utente', 'Utente', 'user', userOptions],
                ['filtro-periodo', 'Periodo', 'period', PERIOD_OPTIONS],
              ] as const
            ).map(([id, label, key, options]) => (
              <div key={id} className={styles.filter}>
                <label htmlFor={id} className="visually-hidden">
                  {label}
                </label>
                <Dropdown
                  inputId={id}
                  value={filters[key]}
                  options={[...options]}
                  onChange={(e) => setFilter({ [key]: e.value })}
                  className={styles.fullWidth}
                />
              </div>
            ))}
          </div>

          {isPending && <Skeleton height="360px" />}
          {isError && <ErrorState error={error} onRetry={() => refetch()} />}
          {data && (
            <>
              <p className={styles.count} aria-live="polite">
                {visible.length === 1 ? '1 record' : `${visible.length} record`}
                {visible.length !== data.length && ` su ${data.length} nel periodo`}
              </p>
              {visible.length > 0 ? (
                <AuditTable
                  records={visible}
                  selectedId={filters.record}
                  onSelect={(id) => setFilter({ record: id })}
                />
              ) : (
                <div className={styles.empty}>
                  <p>Nessun record corrisponde ai filtri.</p>
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

        {selected && <AuditDetail record={selected} onClose={() => setFilter({ record: null })} />}
      </div>
    </>
  )
}
