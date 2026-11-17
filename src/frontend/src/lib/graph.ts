/** Funzioni pure sul grafo delle precedenze (attività = nodi, precedenze = archi from -> to). */

type Arc = { from: string; to: string }

function successors(arcs: Arc[]) {
  const next = new Map<string, string[]>()
  for (const a of arcs) next.set(a.from, [...(next.get(a.from) ?? []), a.to])
  return next
}

/** true se da `start` si arriva a `target` seguendo gli archi */
function reaches(arcs: Arc[], start: string, target: string): boolean {
  const next = successors(arcs)
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length) {
    const node = stack.pop()!
    if (node === target) return true
    if (seen.has(node)) continue
    seen.add(node)
    stack.push(...(next.get(node) ?? []))
  }
  return false
}

/**
 * Perché non si può aggiungere l'arco from -> to, oppure null se si può.
 * Un arco che chiude un ciclo renderebbe il piano impossibile (A dopo B dopo A).
 */
export function arcProblem(arcs: Arc[], from: string, to: string): string | null {
  if (from === to) return 'Un’attività non può precedere sé stessa.'
  if (arcs.some((a) => a.from === from && a.to === to)) return 'Questa precedenza esiste già.'
  if (reaches(arcs, to, from)) return 'Questa precedenza creerebbe un ciclo.'
  return null
}

/** Un ciclo presente nel grafo (lista di nodi), oppure null. Usato dal controllo al salvataggio. */
export function findCycle(nodes: string[], arcs: Arc[]): string[] | null {
  const next = successors(arcs)
  const state = new Map<string, 'visiting' | 'done'>()
  const path: string[] = []

  const visit = (node: string): string[] | null => {
    if (state.get(node) === 'done') return null
    if (state.get(node) === 'visiting') return [...path.slice(path.indexOf(node)), node]
    state.set(node, 'visiting')
    path.push(node)
    for (const n of next.get(node) ?? []) {
      const cycle = visit(n)
      if (cycle) return cycle
    }
    path.pop()
    state.set(node, 'done')
    return null
  }

  for (const n of nodes) {
    const cycle = visit(n)
    if (cycle) return cycle
  }
  return null
}

/**
 * Livello di ogni nodo per disegnare il grafo da sinistra a destra:
 * un'attività sta una colonna dopo la sua predecessora più "lontana".
 * Si assume il grafo senza cicli.
 */
export function layers(nodes: string[], arcs: Arc[]): Map<string, number> {
  const level = new Map(nodes.map((n) => [n, 0]))
  // Al massimo nodes.length passate (Bellman-Ford sul cammino più lungo)
  for (let i = 0; i < nodes.length; i++) {
    let changed = false
    for (const a of arcs) {
      const candidate = (level.get(a.from) ?? 0) + 1
      if (candidate > (level.get(a.to) ?? 0)) {
        level.set(a.to, candidate)
        changed = true
      }
    }
    if (!changed) break
  }
  return level
}
