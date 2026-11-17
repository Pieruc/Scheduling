import {
  Background,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type OnNodesChange,
} from '@xyflow/react'
import '@xyflow/react/style.css'
import { Button } from 'primereact/button'
import { useMemo, useState } from 'react'
import type { Activity, Precedence } from '@/api/types/orders'
import { layers } from '@/lib/graph'
import { ActivityNode, type ActivityFlowNode } from './ActivityNode'
import styles from './graph.module.css'

const NODE_TYPES = { activity: ActivityNode }
const COL_WIDTH = 190
const ROW_HEIGHT = 96
/** Ingombro stimato di un nodo, per inquadrare il grafo all'avvio */
const NODE_W = 150
const NODE_H = 64
// In React Flow 13 il padding vuole l'unità ('24px', '10%'): un numero non è più una frazione
const FIT = { padding: '24px', maxZoom: 1 } as const

type ProcessGraphEditorProps = {
  activities: Activity[]
  precedences: Precedence[]
  /** Testo del nodo sotto il nome, es. "CNC 1 o 2 · 3 h" */
  describe: (activity: Activity) => { detail: string; toEstimate: boolean }
  /** Prova ad aggiungere from -> to; restituisce il motivo del rifiuto oppure null */
  onAdd: (from: string, to: string) => string | null
  onRemove: (from: string, to: string) => void
  /** Dall'alto in basso: per gli schermi stretti */
  vertical: boolean
}

/** Posizioni iniziali: colonne per livello (da sinistra a destra), righe in ordine. */
function initialNodes(
  activities: Activity[],
  precedences: Precedence[],
  describe: ProcessGraphEditorProps['describe'],
  vertical: boolean,
): ActivityFlowNode[] {
  const level = layers(
    activities.map((a) => a.id),
    precedences,
  )
  const rowInLevel = new Map<number, number>()
  return activities.map((a) => {
    const col = level.get(a.id) ?? 0
    const row = rowInLevel.get(col) ?? 0
    rowInLevel.set(col, row + 1)
    return {
      id: a.id,
      type: 'activity',
      // In verticale i livelli diventano righe e le attività parallele si affiancano
      position: vertical
        ? { x: row * (NODE_W + 20), y: col * (NODE_H + 40) }
        : { x: col * COL_WIDTH, y: row * ROW_HEIGHT },
      data: { name: a.name, ...describe(a), vertical },
    }
  })
}

const edgeId = (p: { from: string; to: string }) => `${p.from}->${p.to}`

export function ProcessGraphEditor(props: ProcessGraphEditorProps) {
  const { activities, precedences, describe, onAdd, onRemove, vertical } = props
  const { fitView, fitBounds, zoomIn, zoomOut } = useReactFlow()
  // Le posizioni si possono trascinare: stato locale, non vanno salvate (il contratto non le prevede)
  const [nodes, setNodes] = useState(() =>
    initialNodes(activities, precedences, describe, vertical),
  )
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const name = useMemo(() => new Map(activities.map((a) => [a.id, a.name])), [activities])

  // Nome e dettaglio si ricalcolano a ogni disegno (arrivano dopo risorse e competenze);
  // dallo stato prendiamo solo posizione e selezione.
  const byId = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities])
  const viewNodes = nodes.map((n) => {
    const activity = byId.get(n.id)
    return activity ? { ...n, data: { name: activity.name, ...describe(activity), vertical } } : n
  })

  const edges: Edge[] = useMemo(
    () =>
      precedences.map((p) => ({
        id: edgeId(p),
        source: p.from,
        target: p.to,
        selected: edgeId(p) === selectedEdge,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        className: styles.edge,
        ariaLabel: `${name.get(p.from)} prima di ${name.get(p.to)}`,
      })),
    [precedences, selectedEdge, name],
  )

  const onNodesChange: OnNodesChange<ActivityFlowNode> = (changes) =>
    setNodes((current) => changes.applyTo(current))

  const onConnect = (c: Connection) => {
    const problem = onAdd(c.source, c.target)
    setMessage(
      problem
        ? { text: `Precedenza rifiutata: ${problem}`, error: true }
        : { text: `Aggiunta: ${name.get(c.source)} prima di ${name.get(c.target)}.`, error: false },
    )
  }

  const removeSelected = () => {
    const p = precedences.find((x) => edgeId(x) === selectedEdge)
    if (!p) return
    onRemove(p.from, p.to)
    setSelectedEdge(null)
    setMessage({ text: `Tolta: ${name.get(p.from)} prima di ${name.get(p.to)}.`, error: false })
  }

  return (
    <div className={styles.editor}>
      <div className={`${styles.canvas} ${vertical ? styles.canvasTall : ''}`}>
        <ReactFlow
          nodes={viewNodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          // All'avvio inquadra il rettangolo che contiene tutti i nodi (le posizioni le calcoliamo noi)
          onInit={() => {
            const xs = nodes.map((n) => n.position.x)
            const ys = nodes.map((n) => n.position.y)
            void fitBounds(
              {
                x: Math.min(...xs),
                y: Math.min(...ys),
                width: Math.max(...xs) - Math.min(...xs) + NODE_W,
                height: Math.max(...ys) - Math.min(...ys) + NODE_H,
              },
              { padding: FIT.padding },
            )
          }}
          forceColorMode="light"
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onEdgeClick={(_, edge) => setSelectedEdge(edge.id)}
          onPaneClick={() => setSelectedEdge(null)}
          onEdgesDelete={(deleted) => {
            deleted.forEach((e) => onRemove(e.source, e.target))
            setSelectedEdge(null)
            setMessage({ text: 'Precedenza tolta.', error: false })
          }}
          deleteKeyCode={['Backspace', 'Delete']}
          // La rotella fa scorrere la pagina, non zooma (niente "scroll-jacking")
          zoomOnScroll={false}
          preventScrolling={false}
          minZoom={0.25}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
          aria-label="Grafo delle attività: trascina da un’attività all’altra per creare una precedenza"
        >
          <Background gap={16} size={1} color="#dde3eb" />
        </ReactFlow>
      </div>

      <div className={styles.tools}>
        <div className={styles.zoom}>
          <Button
            type="button"
            icon="pi pi-search-plus"
            outlined
            aria-label="Ingrandisci il grafo"
            onClick={() => zoomIn()}
          />
          <Button
            type="button"
            icon="pi pi-search-minus"
            outlined
            aria-label="Rimpicciolisci il grafo"
            onClick={() => zoomOut()}
          />
          <Button
            type="button"
            icon="pi pi-expand"
            outlined
            aria-label="Adatta il grafo allo spazio"
            onClick={() => fitView(FIT)}
          />
        </div>
        {selectedEdge && (
          <Button
            type="button"
            label="Togli la precedenza selezionata"
            icon="pi pi-times"
            severity="danger"
            outlined
            onClick={removeSelected}
          />
        )}
      </div>

      <p
        className={`${styles.message} ${message?.error ? styles.messageError : ''}`}
        role="status"
        aria-live="polite"
      >
        {message?.text ??
          (vertical
            ? 'Trascina dal pallino sotto un’attività a quello sopra un’altra per creare una precedenza, oppure usa la colonna “Dopo”. Tocca una freccia per toglierla.'
            : 'Trascina dal pallino a destra di un’attività a quello a sinistra di un’altra per creare una precedenza. Clicca una freccia per toglierla.')}
      </p>
    </div>
  )
}
