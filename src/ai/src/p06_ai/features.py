"""Feature dei candidati per la policy M2 (modello di ranking).

A ogni passo del Dispatcher, ogni candidato (attività, modo) diventa un vettore
di numeri. La stessa funzione serve al Dataset Builder (offline) e alla policy
(online), così training e inferenza vedono esattamente le stesse feature.

Tutti i tempi sono divisi per la durata media delle attività rimaste (``p``) e
misurati rispetto all'istante di decisione ``t`` (l'inizio più anticipato tra i
candidati). In questo modo le feature non dipendono dalla scala dell'istanza:
la stessa policy vale per istanze in minuti di fabbrica o in ore di PA.
"""

from __future__ import annotations

import math
from collections import defaultdict

from . import objective
from .dispatcher import Candidate, Dispatcher
from .rules import atc_index
from .schema import Instance

# Nome -> descrizione. L'ordine è quello delle colonne nel dataset.
FEATURES: dict[str, str] = {
    # candidato
    "duration": "durata del modo / p",
    "start_delay": "(inizio - t) / p: attesa prima di poter iniziare",
    "end_rel": "(fine - t) / p",
    "setup": "setup richiesto / p",
    "fastest_mode": "1 se è il modo che finisce prima per questa attività",
    "n_modes": "numero di modi eseguibili dell'attività",
    "work_after": "lavoro minimo che resta nel job dopo l'attività / p",
    "job_left": "quota di attività del job ancora da schedulare",
    "n_successors": "successori diretti dell'attività",
    "has_due": "1 se il job ha una due date",
    "slack": "(due - fine - lavoro restante) / p, tagliato in [-20, 20]; 0 senza due",
    "tardy_now": "ritardo minimo del job se si sceglie ora / p, tagliato a 20",
    "job_weight": "peso del job / peso medio dei job",
    "atc_rel": "indice ATC (k=2) / massimo indice ATC tra i candidati",
    "due_rank": "posizione della due date tra i candidati, in [0, 1] (0 = più vicina)",
    "end_rank": "posizione della fine tra i candidati, in [0, 1] (0 = finisce prima)",
    "resource_load": "lavoro rimasto che può andare solo sulle risorse del modo / p, max",
    # stato (uguali per tutti i candidati dello stesso passo)
    "w_makespan": "peso dell'obiettivo makespan",
    "w_tardiness": "peso dell'obiettivo ritardo pesato",
    "w_setup": "peso dell'obiettivo setup",
    "progress": "quota di attività già schedulate",
    "n_candidates": "log(1 + numero di candidati)",
    "time_rel": "t / lower bound del makespan",
}
FEATURE_NAMES = list(FEATURES)


class FeatureContext:
    """Dati dell'istanza calcolati una volta sola."""

    def __init__(self, inst: Instance):
        self.weights = objective.weights(inst)
        self.lb = objective.makespan_lower_bound(inst)
        self.mean_job_weight = max(sum(j.weight for j in inst.jobs) / len(inst.jobs), 1e-9) \
            if inst.jobs else 1.0
        self.activities = [a.id for a in inst.activities]


def _rank(values: list[float]) -> list[float]:
    """Rango normalizzato in [0, 1]; valori uguali hanno lo stesso rango."""
    distinct = sorted(set(values))
    if len(distinct) == 1:
        return [0.0] * len(values)
    pos = {v: i / (len(distinct) - 1) for i, v in enumerate(distinct)}
    return [pos[v] for v in values]


def _resource_load(disp: Dispatcher, ctx: FeatureContext) -> dict[str, float]:
    load: dict[str, float] = defaultdict(float)
    for aid in ctx.activities:
        if disp.is_scheduled(aid):
            continue
        modes = disp.usable_modes(aid)
        if not modes:
            continue
        always = set.intersection(*(set(m.resource_ids) for _, m in modes))
        dur = min(m.duration_min for _, m in modes)
        for rid in always:
            load[rid] += dur
    return load


def candidate_features(disp: Dispatcher, cands: list[Candidate],
                       ctx: FeatureContext) -> list[list[float]]:
    """Una riga di feature per candidato, nell'ordine di ``FEATURE_NAMES``."""
    if not cands:
        return []
    p = disp.mean_remaining_duration()
    t = min(c.start_min for c in cands)
    fastest: dict[str, int] = {}
    for c in cands:
        fastest[c.activity_id] = min(fastest.get(c.activity_id, c.end_min), c.end_min)
    atc = [atc_index(disp, c, 2.0, p) for c in cands]
    atc_max = max(atc) or 1.0
    dues = [disp.job(c.job_id).due_min for c in cands]
    due_rank = _rank([math.inf if d is None else d for d in dues])
    end_rank = _rank([c.end_min for c in cands])
    load = _resource_load(disp, ctx)
    total = len(ctx.activities)
    state = [ctx.weights["makespan"], ctx.weights["weighted_tardiness"],
             ctx.weights["setup"], disp.n_scheduled / total if total else 0.0,
             math.log1p(len(cands)), t / ctx.lb]

    rows = []
    for i, c in enumerate(cands):
        job = disp.job(c.job_id)
        left, size = disp.job_progress(c.job_id)
        after = disp.work_after(c.activity_id)
        if job.due_min is None:
            slack, tardy = 0.0, 0.0
        else:
            slack = max(-20.0, min(20.0, (job.due_min - c.end_min - after) / p))
            tardy = min(20.0, max(0, c.end_min + after - job.due_min) / p)
        rows.append([
            c.duration_min / p,
            (c.start_min - t) / p,
            (c.end_min - t) / p,
            c.setup_min / p,
            float(c.end_min == fastest[c.activity_id]),
            float(len(disp.usable_modes(c.activity_id))),
            after / p,
            left / size,
            float(len(disp.successors(c.activity_id))),
            float(job.due_min is not None),
            slack,
            tardy,
            job.weight / ctx.mean_job_weight,
            atc[i] / atc_max,
            due_rank[i],
            end_rank[i],
            max(load[r] for r in c.resource_ids) / p,
            *state,
        ])
    return rows
