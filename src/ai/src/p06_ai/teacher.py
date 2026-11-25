"""CP-SAT Teacher: risolve le istanze con CP-SAT (OR-Tools) per produrre le etichette.

È l'"insegnante" dell'imitation learning: trova piani ottimi o quasi ottimi, il
Dataset Builder (``dataset.py``) ne ricava le scelte passo per passo e la policy
M2 impara a imitarle. Si usa solo offline: su istanze grandi è troppo lento per
rispondere online.

Modello (stessi vincoli del Dispatcher, più ``max_lag_min``):

- un intervallo opzionale per ogni modo eseguibile, esattamente uno scelto;
- rilasci; precedenze FS con ritardo minimo e massimo;
- risorse a capacità 1: NoOverlap; capacità > 1: Cumulative;
- finestre di disponibilità: i buchi tra le finestre sono intervalli fissi che
  occupano tutta la risorsa, quindi ogni attività sta intera in una finestra;
- setup dipendenti dalla sequenza (solo capacità 1): vincolo Circuit sull'ordine
  delle attività di ogni risorsa, il setup separa due attività consecutive.

Funzione obiettivo: il costo composto di ``objective.py`` (makespan, ritardo
pesato, setup, pesati con gli ``objective_weights``), con coefficienti interi.

Il miglior piano tra EDD e ATC viene passato come soluzione di partenza (hint):
CP-SAT parte da lì, quindi non restituisce mai un piano peggiore delle regole.
Alla fine il piano viene compattato a sinistra (vedi ``_compact``).

Uso da riga di comando:
    python -m p06_ai.teacher <file o cartella di istanze> --out <cartella>
        [--time-limit 10] [--workers 8] [--seed 0] [--overwrite]
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path
from statistics import mean
from time import perf_counter
from typing import Literal

import ortools
from ortools.sat.python import cp_model
from pydantic import BaseModel, ConfigDict

from . import objective
from .checker import check_plan
from .dispatcher import _fit_one
from .plan import Assignment, PlanResult, compute_kpis
from .rules import make_atc, edd
from .dispatcher import run
from .schema import Instance
from .validation import validate_instance

# Coefficiente che trasforma il costo (float) in interi per CP-SAT:
# 1 unità di costo = SCALE unità dell'obiettivo intero.
SCALE = 100_000

Status = Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN", "MODEL_INVALID"]


class TeacherSolution(BaseModel):
    """Soluzione del teacher salvata su disco (un file JSON per istanza)."""
    model_config = ConfigDict(extra="forbid")

    dataset: str
    instance: str
    domain_profile: str | None = None
    solver_status: Status
    cost: float | None = None
    # Limite inferiore dimostrato da CP-SAT, nelle stesse unità del costo.
    lower_bound: float | None = None
    gap: float | None = None
    hint_solver: str | None = None
    hint_cost: float | None = None
    time_limit_s: float
    workers: int
    seed: int
    wall_s: float
    ortools_version: str = ortools.__version__
    plan: PlanResult


def best_rule_plan(inst: Instance) -> tuple[str, PlanResult] | None:
    """Il miglior piano (costo composto) tra EDD, ATC k=1 e ATC k=2."""
    best = None
    scale = objective.scales(inst)
    for name, rule in (("EDD", edd), ("ATC", make_atc(1.0)), ("ATC", make_atc(2.0))):
        res = run(inst, rule, name)
        if res.status != "OK":
            continue
        c = objective.cost(inst, res.kpis, scale)
        if best is None or c < best[0]:
            best = (c, name, res)
    return None if best is None else (best[1], best[2])


def solve(inst: Instance, time_limit_s: float = 10.0, workers: int = 8,
          seed: int = 0, use_hint: bool = True) -> TeacherSolution:
    t0 = perf_counter()
    meta = dict(dataset=inst.source.dataset, instance=inst.source.instance,
                domain_profile=inst.domain_profile, time_limit_s=time_limit_s,
                workers=workers, seed=seed)

    def finish(status: Status, plan: PlanResult, **extra) -> TeacherSolution:
        return TeacherSolution(solver_status=status, plan=plan,
                               wall_s=round(perf_counter() - t0, 3), **meta, **extra)

    issues = validate_instance(inst)
    if issues:
        return finish("MODEL_INVALID", PlanResult(
            status="INFEASIBLE", solver="CP_SAT",
            warnings=[f"{i.code}: {i.message}" for i in issues[:10]]))

    scale = objective.scales(inst)
    hint = best_rule_plan(inst) if use_hint else None
    hint_extra = {}
    if hint is not None:
        hint_extra = dict(hint_solver=hint[0],
                          hint_cost=objective.cost(inst, hint[1].kpis, scale))

    built = _build(inst, scale, hint[1] if hint else None)
    if isinstance(built, str):
        return finish("INFEASIBLE", PlanResult(status="INFEASIBLE", solver="CP_SAT",
                                               warnings=[built]), **hint_extra)
    model, var = built

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.num_workers = workers
    solver.parameters.random_seed = seed
    code = solver.solve(model)
    status: Status = solver.status_name(code)
    if code not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        reason = ("CP-SAT: nessun piano ammissibile" if code == cp_model.INFEASIBLE
                  else f"CP-SAT: nessuna soluzione entro {time_limit_s}s")
        return finish(status, PlanResult(status="INFEASIBLE", solver="CP_SAT",
                                         warnings=[reason]), **hint_extra)

    assignments = _extract(inst, solver, var)
    assignments = _compact(inst, assignments)
    violations = check_plan(inst, assignments)
    if violations:  # non dovrebbe succedere: segnala un errore nel modello
        return finish("MODEL_INVALID", PlanResult(status="INFEASIBLE", solver="CP_SAT",
                                                  warnings=violations[:10]), **hint_extra)

    kpis = compute_kpis(inst, assignments, objective.sequence_setup_min(inst, assignments))
    obj, bound = solver.objective_value, solver.best_objective_bound
    elapsed = round((perf_counter() - t0) * 1000)
    plan = PlanResult(status="OK", solver="CP_SAT", assignments=assignments, kpis=kpis,
                      timing_ms={"cp_sat": round(solver.wall_time * 1000), "total": elapsed})
    return finish(status, plan, cost=objective.cost(inst, kpis, scale),
                  lower_bound=round(bound / SCALE, 6),
                  gap=round((obj - bound) / obj, 6) if obj > 0 else 0.0, **hint_extra)


# ---------------------------------------------------------------- modello

def _usable_modes(inst: Instance) -> dict[str, list[int]]:
    skills = {r.id: set(r.skills) for r in inst.resources}
    out = {}
    for a in inst.activities:
        out[a.id] = [i for i, m in enumerate(a.modes)
                     if m.duration_min is not None and
                     set(a.required_skills) <= set().union(*(skills[r] for r in m.resource_ids))]
    return out


def _horizon(inst: Instance, modes: dict[str, list[int]], hint: PlanResult | None) -> int:
    """Orizzonte sicuro: tutte le attività in fila, ognuna col modo più lungo e il
    setup più lungo, dopo l'ultimo rilascio (più la fine dell'ultima finestra)."""
    acts = {a.id: a for a in inst.activities}
    max_setup: dict[str, int] = defaultdict(int)
    for s in inst.setup_times:
        max_setup[s.to_activity] = max(max_setup[s.to_activity], s.duration_min)
    h = max((j.release_min for j in inst.jobs), default=0)
    h += sum(max(acts[aid].modes[i].duration_min for i in idx) + max_setup[aid]
             for aid, idx in modes.items())
    h += sum(max(p.min_lag_min, 0) for p in inst.precedences)
    h += max((w[1] for r in inst.resources if r.availability for w in r.availability),
             default=0)
    if hint is not None and hint.kpis is not None:
        h = max(h, hint.kpis.makespan_min)
    return max(h, 1)


def _build(inst: Instance, scale: dict[str, float], hint: PlanResult | None):
    modes = _usable_modes(inst)
    missing = [aid for aid, idx in modes.items() if not idx]
    if missing:
        return "Nessun modo eseguibile (durata o competenze) per: " + ", ".join(missing[:5])
    horizon = _horizon(inst, modes, hint)
    m = cp_model.CpModel()
    jobs = {j.id: j for j in inst.jobs}

    start, end, lits = {}, {}, {}
    on_resource: dict[str, list] = defaultdict(list)   # rid -> [(aid, lit, interval)]
    for a in inst.activities:
        rel = jobs[a.job_id].release_min
        start[a.id] = m.new_int_var(rel, horizon, f"s_{a.id}")
        end[a.id] = m.new_int_var(rel, horizon, f"e_{a.id}")
        for i in modes[a.id]:
            mode = a.modes[i]
            lit = m.new_bool_var(f"x_{a.id}_{i}")
            iv = m.new_optional_interval_var(start[a.id], mode.duration_min, end[a.id],
                                             lit, f"i_{a.id}_{i}")
            lits[a.id, i] = lit
            for rid in mode.resource_ids:
                on_resource[rid].append((a.id, lit, iv))
        m.add_exactly_one(lits[a.id, i] for i in modes[a.id])

    for p in inst.precedences:
        m.add(start[p.to] >= end[p.from_] + p.min_lag_min)
        if p.max_lag_min is not None:
            m.add(start[p.to] <= end[p.from_] + p.max_lag_min)

    setup = {(s.resource_id, s.from_activity, s.to_activity): s.duration_min
             for s in inst.setup_times}
    setup_resources = {s.resource_id for s in inst.setup_times}
    setup_terms = []
    for r in inst.resources:
        tasks = on_resource.get(r.id, [])
        gaps = _gaps(m, r.availability, horizon, r.id)
        if r.capacity == 1:
            m.add_no_overlap([iv for _, _, iv in tasks] + gaps)
            if r.id in setup_resources and len(tasks) > 1:
                setup_terms += _circuit(m, r.id, tasks, start, end, setup)
        else:
            m.add_cumulative([iv for _, _, iv in tasks] + gaps,
                             [1] * len(tasks) + [r.capacity] * len(gaps), r.capacity)

    w = objective.weights(inst)
    terms = []

    def coef(key: str, factor: float = 1.0) -> int:
        c = round(SCALE * w[key] * factor / scale[key])
        return max(c, 1) if w[key] > 0 else 0

    if w["makespan"] > 0:
        mk = m.new_int_var(0, horizon, "makespan")
        m.add_max_equality(mk, list(end.values()))
        terms.append(coef("makespan") * mk)
    if w["weighted_tardiness"] > 0:
        by_job: dict[str, list] = defaultdict(list)
        for a in inst.activities:
            by_job[a.job_id].append(end[a.id])
        for job in inst.jobs:
            if job.due_min is None or job.weight == 0 or not by_job[job.id]:
                continue
            done = m.new_int_var(0, horizon, f"c_{job.id}")
            m.add_max_equality(done, by_job[job.id])
            late = m.new_int_var(0, horizon, f"t_{job.id}")
            m.add(late >= done - job.due_min)
            terms.append(coef("weighted_tardiness", job.weight) * late)
    if w["setup"] > 0 and setup_terms:
        terms.append(coef("setup") * sum(d * lit for d, lit in setup_terms))
    if terms:
        m.minimize(sum(terms))

    if hint is not None:
        for asg in hint.assignments:
            m.add_hint(start[asg.activity_id], asg.start_min)
            m.add_hint(end[asg.activity_id], asg.end_min)
            for i in modes[asg.activity_id]:
                m.add_hint(lits[asg.activity_id, i], i == asg.mode_index)
    return m, {"start": start, "lits": lits, "modes": modes}


def _gaps(m: cp_model.CpModel, windows, horizon: int, rid: str) -> list:
    """Intervalli fissi in cui la risorsa non è disponibile."""
    if windows is None:
        return []
    out, t = [], 0
    for s, e in sorted(windows):
        if s > t:
            out.append(m.new_fixed_size_interval_var(t, s - t, f"gap_{rid}_{t}"))
        t = max(t, e)
    if t < horizon:
        out.append(m.new_fixed_size_interval_var(t, horizon - t, f"gap_{rid}_{t}"))
    return out


def _circuit(m: cp_model.CpModel, rid: str, tasks, start, end, setup) -> list:
    """Ordine delle attività sulla risorsa: nodo 0 fittizio, poi un nodo per
    (attività, modo). L'arco i -> j vuol dire "j subito dopo i": allora j inizia
    dopo la fine di i più il setup. Restituisce le coppie (setup, arco)."""
    arcs, terms = [], []
    for i, (aid, lit, _) in enumerate(tasks, start=1):
        arcs.append((0, i, m.new_bool_var(f"first_{rid}_{i}")))
        arcs.append((i, 0, m.new_bool_var(f"last_{rid}_{i}")))
        arcs.append((i, i, ~lit))
        for j, (bid, _, _) in enumerate(tasks, start=1):
            if i == j or aid == bid:
                continue
            arc = m.new_bool_var(f"arc_{rid}_{i}_{j}")
            d = setup.get((rid, aid, bid), 0)
            m.add(start[bid] >= end[aid] + d).only_enforce_if(arc)
            arcs.append((i, j, arc))
            if d:
                terms.append((d, arc))
    arcs.append((0, 0, m.new_bool_var(f"empty_{rid}")))
    m.add_circuit(arcs)
    return terms


def _extract(inst: Instance, solver: cp_model.CpSolver, var) -> list[Assignment]:
    out = []
    for a in inst.activities:
        idx = next(i for i in var["modes"][a.id] if solver.boolean_value(var["lits"][a.id, i]))
        mode = a.modes[idx]
        s = solver.value(var["start"][a.id])
        out.append(Assignment(activity_id=a.id, mode_index=idx,
                              resource_ids=list(mode.resource_ids),
                              start_min=s, end_min=s + mode.duration_min))
    return out


def _compact(inst: Instance, assignments: list[Assignment]) -> list[Assignment]:
    """Sposta ogni attività il più presto possibile senza cambiare l'ordine sulle
    risorse né i modi.

    Se l'obiettivo non contiene il makespan, CP-SAT può lasciare attività in
    ritardo senza motivo; il piano compattato ha costo uguale o minore e mostra
    al Dataset Builder un ordine di scelta più pulito. Solo con risorse a
    capacità 1; se il risultato viola un vincolo (es. ritardo massimo) si tiene
    il piano originale.
    """
    if any(r.capacity > 1 for r in inst.resources):
        return assignments
    release = {a.id: next(j.release_min for j in inst.jobs if j.id == a.job_id)
               for a in inst.activities}
    windows = {r.id: sorted(r.availability) if r.availability is not None else None
               for r in inst.resources}
    setup = {(s.resource_id, s.from_activity, s.to_activity): s.duration_min
             for s in inst.setup_times}
    preds: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for p in inst.precedences:
        preds[p.to].append((p.from_, p.min_lag_min))

    old = {a.activity_id: a for a in assignments}
    new: dict[str, Assignment] = {}
    last: dict[str, tuple[int, str]] = {}  # rid -> (fine, attività)
    for asg in sorted(assignments, key=lambda a: (a.start_min, a.end_min)):
        t = release[asg.activity_id]
        for p, lag in preds[asg.activity_id]:
            t = max(t, (new.get(p) or old[p]).end_min + lag)
        for rid in asg.resource_ids:
            if rid in last:
                free, prev = last[rid]
                t = max(t, free + setup.get((rid, prev, asg.activity_id), 0))
        dur = asg.end_min - asg.start_min
        while True:  # prima posizione che sta nelle finestre di tutte le risorse
            moved = t
            for rid in asg.resource_ids:
                fit = _fit_one(windows[rid], moved, dur)
                moved = max(moved, fit if fit is not None else asg.start_min)
            if moved == t:
                break
            t = moved
        t = min(t, asg.start_min)
        new[asg.activity_id] = asg.model_copy(update={"start_min": t, "end_min": t + dur})
        for rid in asg.resource_ids:
            last[rid] = (t + dur, asg.activity_id)
    result = [new[a.activity_id] for a in assignments]
    return result if not check_plan(inst, result) else assignments


# -------------------------------------------------------------------- CLI

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Risolve istanze con CP-SAT (teacher)")
    ap.add_argument("input", type=Path, help="file JSON o cartella (ricorsiva)")
    ap.add_argument("--out", type=Path, required=True, help="cartella delle soluzioni")
    ap.add_argument("--time-limit", type=float, default=10.0, help="secondi per istanza")
    ap.add_argument("--workers", type=int, default=8, help="thread di CP-SAT")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--overwrite", action="store_true",
                    help="risolve anche le istanze che hanno già una soluzione")
    args = ap.parse_args(argv)

    if args.input.is_file():
        pairs = [(args.input, args.out / args.input.name)]
    else:
        pairs = [(p, args.out / p.relative_to(args.input))
                 for p in sorted(args.input.rglob("*.json"))]
    if not pairs:
        print(f"Nessun file .json in {args.input}", file=sys.stderr)
        return 1

    done: list[TeacherSolution] = []
    for i, (src, dst) in enumerate(pairs, start=1):
        if dst.exists() and not args.overwrite:
            done.append(TeacherSolution.model_validate_json(dst.read_text(encoding="utf-8")))
            continue
        inst = Instance.model_validate_json(src.read_text(encoding="utf-8"))
        sol = solve(inst, args.time_limit, args.workers, args.seed)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(sol.model_dump_json(indent=2), encoding="utf-8")
        done.append(sol)
        print(f"[{i}/{len(pairs)}] {sol.dataset}/{sol.instance}: {sol.solver_status} "
              f"costo {_fmt(sol.cost)} (regole {_fmt(sol.hint_cost)}) "
              f"gap {_fmt(sol.gap, '.1%')} {sol.wall_s:.1f}s", flush=True)
    print("\n".join(summarize(done)))
    return 0


def _fmt(x, spec: str = ".4f") -> str:
    return "-" if x is None else format(x, spec)


def summarize(sols: list[TeacherSolution]) -> list[str]:
    groups: dict[str, list[TeacherSolution]] = defaultdict(list)
    for s in sols:
        groups[s.dataset].append(s)
    lines = [f"{'dataset':<24}{'istanze':>8}{'ottime':>8}{'senza piano':>12}"
             f"{'gap medio':>11}{'vs regole':>11}{'s medi':>8}"]
    for name, items in sorted(groups.items()):
        ok = [s for s in items if s.cost is not None]
        gaps = [s.gap for s in ok if s.gap is not None]
        gains = [(s.hint_cost - s.cost) / s.hint_cost for s in ok if s.hint_cost]
        lines.append(
            f"{name:<24}{len(items):>8}{sum(s.solver_status == 'OPTIMAL' for s in items):>8}"
            f"{len(items) - len(ok):>12}{_fmt(mean(gaps) if gaps else None, '.1%'):>11}"
            f"{_fmt(-mean(gains) if gains else None, '+.1%'):>11}"
            f"{mean(s.wall_s for s in items):>8.1f}")
    return lines


if __name__ == "__main__":
    raise SystemExit(main())
