"""Verifica di ammissibilità di un piano, indipendente da chi l'ha prodotto.

Il contratto B.2 garantisce che un piano con status OK o FALLBACK sia sempre
ammissibile: questo modulo lo controlla. È scritto senza riusare la logica del
Dispatcher, così un errore nel Dispatcher non si nasconde anche qui.

Limite noto: i setup vengono controllati solo sulle risorse con capacità 1
(con capacità > 1 il piano non dice quale unità ha svolto l'attività).
"""

from __future__ import annotations

from collections import defaultdict

from .plan import Assignment
from .schema import Instance


def check_plan(inst: Instance, assignments: list[Assignment]) -> list[str]:
    """Restituisce le violazioni trovate; lista vuota = piano ammissibile."""
    errors: list[str] = []
    acts = {a.id: a for a in inst.activities}
    jobs = {j.id: j for j in inst.jobs}
    resources = {r.id: r for r in inst.resources}

    plan: dict[str, Assignment] = {}
    for asg in assignments:
        if asg.activity_id not in acts:
            errors.append(f"{asg.activity_id}: attività inesistente")
        elif asg.activity_id in plan:
            errors.append(f"{asg.activity_id}: assegnata più volte")
        else:
            plan[asg.activity_id] = asg
    missing = [aid for aid in acts if aid not in plan]
    if missing:
        errors.append(f"{len(missing)} attività non assegnate: {', '.join(missing[:5])}")

    for aid, asg in plan.items():
        act = acts[aid]
        if asg.end_min < asg.start_min:
            errors.append(f"{aid}: fine prima dell'inizio")
        if not 0 <= asg.mode_index < len(act.modes):
            errors.append(f"{aid}: modo {asg.mode_index} inesistente")
            continue
        mode = act.modes[asg.mode_index]
        if sorted(asg.resource_ids) != sorted(mode.resource_ids):
            errors.append(f"{aid}: risorse {asg.resource_ids} diverse da quelle del modo")
        if mode.duration_min is None:
            errors.append(f"{aid}: durata del modo non nota")
        elif asg.end_min - asg.start_min != mode.duration_min:
            errors.append(f"{aid}: durata {asg.end_min - asg.start_min}, "
                          f"attesa {mode.duration_min}")
        owned = set().union(*(resources[r].skills for r in mode.resource_ids
                              if r in resources))
        if not set(act.required_skills) <= owned:
            errors.append(f"{aid}: competenze richieste non coperte")
        job = jobs.get(act.job_id)
        if job is not None and asg.start_min < job.release_min:
            errors.append(f"{aid}: inizia a {asg.start_min}, prima del rilascio "
                          f"{job.release_min}")
        for rid in mode.resource_ids:
            windows = resources[rid].availability if rid in resources else None
            if windows is not None and not any(s <= asg.start_min and asg.end_min <= e
                                               for s, e in windows):
                errors.append(f"{aid}: fuori dalle finestre di disponibilità di {rid}")

    for p in inst.precedences:
        a, b = plan.get(p.from_), plan.get(p.to)
        if a is None or b is None:
            continue
        gap = b.start_min - a.end_min
        if gap < p.min_lag_min:
            errors.append(f"precedenza {p.from_} -> {p.to}: distanza {gap} < "
                          f"{p.min_lag_min}")
        if p.max_lag_min is not None and gap > p.max_lag_min:
            errors.append(f"precedenza {p.from_} -> {p.to}: distanza {gap} > "
                          f"{p.max_lag_min}")

    setup = {(s.resource_id, s.from_activity, s.to_activity): s.duration_min
             for s in inst.setup_times}
    on_resource: dict[str, list[Assignment]] = defaultdict(list)
    for asg in plan.values():
        for rid in asg.resource_ids:
            on_resource[rid].append(asg)
    for rid, items in on_resource.items():
        if rid not in resources:
            errors.append(f"{rid}: risorsa inesistente")
            continue
        capacity = resources[rid].capacity
        if capacity == 1:
            items.sort(key=lambda x: (x.start_min, x.end_min))
            for x, y in zip(items, items[1:]):
                ready = x.end_min + setup.get((rid, x.activity_id, y.activity_id), 0)
                if y.start_min < ready:
                    errors.append(f"{rid}: {y.activity_id} inizia a {y.start_min}, "
                                  f"risorsa occupata fino a {ready} "
                                  f"(dopo {x.activity_id}, setup incluso)")
        else:
            # A parità di istante le fine vengono prima degli inizi.
            events = sorted([(x.start_min, 1) for x in items] +
                            [(x.end_min, -1) for x in items])
            in_use = 0
            for time, delta in events:
                in_use += delta
                if in_use > capacity:
                    errors.append(f"{rid}: {in_use} attività contemporanee a {time}, "
                                  f"capacità {capacity}")
                    break
    return errors
