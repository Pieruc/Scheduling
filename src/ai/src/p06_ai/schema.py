"""Unified Instance Schema (contratto D di CONTRATTI_API.md).

Stesse sezioni della ProblemSpec (contratto B.1): ``resources``, ``jobs``,
``activities``, ``precedences``, ``setup_times``, più il blocco ``source``.
I tempi sono interi in minuti, gli ID sono stringhe opache.

Questi modelli controllano solo la forma del documento. I controlli di
consistenza (ID inesistenti, cicli, ...) stanno in ``validation.py``.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SPEC_VERSION = "1.0"


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Resource(_Model):
    id: str
    type: Literal["MACHINE", "PERSON", "ROOM"] = "MACHINE"
    capacity: int = Field(1, ge=1)
    skills: list[str] = []
    # Finestre [inizio, fine) in minuti. None = sempre disponibile
    # (i benchmark non hanno calendari).
    availability: list[tuple[int, int]] | None = None


class Job(_Model):
    id: str
    release_min: int = Field(0, ge=0)
    # None = nessuna due date (i benchmark classici non la definiscono).
    due_min: int | None = Field(None, ge=0)
    weight: float = Field(1.0, ge=0)
    priority: int | None = None


class Mode(_Model):
    resource_ids: list[str] = Field(min_length=1)
    # None = durata da stimare (M1 Context).
    duration_min: int | None = Field(None, ge=0)


class Activity(_Model):
    id: str
    job_id: str
    required_skills: list[str] = []
    modes: list[Mode]
    features: dict[str, Any] = {}


class Precedence(_Model):
    from_: str = Field(alias="from")
    to: str
    type: Literal["FS"] = "FS"
    min_lag_min: int = 0
    max_lag_min: int | None = None


class SetupTime(_Model):
    resource_id: str
    from_activity: str
    to_activity: str
    duration_min: int = Field(ge=0)


class BestKnown(_Model):
    # Miglior makespan noto (upper bound); coincide con l'ottimo se optimal=True.
    makespan: int | None = None
    # Non presente nel contratto v1: serve a calcolare il gap quando l'ottimo non è noto.
    lower_bound: int | None = None
    optimal: bool = False


class Source(_Model):
    dataset: str
    instance: str
    license: str | None = None
    best_known: BestKnown | None = None


class Instance(_Model):
    spec_version: str = SPEC_VERSION
    source: Source
    domain_profile: str | None = None
    # Come nella ProblemSpec. None nei benchmark (obiettivo implicito: makespan).
    objective_weights: dict[str, float] | None = None
    resources: list[Resource]
    jobs: list[Job]
    activities: list[Activity]
    precedences: list[Precedence] = []
    setup_times: list[SetupTime] = []

    def to_json(self) -> str:
        return self.model_dump_json(by_alias=True, indent=2)
