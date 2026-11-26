"""AI Inference Service (contratto B di CONTRATTI_API.md): ``/optimize``, ``/validate``, ``/health``.

Adattatore HTTP sottile sopra le parti già testate della libreria: schema e validazione,
Dispatcher, regole EDD e ATC, obiettivo composto. Finché la policy M2 e il modello M1 non sono
addestrati:

- ``/optimize`` risponde con ``status = FALLBACK`` (``fallback_reason = ERROR``): prova EDD e ATC
  con alcuni valori di k e restituisce il piano col costo composto più basso secondo gli
  ``objective_weights`` della richiesta, quindi pesi diversi possono dare piani diversi;
- le durate mancanti (``duration_min`` nullo) sono stimate con la media degli altri modi della
  stessa attività, o con un valore di default, e compaiono in ``context_adjustments`` con
  ``source = DEFAULT_ESTIMATE`` (non è una stima di M1).

``options.solver`` (``ATC`` o ``EDD``) è un'estensione del contratto B: chiede esplicitamente una
regola. Il backend la usa per il confronto con le baseline che il contratto A.4 mostra accanto ai
tre piani.

Avvio in locale (da ``src/ai``):  ``uvicorn p06_ai.service:app --port 8000``
Se la variabile ``FLOWSYNC_AI_SERVICE_KEY`` è impostata, ogni chiamata deve portare l'header
``X-Service-Key`` con lo stesso valore (contratto B: chiave condivisa tra servizi).
"""

from __future__ import annotations

import hashlib
import importlib.util
import os
from collections import OrderedDict
from statistics import mean
from time import perf_counter
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from . import objective
from .plan import PlanResult
from .rules import make_atc, solve_edd
from .dispatcher import run
from .schema import SPEC_VERSION, Activity, Instance, Job, Mode, Precedence, Resource, SetupTime, Source
from .validation import validate_instance

DEFAULT_DURATION_MIN = 60
ATC_K_VALUES = (0.5, 1.0, 2.0, 4.0)
CACHE_SIZE = 128


# ---------------------------------------------------------------- ProblemSpec (contratto B.1)

class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Horizon(_Model):
    start: str
    length_min: int = Field(gt=0)


class FixedAssignment(_Model):
    activity_id: str
    resource_ids: list[str]
    start_min: int = Field(ge=0)
    end_min: int = Field(ge=0)


class Options(_Model):
    time_limit_ms: int = Field(5000, gt=0)
    allow_fallback: bool = True
    fallback_chain: list[str] = ["ATC", "EDD"]
    min_confidence: float = 0.6
    seed: int | None = None
    # Estensione del contratto B: forza una regola (baseline ATC / EDD del contratto A.4)
    solver: Literal["ATC", "EDD"] | None = None


class ProblemSpec(_Model):
    spec_version: str = SPEC_VERSION
    request_id: str | None = None
    domain_profile: str | None = None
    mode: str | None = None                      # campo storico (NORMAL / SHADOW), ignorato
    horizon: Horizon
    objective_weights: dict[str, float] | None = None
    resources: list[Resource]
    jobs: list[Job]
    activities: list[Activity]
    precedences: list[Precedence] = []
    setup_times: list[SetupTime] = []
    fixed_assignments: list[FixedAssignment] = []
    options: Options = Options()


class ServiceError(Exception):
    """Errore che diventa un problema RFC 7807 (contratto, §0)."""

    def __init__(self, status: int, title: str, detail: str, errors: list[dict[str, str]] | None = None):
        super().__init__(detail)
        self.status, self.title, self.detail, self.errors = status, title, detail, errors or []


def _problem(status: int, title: str, detail: str, instance: str,
             errors: list[dict[str, str]] | None = None) -> JSONResponse:
    body: dict[str, Any] = {"type": f"https://flowsync.local/errors/{title.lower().replace(' ', '-')}",
                            "title": title, "status": status, "detail": detail, "instance": instance}
    if errors:
        body["errors"] = errors
    return JSONResponse(body, status_code=status, media_type="application/problem+json")


# ---------------------------------------------------------------- conversione e controlli

def to_instance(spec: ProblemSpec) -> tuple[Instance, list[dict[str, Any]]]:
    """ProblemSpec -> istanza della libreria, con le durate mancanti già stimate.

    Restituisce anche le ``context_adjustments`` (una per ogni durata stimata).
    """
    adjustments: list[dict[str, Any]] = []
    activities: list[Activity] = []
    for act in spec.activities:
        known = [m.duration_min for m in act.modes if m.duration_min is not None]
        guess = round(mean(known)) if known else DEFAULT_DURATION_MIN
        modes: list[Mode] = []
        for idx, mode in enumerate(act.modes):
            if mode.duration_min is None:
                adjustments.append({"activity_id": act.id, "mode_index": idx, "field": "duration_min",
                                    "value": guess, "source": "DEFAULT_ESTIMATE", "uncertainty": None})
                mode = mode.model_copy(update={"duration_min": guess})
            modes.append(mode)
        activities.append(act.model_copy(update={"modes": modes}))
    inst = Instance(source=Source(dataset="backend", instance=spec.request_id or "request"),
                    domain_profile=spec.domain_profile, objective_weights=spec.objective_weights,
                    resources=spec.resources, jobs=spec.jobs, activities=activities,
                    precedences=spec.precedences, setup_times=spec.setup_times)
    return inst, adjustments


