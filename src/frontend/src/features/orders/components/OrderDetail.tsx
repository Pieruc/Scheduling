import { ReactFlowProvider } from '@xyflow/react'
import { Button } from 'primereact/button'
import { confirmDialog } from 'primereact/confirmdialog'
import { Skeleton } from 'primereact/skeleton'
import { useEffect, useMemo, useState } from 'react'
import { useBlocker } from 'react-router'
import { errorMessage } from '@/api/errors'
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
import { useCancelOrder, useProcessGraph, useSaveProcessGraph } from '../hooks'
import { ActivityForm, type ActivityDraft } from './ActivityForm'
import { OrderForm } from './OrderForm'
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
  const toast = useToast()
  const cancel = useCancelOrder()
  const [editing, setEditing] = useState(false)
  const canCancel = order.status === 'OPEN' || order.status === 'PLANNED'

  const askCancel = () =>
    confirmDialog({
      header: `Annullare ${order.id}?`,
      message:
        'Non verrà più pianificata. Resta nell’elenco «Tutte» e nei piani già fatti, per l’audit.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Annulla commessa',
      rejectLabel: 'Tienila',
      acceptClassName: 'p-button-danger',
      defaultFocus: 'reject',
      accept: () =>
        cancel.mutate(order.id, {
          onSuccess: () => toast.success('Commessa annullata', order.id),
          onError: (e) => toast.error('Annullamento non riuscito', errorMessage(e)),
        }),
    })

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
        <div className={styles.detailActions}>
          {order.status === 'OPEN' && (
            <Button
              label="Modifica dati"
              icon="pi pi-pencil"
              outlined
              onClick={() => setEditing(true)}
            />
          )}
          {canCancel && (
            <Button
              label="Annulla commessa"
              severity="danger"
              text
              loading={cancel.isPending}
              onClick={askCancel}
            />
          )}
        </div>
      </header>
      {editing && <OrderForm order={order} onClose={() => setEditing(false)} />}

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
  const [activities, setActivities] = useState(graph.activities)
  const [precedences, setPrecedences] = useState(graph.precedences)
  // null = finestra chiusa, 'new' = nuova attività, altrimenti l'id da modificare
  const [editing, setEditing] = useState<string | null>(null)
  // Sotto i 600px il grafo va dall'alto in basso: in orizzontale diventerebbe illeggibile
  const vertical = useMediaQuery('(max-width: 600px)')
  const [saveError, setSaveError] = useState<unknown>(null)
  const dirty =
    !samePrecedences(precedences, graph.precedences) ||
    JSON.stringify(activities) !== JSON.stringify(graph.activities)

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

  /** Id libero per una nuova attività: C101-A7, C101-A8, ... */
  const newId = () => {
    const prefix = orderId.replace('-', '')
    let n = activities.length + 1
    while (activities.some((a) => a.id === `${prefix}-A${n}`)) n++
    return `${prefix}-A${n}`
  }

  /** Applica il form dell'attività alla bozza; le precedenze nuove passano dagli stessi controlli */
  const applyActivity = ({ activity, after }: ActivityDraft) => {
    setActivities((list) =>
      list.some((a) => a.id === activity.id)
        ? // i campi che il form non mostra (es. setupFamily) restano quelli salvati
          list.map((a) => (a.id === activity.id ? { ...a, ...activity } : a))
        : [...list, activity],
    )
    let next = precedences.filter((p) => p.to !== activity.id || after.includes(p.from))
    const rejected: string[] = []
    for (const from of after) {
      if (next.some((p) => p.from === from && p.to === activity.id)) continue
      const problem = arcProblem(next, from, activity.id)
      if (problem) rejected.push(problem)
      else next = [...next, { from, to: activity.id, type: 'FS', minLagMin: 0, maxLagMin: null }]
    }
    setPrecedences(next)
    setEditing(null)
    if (rejected.length) toast.error('Alcune precedenze rifiutate', rejected.join(' · '))
  }

  const removeActivity = (id: string) => {
    setActivities((list) => list.filter((a) => a.id !== id))
    setPrecedences((list) => list.filter((p) => p.from !== id && p.to !== id))
    setEditing(null)
  }

  const onSave = () => {
    setSaveError(null)
    save.mutate(
      { activities, precedences },
      {
        onSuccess: () => toast.success('Attività e precedenze salvate', orderId),
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
      message: 'Le attività e le precedenze modificate di questa commessa andranno perse.',
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
        <div className={styles.sectionHead}>
          <h3 id="graph-title" className={styles.sectionTitle}>
            Grafo delle attività
          </h3>
          {editable && (
            <Button
              type="button"
              label="Aggiungi attività"
              icon="pi pi-plus"
              outlined
              size="small"
              className={styles.addActivity}
              onClick={() => setEditing('new')}
            />
          )}
        </div>
        {activities.length === 0 ? (
          <p className={styles.empty}>
            Nessuna attività. Aggiungi la prima: per ognuna servono le competenze, le risorse che
            possono farla e, se la conosci, la durata.
          </p>
        ) : (
          <ReactFlowProvider>
            <ProcessGraphEditor
              // Cambiando direzione o elenco delle attività le posizioni si ricalcolano da zero
              key={`${vertical ? 'v' : 'h'}-${activities.map((a) => a.id).join()}`}
              vertical={vertical}
              activities={activities}
              precedences={precedences}
              describe={describe}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          </ReactFlowProvider>
        )}
      </section>

      {activities.length > 0 && (
        <section aria-labelledby="activities-title" className={styles.section}>
          <h3 id="activities-title" className={styles.sectionTitle}>
            Attività
          </h3>
          <ActivityTable
            activities={activities}
            precedences={precedences}
            resourceName={resourceName}
            skillName={skillName}
            onAdd={onAdd}
            onRemove={onRemove}
            onRejected={(reason) => toast.error('Precedenza rifiutata', reason)}
            onEdit={editable ? setEditing : undefined}
          />
        </section>
      )}

      {editing !== null && (
        <ActivityForm
          activity={activities.find((a) => a.id === editing)}
          newId={newId()}
          others={activities.filter((a) => a.id !== editing)}
          after={precedences.filter((p) => p.to === editing).map((p) => p.from)}
          resources={resources}
          skills={skills}
          onSave={applyActivity}
          onDelete={editing !== 'new' ? () => removeActivity(editing) : undefined}
          onClose={() => setEditing(null)}
        />
      )}

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
              setActivities(graph.activities)
              setSaveError(null)
            }}
          />
          <Button
            type="button"
            label="Salva modifiche"
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
