"""Regole di dispatching di riferimento: EDD e ATC.

Sono le baseline che il modello deve battere (contratto C: una versione diventa
ACTIVE solo se non è peggiore di ATC/EDD) e l'ultimo anello del fallback.
Entrambe scelgono tra i candidati proposti dal Dispatcher; a parità di priorità
vince il candidato che finisce prima, poi l'ordine dell'istanza.
"""

from __future__ import annotations

import math

from .dispatcher import Candidate, Dispatcher, Rule, run
from .plan import PlanResult
from .schema import Instance


def edd(disp: Dispatcher, cands: list[Candidate]) -> Candidate:
    """Earliest Due Date: prima il job con la due date più vicina.

    Senza due date (benchmark classici) diventa "prima chi finisce prima".
    """
    def key(c: Candidate):
        due = disp.job(c.job_id).due_min
        return (math.inf if due is None else due, c.end_min,
                disp.order(c.activity_id), c.mode_index)
    return min(cands, key=key)


def atc_index(disp: Dispatcher, c: Candidate, k: float, p_mean: float) -> float:
    """Indice ATC: (w / p) * exp(-slack / (k * p_medio)).

    slack = due - (fine del candidato + lavoro minimo che resta nel job),
    troncato a 0. Senza due date lo slack vale 0 e la regola diventa WSPT
    (peso / durata).
    """
    job = disp.job(c.job_id)
    p = max(c.duration_min, 1)
    if job.due_min is None:
        slack = 0.0
    else:
        slack = max(job.due_min - c.end_min - disp.work_after(c.activity_id), 0)
    return job.weight / p * math.exp(-slack / (k * p_mean))


def _earliest_completion(cands: list[Candidate]) -> dict[str, Candidate]:
    """Per ogni attività, il candidato (modo) che finisce prima."""
    best: dict[str, Candidate] = {}
    for c in cands:
        cur = best.get(c.activity_id)
        if cur is None or (c.end_min, c.mode_index) < (cur.end_min, cur.mode_index):
            best[c.activity_id] = c
    return best


def make_atc(k: float = 2.0) -> Rule:
    """Apparent Tardiness Cost. ``k`` regola quanto conta l'urgenza: valori
    bassi favoriscono i job vicini alla scadenza, valori alti la durata breve.

    La regola sceglie l'attività; il modo è quello che finisce prima. L'indice
    si calcola sul modo che finisce prima di ogni attività: confrontare tutti i
    modi tra loro premierebbe quelli che finiscono più tardi (margine nullo,
    quindi indice di urgenza massimo).
    """
    if k <= 0:
        raise ValueError("k deve essere positivo")

    def atc(disp: Dispatcher, cands: list[Candidate]) -> Candidate:
        p_mean = disp.mean_remaining_duration()
        best = _earliest_completion(cands).values()
        return min(best, key=lambda c: (-atc_index(disp, c, k, p_mean), c.end_min,
                                        disp.order(c.activity_id), c.mode_index))
    return atc


atc = make_atc()


def solve_edd(inst: Instance) -> PlanResult:
    return run(inst, edd, "EDD")


def solve_atc(inst: Instance, k: float = 2.0) -> PlanResult:
    return run(inst, make_atc(k), "ATC")


RULES = {"EDD": solve_edd, "ATC": solve_atc}