def check_spec(spec: ProblemSpec, inst: Instance) -> list[dict[str, str]]:
    """Regole della tabella B.1 non coperte da ``validate_instance``: versione e pesi."""
    errors: list[dict[str, str]] = []
    if spec.spec_version.split(".")[0] != SPEC_VERSION.split(".")[0]:
        errors.append({"code": "UNSUPPORTED_SPEC_VERSION", "path": "spec_version",
                       "message": f"Versione {spec.spec_version} non supportata (attesa {SPEC_VERSION})"})
    weights = spec.objective_weights
    if weights is not None and (any(v < 0 for v in weights.values()) or not any(weights.values())):
        errors.append({"code": "INVALID_WEIGHTS", "path": "objective_weights",
                       "message": "Pesi negativi o tutti nulli"})
    errors += [{"code": i.code, "path": i.path, "message": i.message} for i in validate_instance(inst)]
    return errors


# ---------------------------------------------------------------- risoluzione

def solve(spec: ProblemSpec) -> PlanResult:
    t0 = perf_counter()
    inst, adjustments = to_instance(spec)
    errors = check_spec(spec, inst)
    if errors:
        n = len(errors)
        raise ServiceError(422, "Validation failed", f"La ProblemSpec contiene {n} error{'e' if n == 1 else 'i'}", errors)

    warnings: list[str] = []
    if spec.fixed_assignments:
        warnings.append("fixed_assignments non ancora supportate: ignorate")

    if spec.options.solver == "EDD":
        result = solve_edd(inst)
    elif spec.options.solver == "ATC":
        result = run(inst, make_atc(2.0), "ATC")
    else:
        # Policy M2 non ancora disponibile: si usa il metodo di riserva, se ammesso
        if not spec.options.allow_fallback:
            raise ServiceError(503, "Service unavailable",
                               "La policy M2 non è disponibile e la richiesta non ammette il fallback")
        result = _best_rule(inst)
        if result.status != "INFEASIBLE":
            result = result.model_copy(update={"status": "FALLBACK", "fallback_reason": "ERROR"})
            warnings.append(f"Policy M2 non disponibile: piano della regola {result.solver} "
                            "con il costo composto più basso")

    if adjustments:
        warnings.append(f"{len(adjustments)} durate mancanti stimate con un valore di default (M1 non disponibile)")
    total = round((perf_counter() - t0) * 1000)
    return result.model_copy(update={
        "request_id": spec.request_id,
        "context_adjustments": adjustments,
        "warnings": warnings + result.warnings,
        "timing_ms": {**result.timing_ms, "total": total},
    })


def _best_rule(inst: Instance) -> PlanResult:
    """Il piano col costo composto più basso tra EDD e ATC con diversi k."""
    candidates = [solve_edd(inst)] + [run(inst, make_atc(k), "ATC") for k in ATC_K_VALUES]
    feasible = [c for c in candidates if c.status == "OK" and c.kpis is not None]
    if not feasible:
        return candidates[0]
    scale = objective.scales(inst)
    return min(feasible, key=lambda c: objective.cost(inst, c.kpis, scale))


# ---------------------------------------------------------------- applicazione FastAPI

app = FastAPI(title="FlowSync AI Inference Service", version="0.1.0",
              description="Contratto B: ProblemSpec -> PlanResult")

_cache: OrderedDict[str, dict[str, Any]] = OrderedDict()


def require_service_key(x_service_key: str | None = Header(default=None)) -> None:
    expected = os.environ.get("FLOWSYNC_AI_SERVICE_KEY")
    if expected and x_service_key != expected:
        raise ServiceError(401, "Unauthorized", "Header X-Service-Key mancante o errato")


@app.exception_handler(ServiceError)
async def _service_error(request: Request, exc: ServiceError) -> JSONResponse:
    return _problem(exc.status, exc.title, exc.detail, request.url.path, exc.errors)


@app.exception_handler(RequestValidationError)
async def _shape_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # JSON illeggibile = 400; JSON leggibile ma con la forma sbagliata = 422 (contratto, §0)
    if any(e.get("type") == "json_invalid" for e in exc.errors()):
        return _problem(400, "Bad request", "JSON malformato", request.url.path)
    errors = [{"code": "SCHEMA_VIOLATION",
               "path": ".".join(str(p) for p in e.get("loc", [])[1:]),
               "message": e.get("msg", "")} for e in exc.errors()]
    return _problem(422, "Validation failed", f"La ProblemSpec non rispetta lo schema ({len(errors)} errori)",
                    request.url.path, errors)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "UP", "models_loaded": {},
            "cp_sat_available": importlib.util.find_spec("ortools") is not None}


@app.post("/validate", dependencies=[Depends(require_service_key)])
def validate(spec: ProblemSpec) -> dict[str, Any]:
    inst, adjustments = to_instance(spec)
    errors = check_spec(spec, inst)
    if errors:
        raise ServiceError(422, "Validation failed", f"La ProblemSpec contiene {len(errors)} errori", errors)
    return {"valid": True, "estimated_durations": len(adjustments)}


@app.post("/optimize", dependencies=[Depends(require_service_key)])
def optimize(spec: ProblemSpec) -> dict[str, Any]:
    # request_id rende la chiamata idempotente: un retry riceve lo stesso risultato (contratto B.4).
    # Nella chiave c'è anche l'impronta del corpo: un id riusato con dati diversi non riceve un piano vecchio.
    key = (f"{spec.request_id}|{hashlib.sha256(spec.model_dump_json().encode()).hexdigest()}"
           if spec.request_id else None)
    if key and key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    body = solve(spec).model_dump(mode="json")
    if key:
        _cache[key] = body
        if len(_cache) > CACHE_SIZE:
            _cache.popitem(last=False)
    return body


__all__ = ["app", "ProblemSpec", "solve", "to_instance"]
