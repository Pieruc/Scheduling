"""Controlli di consistenza di un'istanza.

I codici di errore sono quelli della tabella in CONTRATTI_API.md (sezione B.1),
così lo stesso validatore può servire l'endpoint ``/validate``. ``DUPLICATE_ID``
non è nel contratto v1: è aggiunto qui perché gli altri controlli lo presuppongono.
"""

from __future__ import annotations

from collections import Counter, defaultdict, deque
from dataclasses import dataclass

from .schema import Instance


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    path: str
    message: str


def validate_instance(inst: Instance) -> list[ValidationIssue]:
    """Restituisce tutti i problemi trovati; lista vuota = istanza consistente."""
    issues: list[ValidationIssue] = []

    def add(code: str, path: str, message: str) -> None:
        issues.append(ValidationIssue(code, path, message))

    for section, ids in (
        ("resources", [r.id for r in inst.resources]),
        ("jobs", [j.id for j in inst.jobs]),
        ("activities", [a.id for a in inst.activities]),
    ):
        for dup, n in Counter(ids).items():
            if n > 1:
                add("DUPLICATE_ID", section, f"{dup} compare {n} volte")

    resources = {r.id: r for r in inst.resources}
    job_ids = {j.id for j in inst.jobs}
    activity_ids = {a.id for a in inst.activities}

    for i, r in enumerate(inst.resources):
        windows = r.availability or []
        for k, (start, end) in enumerate(windows):
            if start < 0 or end <= start:
                add("INVALID_WINDOW", f"resources[{i}].availability[{k}]",
                    f"Finestra [{start}, {end}) non valida")
        ordered = sorted(windows)
        for (_, prev_end), (next_start, _) in zip(ordered, ordered[1:]):
            if next_start < prev_end:
                add("INVALID_WINDOW", f"resources[{i}].availability",
                    f"Finestre sovrapposte per {r.id}")
                break

    for i, j in enumerate(inst.jobs):
        if j.due_min is not None and j.due_min < j.release_min:
            add("INVALID_WINDOW", f"jobs[{i}]", f"{j.id}: due_min precede release_min")

    for i, a in enumerate(inst.activities):
        if a.job_id not in job_ids:
            add("UNKNOWN_JOB", f"activities[{i}].job_id", f"{a.job_id} non esiste")
        required = set(a.required_skills)
        feasible = False
        for m, mode in enumerate(a.modes):
            known = True
            skills: set[str] = set()
            for k, rid in enumerate(mode.resource_ids):
                if rid not in resources:
                    known = False
                    add("UNKNOWN_RESOURCE",
                        f"activities[{i}].modes[{m}].resource_ids[{k}]",
                        f"{rid} non esiste")
                else:
                    skills.update(resources[rid].skills)
            if known and required <= skills:
                feasible = True
        if not feasible:
            add("NO_FEASIBLE_MODE", f"activities[{i}].modes",
                f"{a.id}: nessun modo eseguibile con le competenze richieste")

    successors: dict[str, list[str]] = defaultdict(list)
    indegree = {aid: 0 for aid in activity_ids}
    for i, p in enumerate(inst.precedences):
        ok = True
        for field, aid in (("from", p.from_), ("to", p.to)):
            if aid not in activity_ids:
                ok = False
                add("UNKNOWN_ACTIVITY", f"precedences[{i}].{field}", f"{aid} non esiste")
        if p.max_lag_min is not None and p.max_lag_min < p.min_lag_min:
            add("INVALID_WINDOW", f"precedences[{i}]", "max_lag_min < min_lag_min")
        if ok:
            successors[p.from_].append(p.to)
            indegree[p.to] += 1

    # Kahn: se non si riesce a ordinare tutte le attività, c'è un ciclo.
    queue = deque(aid for aid, d in indegree.items() if d == 0)
    visited = 0
    while queue:
        aid = queue.popleft()
        visited += 1
        for nxt in successors[aid]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    if visited < len(indegree):
        stuck = sorted(aid for aid, d in indegree.items() if d > 0)
        add("CYCLIC_PRECEDENCE", "precedences",
            "Ciclo tra le attività: " + ", ".join(stuck[:5]))

    for i, s in enumerate(inst.setup_times):
        if s.resource_id not in resources:
            add("UNKNOWN_RESOURCE", f"setup_times[{i}].resource_id",
                f"{s.resource_id} non esiste")
        for field, aid in (("from_activity", s.from_activity),
                           ("to_activity", s.to_activity)):
            if aid not in activity_ids:
                add("UNKNOWN_ACTIVITY", f"setup_times[{i}].{field}", f"{aid} non esiste")

    return issues
