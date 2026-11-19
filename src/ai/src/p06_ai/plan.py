"""Risultato di una schedulazione: ``PlanResult`` (contratto B.2) e calcolo dei KPI.

Tutti i solutori (regole EDD/ATC, policy M2, CP-SAT) restituiscono questo formato.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .schema import Instance


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Assignment(_Model):
    activity_id: str
    mode_index: int = Field(ge=0)
    resource_ids: list[str]
    start_min: int = Field(ge=0)
    end_min: int = Field(ge=0)


class Kpis(_Model):
    makespan_min: int
    weighted_tardiness: float
    late_jobs: int
    total_setup_min: int
    avg_utilization: float


class PlanResult(_Model):
    request_id: str | None = None
    status: Literal["OK", "FALLBACK", "INFEASIBLE"]
    solver: Literal["POLICY", "CP_SAT", "ATC", "EDD"]
    fallback_reason: Literal["ERROR", "LOW_CONFIDENCE", "TIMEOUT"] | None = None
    model_versions: dict[str, str] = {}
    confidence: float | None = None
    assignments: list[Assignment] = []
    context_adjustments: list[dict[str, Any]] = []
    kpis: Kpis | None = None
    warnings: list[str] = []
    timing_ms: dict[str, int] = {}


def compute_kpis(inst: Instance, assignments: list[Assignment],
                 total_setup_min: int) -> Kpis:
    """KPI di un piano completo. I tempi partono da 0 (inizio dell'orizzonte).

    - ``weighted_tardiness`` e ``late_jobs`` contano solo i job con ``due_min``.
    - ``avg_utilization``: media sulle risorse di tempo di lavorazione /
      (capacità * makespan). I setup non contano come lavorazione.
    """
    job_of = {a.id: a.job_id for a in inst.activities}
    job_end: dict[str, int] = {}
    busy: dict[str, int] = defaultdict(int)
    for asg in assignments:
        job = job_of[asg.activity_id]
        job_end[job] = max(job_end.get(job, 0), asg.end_min)
        for rid in asg.resource_ids:
            busy[rid] += asg.end_min - asg.start_min

    makespan = max((a.end_min for a in assignments), default=0)
    weighted, late = 0.0, 0
    for job in inst.jobs:
        if job.due_min is None or job.id not in job_end:
            continue
        tardiness = max(0, job_end[job.id] - job.due_min)
        weighted += job.weight * tardiness
        late += tardiness > 0

    if makespan > 0 and inst.resources:
        util = sum(busy[r.id] / (r.capacity * makespan) for r in inst.resources) \
            / len(inst.resources)
    else:
        util = 0.0
    return Kpis(makespan_min=makespan, weighted_tardiness=round(weighted, 4),
                late_jobs=late, total_setup_min=total_setup_min,
                avg_utilization=round(util, 4))
