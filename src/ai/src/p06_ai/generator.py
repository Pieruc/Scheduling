"""Instance Generator: istanze sintetiche secondo un profilo di dominio.

Ogni istanza dipende solo da (profilo, seed): lo stesso seed produce lo stesso JSON.
Gli intervalli ``(min, max)`` sono inclusi ed estratti in modo uniforme.

Uso da riga di comando:
    python -m p06_ai.generator --profile FACTORY --count 100 --seed 0 --out data/generated
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .schema import (Activity, Instance, Job, Mode, Precedence, Resource,
                     SetupTime, Source)
from .validation import validate_instance

IntRange = tuple[int, int]
OBJECTIVES = ("makespan", "weighted_tardiness", "setup")


class Profile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    resource_type: Literal["MACHINE", "PERSON", "ROOM"] = "MACHINE"
    resource_prefix: str = "M"

    n_jobs: IntRange
    n_resources: IntRange
    activities_per_job: IntRange
    duration: IntRange                      # minuti, sulla risorsa "di riferimento"
    # Le risorse alternative hanno durata = riferimento * U(1 - spread, 1 + spread).
    duration_spread: float = Field(0.0, ge=0, lt=1)

    # Idoneità. Senza competenze: ogni attività sceglie a caso `alternatives` risorse.
    alternatives: IntRange = (1, 1)
    # Con competenze (n_skills impostato): ogni attività richiede una competenza
    # e può essere svolta da tutte le risorse che la possiedono.
    n_skills: IntRange | None = None
    skills_per_resource: IntRange = (1, 1)

    # Precedenze: ogni attività segue la precedente dello stesso job; con
    # probabilità branch_prob segue invece una qualunque attività anteriore
    # (rami paralleli). 0 = catena, come nel job shop.
    branch_prob: float = Field(0.0, ge=0, le=1)

    # Rilasci in U(0, release_spread * carico medio per risorsa).
    release_spread: float = Field(0.0, ge=0)
    # due = rilascio + cammino critico del job + s * makespan stimato, con s in
    # questo intervallo. Il makespan stimato tiene conto del carico sulle risorse
    # condivise: senza, quasi tutti i job risulterebbero in anticipo.
    due_slack: tuple[float, float] = (0.0, 1.0)
    job_weights: list[float] = [1.0]
    priorities: IntRange = (1, 5)

    # Setup dipendenti dalla sequenza, tra famiglie diverse di attività.
    setup_prob: float = Field(0.0, ge=0, le=1)   # quota di istanze con setup
    setup_families: IntRange = (2, 4)
    setup_duration: IntRange = (5, 30)

    # Parametri Dirichlet dei pesi degli obiettivi: più alto = peso medio maggiore.
    objective_alpha: dict[str, float] = {"makespan": 1.0, "weighted_tardiness": 1.0,
                                         "setup": 1.0}

    @model_validator(mode="after")
    def _check(self) -> "Profile":
        for name in ("n_jobs", "n_resources", "activities_per_job", "duration",
                     "alternatives", "n_skills", "skills_per_resource", "priorities",
                     "setup_families", "setup_duration", "due_slack"):
            rng = getattr(self, name)
            if rng is not None and rng[0] > rng[1]:
                raise ValueError(f"{name}: minimo maggiore del massimo")
        for name in ("n_jobs", "n_resources", "activities_per_job", "alternatives",
                     "skills_per_resource", "setup_families"):
            if getattr(self, name)[0] < 1:
                raise ValueError(f"{name}: il minimo deve essere almeno 1")
        if self.n_skills is not None and self.n_skills[0] < 1:
            raise ValueError("n_skills: il minimo deve essere almeno 1")
        if self.duration[0] < 1 or self.setup_duration[0] < 0 or self.due_slack[0] < 0:
            raise ValueError("durate positive, setup e due_slack non negativi")
        if not self.job_weights or min(self.job_weights) < 0:
            raise ValueError("job_weights non valido")
        if set(self.objective_alpha) != set(OBJECTIVES) or \
                min(self.objective_alpha.values()) <= 0:
            raise ValueError(f"objective_alpha deve avere le chiavi {OBJECTIVES}, positive")
        return self


# Dimensioni volutamente piccole: le istanze di training devono essere risolte
# da CP-SAT all'ottimo (o con gap basso) in tempi brevi.
FACTORY = Profile(
    code="FACTORY", resource_type="MACHINE", resource_prefix="M",
    n_jobs=(5, 15), n_resources=(4, 10), activities_per_job=(3, 6),
    duration=(10, 120), duration_spread=0.3, alternatives=(1, 3),
    release_spread=0.5, due_slack=(0.0, 0.6), job_weights=[1.0, 1.0, 2.0, 3.0],
    setup_prob=0.5, setup_families=(2, 4), setup_duration=(5, 30),
)

# Pubblica amministrazione: persone con competenze, pratiche con rami paralleli,
# nessun setup, ritardo più importante del makespan.
PA = Profile(
    code="PA", resource_type="PERSON", resource_prefix="P",
    n_jobs=(5, 20), n_resources=(4, 12), activities_per_job=(3, 8),
    duration=(15, 240), duration_spread=0.25,
    n_skills=(3, 6), skills_per_resource=(1, 3), branch_prob=0.25,
    release_spread=1.0, due_slack=(0.0, 0.4), job_weights=[1.0, 1.0, 1.0, 2.0, 5.0],
    setup_prob=0.0,
    objective_alpha={"makespan": 1.0, "weighted_tardiness": 3.0, "setup": 1.0},
)

PROFILES = {p.code: p for p in (FACTORY, PA)}


def _objective_weights(rng: random.Random, alpha: dict[str, float],
                       has_setup: bool) -> dict[str, float]:
    keys = [k for k in OBJECTIVES if has_setup or k != "setup"]
    draws = [rng.gammavariate(alpha[k], 1.0) for k in keys]
    total = sum(draws)
    weights = {k: round(d / total, 4) for k, d in zip(keys, draws)}
    # L'arrotondamento può spostare la somma di qualche decimillesimo.
    top = max(weights, key=weights.get)
    weights[top] = round(weights[top] + 1.0 - sum(weights.values()), 4)
    if not has_setup:
        weights["setup"] = 0.0
    return {k: weights[k] for k in OBJECTIVES}


def generate_instance(profile: Profile, seed: int) -> Instance:
    rng = random.Random(f"{profile.code}:{seed}")
    n_jobs = rng.randint(*profile.n_jobs)
    n_res = rng.randint(*profile.n_resources)
    width = len(str(n_res))
    res_ids = [f"{profile.resource_prefix}{i:0{width}d}" for i in range(1, n_res + 1)]

    # Competenze: ogni competenza ha almeno una risorsa, ogni risorsa almeno una.
    res_skills: dict[str, list[str]] = {r: [] for r in res_ids}
    skills: list[str] = []
    if profile.n_skills is not None:
        skills = [f"S{i}" for i in range(1, rng.randint(*profile.n_skills) + 1)]
        for r in res_ids:
            k = min(rng.randint(*profile.skills_per_resource), len(skills))
            res_skills[r] = sorted(rng.sample(skills, k))
        for s in skills:
            if not any(s in owned for owned in res_skills.values()):
                r = rng.choice(res_ids)
                res_skills[r] = sorted(res_skills[r] + [s])
    by_skill = {s: [r for r in res_ids if s in res_skills[r]] for s in skills}

    has_setup = rng.random() < profile.setup_prob
    families = [f"F{i}" for i in range(1, rng.randint(*profile.setup_families) + 1)] \
        if has_setup else []

    activities: list[Activity] = []
    precedences: list[Precedence] = []
    job_acts: list[list[Activity]] = []
    critical: list[int] = []          # cammino critico di ogni job, a durate medie
    total_work = 0.0

    for j in range(1, n_jobs + 1):
        job_id = f"J{j}"
        acts: list[Activity] = []
        finish: list[float] = []      # fine minima di ogni attività del job
        for a in range(1, rng.randint(*profile.activities_per_job) + 1):
            if skills:
                skill = rng.choice(skills)
                eligible, required = by_skill[skill], [skill]
            else:
                k = min(rng.randint(*profile.alternatives), n_res)
                eligible, required = sorted(rng.sample(res_ids, k)), []
            base = rng.randint(*profile.duration)
            modes = []
            for idx, r in enumerate(eligible):
                factor = 1.0 if idx == 0 else \
                    rng.uniform(1 - profile.duration_spread, 1 + profile.duration_spread)
                modes.append(Mode(resource_ids=[r],
                                  duration_min=max(1, round(base * factor))))
            features = {"family": rng.choice(families)} if families else {}
            act = Activity(id=f"{job_id}-A{a}", job_id=job_id, required_skills=required,
                           modes=modes, features=features)
            mean = sum(m.duration_min for m in modes) / len(modes)
            total_work += mean
            if acts:
                pred = len(acts) - 1
                if len(acts) > 1 and rng.random() < profile.branch_prob:
                    pred = rng.randrange(len(acts) - 1)
                precedences.append(Precedence(from_=acts[pred].id, to=act.id))
                finish.append(finish[pred] + mean)
            else:
                finish.append(mean)
            acts.append(act)
        activities.extend(acts)
        job_acts.append(acts)
        critical.append(math.ceil(max(finish)))

    load = total_work / n_res
    # Stima grezza del makespan: il massimo tra carico medio per risorsa e job più lungo.
    makespan_est = max(load, max(critical))
    jobs: list[Job] = []
    for j, path in enumerate(critical, start=1):
        release = rng.randint(0, int(profile.release_spread * load))
        due = release + path + math.ceil(rng.uniform(*profile.due_slack) * makespan_est)
        jobs.append(Job(id=f"J{j}", release_min=release, due_min=due,
                        weight=rng.choice(profile.job_weights),
                        priority=rng.randint(*profile.priorities)))

    setup_times: list[SetupTime] = []
    if families:
        matrix = {(f, g): rng.randint(*profile.setup_duration)
                  for f in families for g in families if f != g}
        on_resource: dict[str, list[Activity]] = {r: [] for r in res_ids}
        for act in activities:
            for mode in act.modes:
                on_resource[mode.resource_ids[0]].append(act)
        for r in res_ids:
            for a in on_resource[r]:
                for b in on_resource[r]:
                    fa, fb = a.features["family"], b.features["family"]
                    if a.id != b.id and fa != fb and matrix[fa, fb] > 0:
                        setup_times.append(SetupTime(
                            resource_id=r, from_activity=a.id, to_activity=b.id,
                            duration_min=matrix[fa, fb]))

    return Instance(
        source=Source(dataset=f"synthetic/{profile.code}", instance=f"seed-{seed}"),
        domain_profile=profile.code,
        objective_weights=_objective_weights(rng, profile.objective_alpha,
                                             bool(setup_times)),
        resources=[Resource(id=r, type=profile.resource_type, skills=res_skills[r])
                   for r in res_ids],
        jobs=jobs, activities=activities, precedences=precedences,
        setup_times=setup_times,
    )


def generate_dataset(profile: Profile, out_dir: Path, *, count: int,
                     first_seed: int = 0) -> int:
    """Scrive ``count`` istanze in ``out_dir/<codice profilo>/seed-<n>.json``."""
    target = out_dir / profile.code
    target.mkdir(parents=True, exist_ok=True)
    for seed in range(first_seed, first_seed + count):
        inst = generate_instance(profile, seed)
        issues = validate_instance(inst)
        if issues:  # sarebbe un bug del generatore, non un errore di input
            raise RuntimeError(f"seed {seed}: {issues[0].code} {issues[0].message}")
        (target / f"seed-{seed}.json").write_text(inst.to_json(), encoding="utf-8")
    return count


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Genera istanze sintetiche")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--profile", choices=sorted(PROFILES), help="profilo predefinito")
    group.add_argument("--profile-file", type=Path,
                       help="profilo in JSON (es. prodotto da p06_ai.calibration)")
    ap.add_argument("--count", type=int, default=10)
    ap.add_argument("--seed", type=int, default=0, help="primo seed")
    ap.add_argument("--out", type=Path, required=True, help="cartella di output")
    args = ap.parse_args(argv)
    if args.count < 1:
        ap.error("--count deve essere almeno 1")
    if args.profile_file:
        try:
            profile = Profile.model_validate(
                json.loads(args.profile_file.read_text(encoding="utf-8")))
        except (OSError, ValueError) as exc:
            print(f"Profilo non valido: {exc}", file=sys.stderr)
            return 1
    else:
        profile = PROFILES[args.profile]
    n = generate_dataset(profile, args.out, count=args.count, first_seed=args.seed)
    print(f"{n} istanze generate in {args.out / profile.code}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
