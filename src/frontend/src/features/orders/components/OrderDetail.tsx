import { ReactFlowProvider } from '@xyflow/react'
import { Button } from 'primereact/button'
import { confirmDialog } from 'primereact/confirmdialog'
import { Skeleton } from 'primereact/skeleton'
import { useEffect, useMemo, useState } from 'react'
import { useBlocker } from 'react-router'
import type { Activity, Order, Precedence, ProcessGraph } from '@/api/types/orders'
import { useToast } from '@/app/toast/toastContext'
import { Card } from '@/components/Card'
import { ErrorState } from '@/components/ErrorState'
import { StatusTag } from '@/components/StatusTag'
import { useResources, useSkills } from '@/features/configuration/hooks'
import { formatHours, formatShortDate } from '@/lib/format'
import { arcProblem } from '@/lib/graph'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { ORDER_STATUS, priorityLabel } from '@/lib/labels'
import { useProcessGraph, useSaveProcessGraph } from '../hooks'
import { ActivityTable } from './ActivityTable'
import { ProcessGraphEditor } from './ProcessGraphEditor'
import styles from './orders.module.css'

const samePrecedences = (a: Precedence[], b: Precedence[]) => {
  const key = (p: Precedence) => `${p.from}->${p.to}`
  const set = new Set(a.map(key))
  return a.length === b.length && b.every((p) => set.has(key(p)))
}

/** Dettaglio di una commessa: intestazione + area di lavoro sul grafo. */
export function OrderDetail({ order }: { order: Order }) {
  const graph = useProcessGraph(order.id)
  const priority = priorityLabel(order.priority)
  const status = ORDER_STATUS[order.status]

  return (
    <Card className={styles.detailCard}>
      <header className={styles.detailHead}>
        <div>
          <h2 className={styles.detailTitle}>
            {order.id} · {order.description}
          </h2>
          <div className={styles.detailMeta}>
            <span>{order.customer}</span>
            <span>
              Scadenza{' '}
              {order.dueDate ? (
                formatShortDate(order.dueDate)
              ) : (
                <strong className={styles.missing}>mancante</strong>
              )}
            </span>
            <span>Peso {order.weight}</span>
            <StatusTag label={`Priorità ${priority.label.toLowerCase()}`} tone={priority.tone} />
            <StatusTag label={status.label} tone={status.tone} />
          </div>
        </div>
      </header>

      {graph.isPending && <Skeleton height="300px" />}
      {graph.isError && <ErrorState error={graph.error} onRetry={() => graph.refetch()} />}
      {graph.data && (
        // key: cambiando commessa l'area di lavoro riparte dai suoi dati. Dopo un salvataggio
        // non serve: la bozza coincide già con i dati salvati (e la notifica di successo arriva).
        <GraphWorkspace
          key={order.id}
          orderId={order.id}
          graph={graph.data}
          editable={order.status === 'OPEN'}
        />
      )}
    </Card>
  )
}

type GraphWorkspaceProps = { orderId: string; graph: ProcessGraph; editable: boolean }

function GraphWorkspace({ orderId, graph, editable }: GraphWorkspaceProps) {
  const toast = useToast()
  const save = useSaveProcessGraph(orderId)
  const { data: resources = [] } = useResources()
  const { data: skills = [] } = useSkills()
  const [precedences, setPrecedences] = useState(graph.precedences)
  // Sotto i 600px il grafo va dall'alto in basso: in orizzontale diventerebbe illeggibile
  const vertical = useMediaQuery('(max-width: 600px)')
  const [saveError, setSaveError] = useState<unknown>(null)
  const dirty = !samePrecedences(precedences, graph.precedences)

  const resourceName = useMemo(() => {
    const map = new Map(resources.map((r) => [r.id, r.name]))
    return (id: string) => map.get(id) ?? id
  }, [resources])
  const skillName = useMemo(() => {
    const map = new Map(skills.map((s) => [s.code, s.name]))
    return (code: string) => map.get(code) ?? code
  }, [skills])

  const describe = (a: Activity) => {
    const names = a.modes.map((m) => m.resourceIds.map(resourceName).join(' + ')).join(' o ')
    const known = a.modes.flatMap((m) => (m.durationMin === null ? [] : [m.durationMin]))
    if (known.length === 0) return { detail: `${names} · da stimare`, toEstimate: true }
    return { detail: `${names} · ${formatHours(Math.min(...known))}`, toEstimate: false }
  }

  const onAdd = (from: string, to: string) => {
    if (!editable) return 'La commessa non è più modificabile.'
    const problem = arcProblem(precedences, from, to)
    if (!problem) {
      setPrecedences((list) => [...list, { from, to, type: 'FS', minLagMin: 0, maxLagMin: null }])
    }
    return problem
  }
  const onRemove = (from: string, to: string) =>
    setPrecedences((list) => list.filter((p) => !(p.from === from && p.to === to)))

  const onSave = () => {
    setSaveError(null)
    save.mutate(
      { activities: graph.activities, precedences },
      {
        onSuccess: () => toast.success('Precedenze salvate', orderId),
        onError: (error) => setSaveError(error),
      },
    )
  }

  // Modifiche non salvate: chiede conferma prima di cambiare pagina o commessa...
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    confirmDialog({
      header: 'Uscire senza salvare?',
      message: 'Le precedenze modificate di questa commessa andranno perse.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Esci senza salvare',
      rejectLabel: 'Resta qui',
      acceptClassName: 'p-button-danger',
      defaultFocus: 'reject',
      accept: () => blocker.proceed(),
      reject: () => blocker.reset(),
      onHide: () => blocker.state === 'blocked' && blocker.reset(),
    })
  }, [blocker])

  // ...e prima di chiudere o ricaricare la scheda del browser.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  return (
    <>
      <section aria-labelledby="graph-title" className={styles.section}>
        <h3 id="graph-title" className={styles.sectionTitle}>
          Grafo delle attività
        </h3>
        <ReactFlowProvider>
          <ProcessGraphEditor
            // Cambiando direzione le posizioni si ricalcolano da zero
            key={vertical ? 'vertical' : 'horizontal'}
            vertical={vertical}
            activities={graph.activities}
            precedences={precedences}
            describe={describe}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        </ReactFlowProvider>
      </section>

      <section aria-labelledby="activities-title" className={styles.section}>
        <h3 id="activities-title" className={styles.sectionTitle}>
          Attività
        </h3>
        <ActivityTable
          activities={graph.activities}
          precedences={precedences}
          resourceName={resourceName}
          skillName={skillName}
          onAdd={onAdd}
          onRemove={onRemove}
          onRejected={(reason) => toast.error('Precedenza rifiutata', reason)}
        />
      </section>

      {saveError !== null && <ErrorState error={saveError} />}

      {editable && (
        // Fissa in basso solo con modifiche da salvare: altrimenti non copre il contenuto
        <div className={`${styles.saveBar} ${dirty ? styles.saveBarSticky : ''}`}>
          <span className={dirty ? styles.unsaved : styles.saved} role="status">
            {dirty ? 'Modifiche non salvate' : 'Tutto salvato'}
          </span>
          <Button
            type="button"
            label="Annulla modifiche"
            outlined
            disabled={!dirty || save.isPending}
            onClick={() => {
              setPrecedences(graph.precedences)
              setSaveError(null)
            }}
          />
          <Button
            type="button"
            label="Salva precedenze"
            icon="pi pi-check"
            disabled={!dirty}
            loading={save.isPending}
            onClick={onSave}
          />
        </div>
      )}
    </>
  )
}
