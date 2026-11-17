import { IconField } from 'primereact/iconfield'
import { InputIcon } from 'primereact/inputicon'
import { InputText } from 'primereact/inputtext'
import { SelectButton } from 'primereact/selectbutton'
import { Skeleton } from 'primereact/skeleton'
import { useMemo, useState } from 'react'
import { NavLink } from 'react-router'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { StatusTag } from '@/components/StatusTag'
import { formatShortDate } from '@/lib/format'
import { priorityLabel } from '@/lib/labels'
import { useOrders } from '../hooks'
import styles from './orders.module.css'

const FILTERS = [
  { label: 'Aperte', value: 'open' },
  { label: 'Tutte', value: 'all' },
]

/** Stati che contano come "da pianificare o in corso" */
const OPEN_STATES = ['OPEN', 'PLANNED', 'IN_PROGRESS']

export function OrderList() {
  const { data, isPending, isError, error, refetch } = useOrders()
  const [filter, setFilter] = useState('open')
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? [])
      .filter((o) => filter === 'all' || OPEN_STATES.includes(o.status))
      .filter(
        (o) =>
          !q ||
          o.id.toLowerCase().includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          o.description.toLowerCase().includes(q),
      )
  }, [data, filter, search])

  return (
    <Card className={styles.listCard}>
      <div className={styles.listTools}>
        <IconField iconPosition="left" className={styles.search}>
          <InputIcon className="pi pi-search" />
          <InputText
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca commessa o cliente"
            aria-label="Cerca commessa o cliente"
          />
        </IconField>
        <SelectButton
          value={filter}
          options={FILTERS}
          onChange={(e) => e.value && setFilter(e.value)}
          allowEmpty={false}
          aria-label="Quali commesse mostrare"
        />
      </div>

      {isPending && [0, 1, 2, 3].map((i) => <Skeleton key={i} height="64px" />)}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}
      {data && rows.length === 0 && (
        <p className={styles.muted}>Nessuna commessa corrisponde alla ricerca.</p>
      )}

      <nav aria-label="Commesse">
        <ul className={styles.list}>
          {rows.map((o) => {
            const priority = priorityLabel(o.priority)
            return (
              <li key={o.id}>
                <NavLink
                  to={`/commesse/${o.id}`}
                  className={({ isActive }) =>
                    isActive ? `${styles.orderLink} ${styles.orderActive}` : styles.orderLink
                  }
                >
                  <span className={styles.orderMain}>
                    <span className="mono">{o.id}</span>
                    <span className={styles.customer}>{o.customer}</span>
                  </span>
                  <span className={styles.orderMeta}>
                    {o.dueDate ? (
                      <span>{formatShortDate(o.dueDate)}</span>
                    ) : (
                      <span className={styles.missing}>scadenza mancante</span>
                    )}
                    <StatusTag label={priority.label} tone={priority.tone} />
                  </span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </Card>
  )
}
