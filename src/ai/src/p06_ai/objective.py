"""Obiettivo composto: un solo numero per confrontare piani di solutori diversi.

``cost = somma_k  w_k * KPI_k / scala_k``  con k in makespan, ritardo pesato, setup.

I pesi ``w_k`` sono gli ``objective_weights`` dell'istanza (i benchmark non li
hanno: obiettivo implicito = solo makespan). Le scale rendono i tre termini
confrontabili, perché il makespan è in minuti mentre il ritardo pesato è una
somma su tutti i job. Dipendono solo dall'istanza, non da un piano, così lo
stesso piano ha sempre lo stesso costo:

- makespan: lower bound del makespan (cammino critico o carico per risorsa);
- ritardo pesato: somma dei pesi dei job con due date * durata media;
- setup: numero di attività * setup medio.

Un costo vicino a 1 significa "ogni termine pesa circa quanto la sua scala".
Lo usano il teacher CP-SAT (come funzione da minimizzare) e la valutazione.
"""

from __future__ import annotations

from collections import defaultdict
from statistics import mean

from .plan import Assignment, Kpis
from .schema import Instance

KPI_OF = {"makespan": "makespan_min", "weighted_tardiness": "weighted_tardiness",
          "setup": "total_setup_min"}


def weights(inst: Instance) -> dict[str, float]:
    """Pesi degli obiettivi, con le chiavi di ``KPI_OF`` (default: solo makespan)."""
    if not inst.objective_weights:
        return {"makespan": 1.0, "weighted_tardiness": 0.0, "setup": 0.0}
    return {k: float(inst.objective_weights.get(k, 0.0)) for k in KPI_OF}


def _min_durations(inst: Instance) -> dict[str, int]:
    return {a.id: min((m.duration_min for m in a.modes if m.duration_min is not None),
                      default=0) for a in inst.activities}


def makespan_lower_bound(inst: Instance) -> int:
    """Max tra cammino critico (con rilasci) e carico minimo per risorsa.

    Il carico conta solo le attività che, in ogni modo, usano quella risorsa.
    """
    dur = _min_durations(inst)
    release = {j.id: j.release_min for j in inst.jobs}
    preds: dict[str, list[tuple[str, int]]] = defaultdict(list)
    succs: dict[str, list[str]] = defaultdict(list)
    for p in inst.precedences:
        preds[p.to].append((p.from_, p.min_lag_min))
        succs[p.from_].append(p.to)
    indeg = {a.id: len(preds[a.id]) for a in inst.activities}
    job_of = {a.id: a.job_id for a in inst.activities}
    stack = [aid for aid, n in indeg.items() if n == 0]
    end: dict[str, int] = {}
    while stack:
        aid = stack.pop()
        start = max([release[job_of[aid]]] +
                    [end[p] + lag for p, lag in preds[aid] if p in end])
        end[aid] = start + dur[aid]
        for s in succs[aid]:
            indeg[s] -= 1
            if indeg[s] == 0:
                stack.append(s)
    critical = max(end.values(), default=0)

    cap = {r.id: r.capacity for r in inst.resources}
    load: dict[str, int] = defaultdict(int)
    for a in inst.activities:
        if not a.modes:
            continue
        always = set.intersection(*(set(m.resource_ids) for m in a.modes))
        for rid in always:
            load[rid] += dur[a.id]
    by_resource = max((load[r] / cap[r] for r in load), default=0)
    return max(critical, int(by_resource), 1)


def scales(inst: Instance) -> dict[str, float]:
    dur = [d for d in _min_durations(inst).values() if d > 0]
    p_mean = mean(dur) if dur else 1.0
    due_weight = sum(j.weight for j in inst.jobs if j.due_min is not None)
    setup = mean(s.duration_min for s in inst.setup_times) if inst.setup_times else 0.0
    return {
        "makespan": float(makespan_lower_bound(inst)),
        "weighted_tardiness": max(due_weight * p_mean, 1.0),
        "setup": max(len(inst.activities) * setup, 1.0),
    }


def cost(inst: Instance, kpis: Kpis, scale: dict[str, float] | None = None) -> float:
    """Costo composto di un piano (più basso = migliore)."""
    scale = scale or scales(inst)
    w = weights(inst)
    return round(sum(w[k] * getattr(kpis, KPI_OF[k]) / scale[k] for k in KPI_OF if w[k]), 6)


def sequence_setup_min(inst: Instance, assignments: list[Assignment]) -> int:
    """Setup totali di un piano, ricavati dall'ordine sulle risorse a capacità 1.

    Serve ai solutori che non costruiscono il piano col Dispatcher (CP-SAT).
    Le risorse con capacità > 1 non sono contate (non si sa quale unità lavora).
    """
    if not inst.setup_times:
        return 0
    setup = {(s.resource_id, s.from_activity, s.to_activity): s.duration_min
             for s in inst.setup_times}
    single = {r.id for r in inst.resources if r.capacity == 1}
    on: dict[str, list[Assignment]] = defaultdict(list)
    for asg in assignments:
        for rid in asg.resource_ids:
            if rid in single:
                on[rid].append(asg)
    total = 0
    for rid, items in on.items():
        items.sort(key=lambda a: a.start_min)
        for prev, nxt in zip(items, items[1:]):
            total += setup.get((rid, prev.activity_id, nxt.activity_id), 0)
    return total
