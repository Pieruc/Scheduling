import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import styles from './graph.module.css'

export type ActivityNodeData = {
  name: string
  /** Riassunto di risorse e durata, es. "CNC 1 o 2 · 3 h" */
  detail: string
  /** Durata non inserita: la stima l'AI */
  toEstimate: boolean
  /** Grafo dall'alto in basso (schermi stretti) invece che da sinistra a destra */
  vertical: boolean
}

export type ActivityFlowNode = Node<ActivityNodeData, 'activity'>

/** Nodo del grafo: entrata dalle precedenti, uscita verso le successive (a sinistra/destra o sopra/sotto). */
export function ActivityNode({ data, selected }: NodeProps<ActivityFlowNode>) {
  return (
    <div className={`${styles.node} ${selected ? styles.nodeSelected : ''}`}>
      <Handle
        type="target"
        position={data.vertical ? Position.Top : Position.Left}
        className={styles.handle}
      />
      <div className={styles.nodeName}>{data.name}</div>
      <div className={`${styles.nodeDetail} ${data.toEstimate ? styles.estimate : ''}`}>
        {data.detail}
      </div>
      <Handle
        type="source"
        position={data.vertical ? Position.Bottom : Position.Right}
        className={styles.handle}
      />
    </div>
  )
}
