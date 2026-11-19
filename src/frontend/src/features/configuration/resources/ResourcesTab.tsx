import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { IconField } from 'primereact/iconfield'
import { InputIcon } from 'primereact/inputicon'
import { InputText } from 'primereact/inputtext'
import { Skeleton } from 'primereact/skeleton'
import { useMemo, useState } from 'react'
import type { Resource } from '@/api/types/config'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { StatusTag } from '@/components/StatusTag'
import { formatEuro } from '@/lib/format'
import { RESOURCE_TYPE_LABEL, type Tone } from '@/lib/labels'
import { useCalendars, useResources, useSkills } from '../hooks'
import { ResourceForm } from './ResourceForm'
import styles from './resources.module.css'

/** Stato mostrato in tabella: disattivata, indisponibile adesso o nei prossimi 7 giorni, attiva. */
function resourceStatus(r: Resource, now = Date.now()): { label: string; tone: Tone } {
  if (!r.active) return { label: 'Disattivata', tone: 'grey' }
  const week = now + 7 * 86_400_000
  const next = r.unavailability
    .filter((u) => new Date(u.to).getTime() > now && new Date(u.from).getTime() < week)
    .sort((a, b) => a.from.localeCompare(b.from))[0]
  if (!next) return { label: 'Attiva', tone: 'green' }
  const running = new Date(next.from).getTime() <= now
  const tone: Tone = /guast/i.test(next.reason) ? 'red' : 'amber'
  const when = running
    ? 'in corso'
    : new Date(next.from).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })
  return { label: `${next.reason} · ${when}`, tone }
}

/** "Nuova" = form vuoto; un id = risorsa in modifica; null = nessuna selezione */
type Selection = 'new' | string | null

export function ResourcesTab() {
  const resources = useResources()
  const { data: skills = [] } = useSkills()
  const { data: calendars = [] } = useCalendars()
  const [selection, setSelection] = useState<Selection>(null)
  const [search, setSearch] = useState('')

  const skillName = useMemo(() => new Map(skills.map((s) => [s.code, s.name])), [skills])
  const calendarName = useMemo(() => new Map(calendars.map((c) => [c.id, c.name])), [calendars])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = resources.data ?? []
    return q
      ? list.filter((r) => r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      : list
  }, [resources.data, search])

  const selected = resources.data?.find((r) => r.id === selection)
  const formOpen = selection === 'new' || selected !== undefined

  return (
    <div className={`${styles.layout} ${formOpen ? styles.withPanel : ''}`}>
      <Card className={styles.tableCard}>
        <div className={styles.toolbar}>
          <IconField iconPosition="left" className={styles.search}>
            <InputIcon className="pi pi-search" />
            <InputText
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per codice o nome"
              aria-label="Cerca risorse per codice o nome"
            />
          </IconField>
          <Button label="Nuova risorsa" icon="pi pi-plus" onClick={() => setSelection('new')} />
        </div>

        {!formOpen && <p className={styles.hint}>Scegli una riga per modificare la risorsa.</p>}
        {resources.isPending && <Skeleton height="320px" />}
        {resources.isError && (
          <ErrorState error={resources.error} onRetry={() => resources.refetch()} />
        )}
        {resources.data && (
          <DataTable
            // Nuova key quando cambiano le colonne: PrimeReact non ridisegna le righe già pronte
            key={formOpen ? 'compact' : 'full'}
            value={rows}
            dataKey="id"
            size="small"
            // Sotto i 768px ogni riga diventa una scheda: niente scorrimento laterale sul telefono
            responsiveLayout="stack"
            breakpoint="768px"
            selectionMode="single"
            selection={selected ?? null}
            onSelectionChange={(e) => setSelection((e.value as Resource | null)?.id ?? null)}
            metaKeySelection={false}
            rowClassName={(r: Resource) => (r.active ? '' : styles.inactiveRow)}
            emptyMessage="Nessuna risorsa corrisponde alla ricerca."
            className={styles.table}
            aria-label="Elenco delle risorse"
          >
            <Column
              field="id"
              header="Codice"
              body={(r: Resource) => <span className="mono">{r.id}</span>}
            />
            <Column field="name" header="Nome" />
            {/* Con il pannello aperto Tipo e Calendario si vedono nel form */}
            {!formOpen && (
              <Column header="Tipo" body={(r: Resource) => RESOURCE_TYPE_LABEL[r.type]} />
            )}
            <Column
              header="Competenze"
              body={(r: Resource) =>
                r.skills.map((s) => (
                  <span key={s} className={styles.chip}>
                    {skillName.get(s) ?? s}
                  </span>
                ))
              }
            />
            {!formOpen && (
              <Column
                header="Calendario"
                body={(r: Resource) => calendarName.get(r.calendarId) ?? r.calendarId}
              />
            )}
            <Column
              header="Costo orario"
              body={(r: Resource) => (r.costPerHour === null ? '—' : formatEuro(r.costPerHour))}
            />
            <Column
              header="Stato"
              body={(r: Resource) => {
                const s = resourceStatus(r)
                return <StatusTag label={s.label} tone={s.tone} />
              }}
            />
          </DataTable>
        )}
      </Card>

      {formOpen && (
        <aside className={styles.panel} aria-label="Dettaglio della risorsa">
          <Card>
            <ResourceForm
              // key: cambiando risorsa il form riparte dai suoi valori
              key={selection ?? 'none'}
              resource={selected}
              onSaved={(saved) => setSelection(saved.id)}
              onCancel={() => setSelection(null)}
            />
          </Card>
        </aside>
      )}
    </div>
  )
}
