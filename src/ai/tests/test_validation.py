from p06_ai.schema import Instance
from p06_ai.validation import validate_instance


def _instance(**overrides) -> Instance:
    doc = {
        "source": {"dataset": "test", "instance": "t"},
        "resources": [{"id": "R1", "skills": ["TAGLIO"]}, {"id": "R2"}],
        "jobs": [{"id": "J1"}],
        "activities": [
            {"id": "A1", "job_id": "J1", "modes": [{"resource_ids": ["R1"], "duration_min": 5}]},
            {"id": "A2", "job_id": "J1", "modes": [{"resource_ids": ["R2"], "duration_min": 3}]},
        ],
        "precedences": [{"from": "A1", "to": "A2"}],
    }
    doc.update(overrides)
    return Instance.model_validate(doc)


def _codes(inst: Instance) -> set[str]:
    return {i.code for i in validate_instance(inst)}


def test_valid_instance_has_no_issues():
    assert validate_instance(_instance()) == []


def test_cycle():
    inst = _instance(precedences=[{"from": "A1", "to": "A2"}, {"from": "A2", "to": "A1"}])
    assert _codes(inst) == {"CYCLIC_PRECEDENCE"}


def test_unknown_references():
    inst = _instance(
        activities=[{"id": "A1", "job_id": "J9",
                     "modes": [{"resource_ids": ["R9"], "duration_min": 1}]}],
        precedences=[{"from": "A1", "to": "A7"}],
        setup_times=[{"resource_id": "R8", "from_activity": "A1",
                      "to_activity": "A6", "duration_min": 2}],
    )
    assert _codes(inst) == {"UNKNOWN_JOB", "UNKNOWN_RESOURCE", "UNKNOWN_ACTIVITY",
                            "NO_FEASIBLE_MODE"}


def test_missing_skill_means_no_feasible_mode():
    inst = _instance(activities=[
        {"id": "A1", "job_id": "J1", "required_skills": ["TORNITURA"],
         "modes": [{"resource_ids": ["R1"], "duration_min": 5}]},
    ], precedences=[])
    assert _codes(inst) == {"NO_FEASIBLE_MODE"}


def test_overlapping_windows_and_duplicates():
    inst = _instance(resources=[
        {"id": "R1", "availability": [[0, 100], [50, 200]]},
        {"id": "R2"}, {"id": "R2"},
    ])
    assert _codes(inst) == {"INVALID_WINDOW", "DUPLICATE_ID"}
