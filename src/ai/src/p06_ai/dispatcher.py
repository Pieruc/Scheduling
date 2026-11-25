"""Dispatcher: il simulatore che costruisce il piano una decisione alla volta.

A ogni passo propone i candidati ammissibili, cioè le coppie (attività, modo)
le cui predecessori sono già schedulati, con il loro inizio più anticipato. Chi
decide (regola EDD/ATC, policy M2) sceglie un candidato e il Dispatcher lo
applica. Il piano è ammissibile per costruzione: si sceglie solo tra mosse lecite.

Vincoli gestiti: rilasci, precedenze FS con ritardo minimo, capacità (anche
> 1, come unità parallele), modi con più risorse insieme, competenze,
finestre di disponibilità (senza interruzioni), setup dipendenti dalla sequenza
(eseguiti prima dell'attività, quando la risorsa è libera).

Non gestiti: il ritardo massimo tra attività (``max_lag_min``) non guida le
scelte; se a fine piano risulta violato, il piano è dichiarato INFEASIBLE.

Le attività su ogni risorsa vengono accodate: un'attività non viene mai inserita
in un buco lasciato prima di attività già schedulate.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from time import perf_counter
from typing import Callable

from .checker import check_plan
from .plan import Assignment, PlanResult, compute_kpis
from .schema import Activity, Instance, Job, Mode
from .validation import validate_instance


@dataclass(frozen=True)
class Candidate:
    activity_id: str
    job_id: str
    mode_index: int
    resource_ids: tuple[str, ...]
    start_min: int
    end_min: int
    duration_min: int
    setup_min: int               # somma dei setup sulle risorse del modo
    units: tuple[int, ...]       # unità scelta per ogni risorsa (capacità > 1)
    step: int                    # passo in cui è stato calcolato


class Dispatcher:
    def __init__(self, inst: Instance):
        issues = validate_instance(inst)
        if issues:
            raise ValueError(f"istanza non valida: {issues[0].code} {issues[0].message}")
        self.instance = inst
        self._acts = {a.id: a for a in inst.activities}
        self._order = {a.id: i for i, a in enumerate(inst.activities)}
        self._jobs = {j.id: j for j in inst.jobs}
        res = {r.id: r for r in inst.resources}
        self._windows = {r.id: sorted(r.availability) if r.availability is not None
                         else None for r in inst.resources}
        self._setup = {(s.resource_id, s.from_activity, s.to_activity): s.duration_min
                       for s in inst.setup_times}
        # Per ogni unità di ogni risorsa: [libera da, ultima attività].
        self._units: dict[str, list[list]] = {r.id: [[0, None] for _ in range(r.capacity)]
                                              for r in inst.resources}

        # Modi utilizzabili: durata nota e competenze coperte.
        self._modes: dict[str, list[tuple[int, Mode]]] = {}
        for a in inst.activities:
            usable = []
            for idx, m in enumerate(a.modes):
                owned = set().union(*(res[r].skills for r in m.resource_ids))
                if m.duration_min is not None and set(a.required_skills) <= owned:
                    usable.append((idx, m))
            self._modes[a.id] = usable

        self._preds: dict[str, list[tuple[str, int]]] = defaultdict(list)
        self._succs: dict[str, list[tuple[str, int]]] = defaultdict(list)
        for p in inst.precedences:
            self._preds[p.to].append((p.from_, p.min_lag_min))
            self._succs[p.from_].append((p.to, p.min_lag_min))
        self._waiting = {a.id: len(self._preds[a.id]) for a in inst.activities}
        self._ready = {aid for aid, n in self._waiting.items() if n == 0}
        self._done: dict[str, Assignment] = {}
        self.total_setup_min = 0
        self.step = 0

        self._min_dur = {aid: min((m.duration_min for _, m in modes), default=0)
                         for aid, modes in self._modes.items()}
        self._mean_dur = {aid: sum(m.duration_min for _, m in modes) / len(modes)
                          if modes else 0.0 for aid, modes in self._modes.items()}
        self._tail = self._compute_tails()
        self._remaining_dur = sum(self._mean_dur.values())
        self._job_size: dict[str, int] = defaultdict(int)
        for a in inst.activities:
            self._job_size[a.job_id] += 1
        self._job_left = dict(self._job_size)

    # ------------------------------------------------------------------ stato

    @property
    def done(self) -> bool:
        return len(self._done) == len(self._acts)

    @property
    def assignments(self) -> list[Assignment]:
        return sorted(self._done.values(),
                      key=lambda a: (a.start_min, self._order[a.activity_id]))

    def job(self, job_id: str) -> Job:
        return self._jobs[job_id]

    def activity(self, activity_id: str) -> Activity:
        return self._acts[activity_id]

    def order(self, activity_id: str) -> int:
        """Posizione dell'attività nell'istanza (per spareggi deterministici)."""
        return self._order[activity_id]

    def work_after(self, activity_id: str) -> int:
        """Lavoro minimo che resta nel job dopo questa attività (cammino critico)."""
        return self._tail[activity_id] - self._min_dur[activity_id]

    def mean_remaining_duration(self) -> float:
        """Durata media delle attività non ancora schedulate (minimo 1)."""
        left = len(self._acts) - len(self._done)
        return max(self._remaining_dur / left, 1.0) if left else 1.0

    def usable_modes(self, activity_id: str) -> list[tuple[int, Mode]]:
        """Modi eseguibili dell'attività (durata nota, competenze coperte)."""
        return self._modes[activity_id]

    def successors(self, activity_id: str) -> list[str]:
        return [s for s, _ in self._succs[activity_id]]

    def is_scheduled(self, activity_id: str) -> bool:
        return activity_id in self._done

    @property
    def n_scheduled(self) -> int:
        return len(self._done)

    def job_progress(self, job_id: str) -> tuple[int, int]:
        """(attività del job ancora da schedulare, attività totali del job)."""
        return self._job_left[job_id], self._job_size[job_id]

    def unscheduled_without_candidates(self) -> list[str]:
        """Attività pronte che non hanno nessun modo eseguibile."""
        have = {c.activity_id for c in self.candidates(active_only=False)}
        return sorted((a for a in self._ready if a not in have), key=self._order.get)

    # -------------------------------------------------------------- decisioni

    def candidates(self, active_only: bool = True) -> list[Candidate]:
        """Candidati del passo corrente, in ordine deterministico.

        Con ``active_only`` si tengono solo i candidati che iniziano prima della
        fine più anticipata tra tutti (insieme di conflitto di Giffler-Thompson):
        scegliere altro lascerebbe una risorsa ferma senza motivo.
        """
        out: list[Candidate] = []
        for aid in sorted(self._ready, key=self._order.get):
            act = self._acts[aid]
            earliest = self._jobs[act.job_id].release_min
            for pred, lag in self._preds[aid]:
                earliest = max(earliest, self._done[pred].end_min + lag)
            for idx, mode in self._modes[aid]:
                cand = self._evaluate(act, idx, mode, earliest)
                if cand is not None:
                    out.append(cand)
        if active_only and out:
            cutoff = min(c.end_min for c in out)
            out = [c for c in out if c.start_min < cutoff or c.end_min == cutoff]
        return out

    def apply(self, cand: Candidate) -> Assignment:
        if cand.step != self.step or cand.activity_id not in self._ready:
            raise ValueError(f"candidato {cand.activity_id} non valido al passo {self.step}")
        aid = cand.activity_id
        for rid, unit in zip(cand.resource_ids, cand.units):
            self._units[rid][unit] = [cand.end_min, aid]
        asg = Assignment(activity_id=aid, mode_index=cand.mode_index,
                         resource_ids=list(cand.resource_ids),
                         start_min=cand.start_min, end_min=cand.end_min)
        self._done[aid] = asg
        self._ready.remove(aid)
        self.total_setup_min += cand.setup_min
        self._remaining_dur -= self._mean_dur[aid]
        self._job_left[cand.job_id] -= 1
        for succ, _ in self._succs[aid]:
            self._waiting[succ] -= 1
            if self._waiting[succ] == 0:
                self._ready.add(succ)
        self.step += 1
        return asg

    # ---------------------------------------------------------------- interni

    def _evaluate(self, act: Activity, idx: int, mode: Mode,
                  earliest: int) -> Candidate | None:
        start, units, setup_total = earliest, [], 0
        for rid in mode.resource_ids:
            best = None
            for u, (free, last) in enumerate(self._units[rid]):
                setup = self._setup.get((rid, last, act.id), 0) if last else 0
                if best is None or free + setup < best[0]:
                    best = (free + setup, u, setup)
            start = max(start, best[0])
            units.append(best[1])
            setup_total += best[2]
        start = self._fit(mode.resource_ids, start, mode.duration_min)
        if start is None:
            return None
        return Candidate(activity_id=act.id, job_id=act.job_id, mode_index=idx,
                         resource_ids=tuple(mode.resource_ids), start_min=start,
                         end_min=start + mode.duration_min,
                         duration_min=mode.duration_min, setup_min=setup_total,
                         units=tuple(units), step=self.step)

    def _fit(self, resource_ids: list[str], t: int, duration: int) -> int | None:
        """Primo istante >= t in cui l'attività sta intera in una finestra di
        ogni risorsa; None se non esiste."""
        while True:
            moved = t
            for rid in resource_ids:
                fit = _fit_one(self._windows[rid], moved, duration)
                if fit is None:
                    return None
                moved = max(moved, fit)
            if moved == t:
                return t
            t = moved

    def _compute_tails(self) -> dict[str, int]:
        """Per ogni attività: durata minima sua + cammino più lungo dei successori."""
        indeg = {aid: len(self._succs[aid]) for aid in self._acts}
        stack = [aid for aid, n in indeg.items() if n == 0]
        tail: dict[str, int] = {}
        while stack:
            aid = stack.pop()
            tail[aid] = self._min_dur[aid] + max(
                (lag + tail[s] for s, lag in self._succs[aid]), default=0)
            for pred, _ in self._preds[aid]:
                indeg[pred] -= 1
                if indeg[pred] == 0:
                    stack.append(pred)
        return tail


