"""Test del servizio HTTP (contratto B): /health, /validate, /optimize."""

from __future__ import annotations

import copy

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from p06_ai.checker import check_plan  # noqa: E402
from p06_ai.plan import Assignment  # noqa: E402
from p06_ai.service import ProblemSpec, app, to_instance  # noqa: E402

client = TestClient(app)

# La commessa C-101 del seed del backend in minuti di lavoro: due giorni da 480 minuti,
# la fresa CNC2 ferma il primo giorno (manutenzione), la verniciatura senza durata (da stimare).
SPEC = {
    "spec_version": "1.0",
    "request_id": "REQ-0001-BALANCED",
    "domain_profile": "FACTORY",
    "horizon": {"start": "2026-11-26T08:00:00+01:00", "length_min": 960},
    "objective_weights": {"makespan": 0.3, "weighted_tardiness": 0.5, "setup": 0.2},
    "resources": [
        {"id": "LASER", "type": "MACHINE", "availability": [[0, 960]]},
        {"id": "CNC1", "type": "MACHINE", "availability": [[0, 960]]},
        {"id": "CNC2", "type": "MACHINE", "availability": [[480, 960]]},
        {"id": "PRESS", "type": "MACHINE", "availability": [[0, 960]]},
        {"id": "WELD1", "type": "MACHINE", "availability": [[0, 960]]},
        {"id": "PAINT", "type": "MACHINE", "availability": [[0, 960]]},
        {"id": "QC", "type": "MACHINE", "availability": [[0, 960]]},
    ],
    "jobs": [{"id": "C-101", "release_min": 0, "due_min": 900, "weight": 3.0, "priority": 3}],
    "activities": [
        {"id": "T", "job_id": "C-101", "modes": [{"resource_ids": ["LASER"], "duration_min": 120}]},
        {"id": "F", "job_id": "C-101", "modes": [{"resource_ids": ["CNC1"], "duration_min": 180},
                                                 {"resource_ids": ["CNC2"], "duration_min": 150}]},
        {"id": "P", "job_id": "C-101", "modes": [{"resource_ids": ["PRESS"], "duration_min": 60}]},
        {"id": "S", "job_id": "C-101", "modes": [{"resource_ids": ["WELD1"], "duration_min": 180}]},
        {"id": "V", "job_id": "C-101", "modes": [{"resource_ids": ["PAINT"], "duration_min": None}]},
        {"id": "C", "job_id": "C-101", "modes": [{"resource_ids": ["QC"], "duration_min": 60}]},
    ],
    "precedences": [{"from": "T", "to": "F"}, {"from": "T", "to": "P"}, {"from": "F", "to": "S"},
                    {"from": "P", "to": "S"}, {"from": "S", "to": "V"}, {"from": "V", "to": "C"}],
    "options": {"time_limit_ms": 5000, "allow_fallback": True},
}


def spec(**changes):
    body = copy.deepcopy(SPEC)
    body.update(changes)
    return body


def test_health_reports_no_model_loaded():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "UP"
    assert res.json()["models_loaded"] == {}


def test_optimize_returns_a_feasible_fallback_plan():
    res = client.post("/optimize", json=spec())
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "FALLBACK"
    assert body["fallback_reason"] == "ERROR"
    assert body["solver"] in ("ATC", "EDD")
    assert body["request_id"] == "REQ-0001-BALANCED"
    assert {a["activity_id"] for a in body["assignments"]} == {"T", "F", "P", "S", "V", "C"}
    # il piano rispetta precedenze, capacità e finestre (stesso controllo della libreria)
    inst, _ = to_instance(ProblemSpec.model_validate(spec()))
    assert check_plan(inst, [Assignment(**a) for a in body["assignments"]]) == []
    # CNC2 è ferma fino al minuto 480: se la fresatura va lì, inizia dopo
    f = next(a for a in body["assignments"] if a["activity_id"] == "F")
    if f["resource_ids"] == ["CNC2"]:
        assert f["start_min"] >= 480


def test_missing_durations_are_estimated_and_reported():
    body = client.post("/optimize", json=spec()).json()
    adj = body["context_adjustments"]
    assert adj == [{"activity_id": "V", "mode_index": 0, "field": "duration_min", "value": 60,
                    "source": "DEFAULT_ESTIMATE", "uncertainty": None}]
    v = next(a for a in body["assignments"] if a["activity_id"] == "V")
    assert v["end_min"] - v["start_min"] == 60


def test_a_rule_can_be_requested_explicitly():
    for rule in ("ATC", "EDD"):
        body = client.post("/optimize", json=spec(options={"solver": rule})).json()
        assert body["status"] == "OK"
        assert body["solver"] == rule


def test_inconsistent_specs_are_rejected_with_codes():
    bad = spec(precedences=[{"from": "T", "to": "F"}, {"from": "F", "to": "T"}, {"from": "T", "to": "Z"}])
    res = client.post("/optimize", json=bad)
    assert res.status_code == 422
    assert res.headers["content-type"].startswith("application/problem+json")
    codes = {e["code"] for e in res.json()["errors"]}
    assert {"UNKNOWN_ACTIVITY"} <= codes


def test_unsupported_version_and_bad_weights():
    res = client.post("/validate", json=spec(spec_version="2.0", objective_weights={"makespan": 0}))
    assert res.status_code == 422
    codes = {e["code"] for e in res.json()["errors"]}
    assert codes == {"UNSUPPORTED_SPEC_VERSION", "INVALID_WEIGHTS"}


def test_shape_errors_are_422_and_malformed_json_is_400():
    res = client.post("/optimize", json={"horizon": {"start": "x", "length_min": 10}})
    assert res.status_code == 422
    assert all(e["code"] == "SCHEMA_VIOLATION" for e in res.json()["errors"])
    res = client.post("/optimize", content=b"{not json", headers={"content-type": "application/json"})
    assert res.status_code == 400


def test_no_fallback_allowed_without_a_policy_is_503():
    res = client.post("/optimize", json=spec(request_id=None, options={"allow_fallback": False}))
    assert res.status_code == 503


def test_an_impossible_window_gives_infeasible_not_an_error():
    tight = spec(request_id=None)
    tight["resources"][0]["availability"] = [[0, 60]]          # il taglio dura 120 ma il laser c'è per 60
    body = client.post("/optimize", json=tight).json()
    assert body["status"] == "INFEASIBLE"
    assert body["assignments"] == []
    assert body["warnings"]


def test_service_key_is_required_when_configured(monkeypatch):
    monkeypatch.setenv("FLOWSYNC_AI_SERVICE_KEY", "secret")
    assert client.post("/validate", json=spec()).status_code == 401
    assert client.post("/validate", json=spec(), headers={"X-Service-Key": "secret"}).status_code == 200
    assert client.get("/health").status_code == 200            # health resta libero


def test_same_request_id_returns_the_cached_result():
    first = client.post("/optimize", json=spec(request_id="REQ-CACHE")).json()
    second = client.post("/optimize", json=spec(request_id="REQ-CACHE")).json()
    assert first == second
