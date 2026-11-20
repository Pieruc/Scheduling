import { Button } from 'primereact/button'
import { Skeleton } from 'primereact/skeleton'
import { useState } from 'react'
import type { Calendar } from '@/api/types/config'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import shared from '../resources/resources.module.css'
import { useCalendars, useResources } from '../hooks'
import styles from '../config.module.css'
import { CalendarForm } from './CalendarForm'
import { weeklyHours } from './calendarSchema'

const hours = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

/** Configurazione → Calendari: turni e chiusure, usati per le finestre di lavoro delle risorse */
export function CalendarsTab() {
  const calendars = useCalendars()
  const resources = useResources()
  // null = niente aperto, 'new' = nuovo calendario, altrimenti l'id
  const [selection, setSelection] = useState<string | null>(null)

  const usage = (id: string) => resources.data?.filter((r) => r.calendarId === id).length ?? 0
  const selected = calendars.data?.find((c) => c.id === selection)
  const formOpen = selection === 'new' || selected !== undefined

  return (
    <div className={`${shared.layout} ${formOpen ? shared.withPanel : ''}`}>
      <Card className={shared.tableCard}>
        <div className={shared.toolbar}>
          <p className={shared.hint}>
            Ogni risorsa lavora solo nei turni del suo calendario. Scegli una riga per modificarla.
          </p>
          <Button label="Nuovo calendario" icon="pi pi-plus" onClick={() => setSelection('new')} />
        </div>
        {calendars.isPending && <Skeleton height="200px" />}
        {calendars.isError && (
          <ErrorState error={calendars.error} onRetry={() => calendars.refetch()} />
        )}
        {calendars.data && (
          <table className={styles.table}>
            <caption className="visually-hidden">Calendari dei turni</caption>
            <thead>
              <tr>
                <th scope="col">Calendario</th>
                <th scope="col">Turni</th>
                <th scope="col" className={styles.num}>
                  Ore a settimana
                </th>
                <th scope="col" className={styles.num}>
                  Chiusure
                </th>
                <th scope="col" className={styles.num}>
                  Risorse
                </th>
              </tr>
            </thead>
            <tbody>
              {calendars.data.map((c: Calendar) => (
                <tr
                  key={c.id}
                  className={c.id === selection ? styles.selected : undefined}
                  onClick={() => setSelection(c.id)}
                >
                  <th scope="row">
                    <button
                      type="button"
                      className={styles.rowButton}
                      aria-pressed={c.id === selection}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelection(c.id)
                      }}
                    >
                      <span className={styles.rowTitle}>{c.name}</span>
                      <span className={`mono ${styles.rowCode}`}>{c.id}</span>
                    </button>
                  </th>
                  <td data-label="Turni">{c.shiftsSummary || '—'}</td>
                  <td data-label="Ore a settimana" className={styles.num}>
                    {hours.format(weeklyHours(c))} h
                  </td>
                  <td data-label="Chiusure" className={styles.num}>
                    {c.holidays.length}
                  </td>
                  <td data-label="Risorse" className={styles.num}>
                    {resources.data ? usage(c.id) : '…'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {formOpen && (
        <aside className={shared.panel} aria-label="Dettaglio del calendario">
          <Card>
            <CalendarForm
              key={selection ?? 'none'}
              calendar={selected}
              usedBy={selected ? usage(selected.id) : 0}
              onSaved={(saved) => setSelection(saved.id)}
              onCancel={() => setSelection(null)}
            />
          </Card>
        </aside>
      )}
    </div>
  )
}