def _fit_one(windows: list[tuple[int, int]] | None, t: int, duration: int) -> int | None:
    if windows is None:
        return t
    for start, end in windows:
        s = max(t, start)
        if s + duration <= end:
            return s
    return None


Rule = Callable[[Dispatcher, list[Candidate]], Candidate]


def run(inst: Instance, rule: Rule, solver: str) -> PlanResult:
    """Costruisce un piano completo scegliendo a ogni passo con ``rule``."""
    t0 = perf_counter()
    disp = Dispatcher(inst)
    warnings: list[str] = []
    no_due = sum(j.due_min is None for j in inst.jobs)
    if no_due:
        warnings.append(f"{no_due} job senza due date: ritardo non calcolato per questi")

    while not disp.done:
        cands = disp.candidates()
        if not cands:
            stuck = disp.unscheduled_without_candidates()
            return _infeasible(solver, t0, [
                "Nessun modo eseguibile entro le finestre di disponibilità per: "
                + ", ".join(stuck[:5])])
        disp.apply(rule(disp, cands))

    assignments = disp.assignments
    violations = check_plan(inst, assignments)
    if violations:
        return _infeasible(solver, t0, violations[:10])
    elapsed = round((perf_counter() - t0) * 1000)
    return PlanResult(status="OK", solver=solver, assignments=assignments,
                      kpis=compute_kpis(inst, assignments, disp.total_setup_min),
                      warnings=warnings, timing_ms={"policy": elapsed, "total": elapsed})


def _infeasible(solver: str, t0: float, warnings: list[str]) -> PlanResult:
    elapsed = round((perf_counter() - t0) * 1000)
    return PlanResult(status="INFEASIBLE", solver=solver, warnings=warnings,
                      timing_ms={"total": elapsed})


__all__ = ["Candidate", "Dispatcher", "Rule", "run"]
