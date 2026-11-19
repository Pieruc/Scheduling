import pytest

from p06_ai.checker import check_plan
from p06_ai.plan import Assignment
from p06_ai.schema import Instance

INSTANCE = Instance.model_validate({
    "source": {"dataset": "test", "instance": "t"},
    "resources": [{"id": "M1", "availability": [[0, 100]]}, {"id": "M2"},
                  {"id": "R", "capacity": 2}],
    "jobs": [{"id": "J1", "release_min": 5}, {"id": "J2"}],
    "activities": [
        {"id": "A", "job_id": "J1", "modes": [{"resource_ids": ["M1"], "duration_min": 10}]},
        {"id": "B", "job_id": "J1", "modes": [{"resource_ids": ["M2"], "duration_min": 5}]},
        {"id": "C", "job_id": "J2", "modes": [{"resource_ids": ["M1"], "duration_min": 10},
                                               {"resource_ids": ["R"], "duration_min": 4}]},
    ],
    "precedences": [{"from": "A", "to": "B", "min_lag_min": 2, "max_lag_min": 20}],
    "setup_times": [{"resource_id": "M1", "from_activity": "A", "to_activity": "C",
                     "duration_min": 3}],
})

VALID = {
    "A": dict(mode_index=0, resource_ids=["M1"], start_min=5, end_min=15),
    "B": dict(mode_index=0, resource_ids=["M2"], start_min=17, end_min=22),
    "C": dict(mode_index=0, resource_ids=["M1"], start_min=18, end_min=28),
}


def plan(**changes):
    rows = {k: dict(v) for k, v in VALID.items()}
    for aid, upd in changes.items():
        if upd is None:
            del rows[aid]
        else:
            rows[aid].update(upd)
    return [Assignment(activity_id=aid, **row) for aid, row in rows.items()]


def test_valid_plan():
    assert check_plan(INSTANCE, plan()) == []


@pytest.mark.parametrize("changes, fragment", [
    ({"A": {"start_min": 0, "end_min": 10}}, "rilascio"),
    ({"B": {"start_min": 16, "end_min": 21}}, "distanza 1 < 2"),
    ({"B": {"start_min": 40, "end_min": 45}}, "distanza 25 > 20"),
    ({"C": {"start_min": 16, "end_min": 26}}, "setup incluso"),
    ({"C": {"start_min": 95, "end_min": 105}}, "finestre"),
    ({"C": {"end_min": 30}}, "durata 12"),
    ({"C": {"resource_ids": ["M2"]}}, "diverse da quelle del modo"),
    ({"C": {"mode_index": 5}}, "inesistente"),
    ({"C": None}, "non assegnate"),
])
def test_violations_are_detected(changes, fragment):
    errors = check_plan(INSTANCE, plan(**changes))
    assert any(fragment in e for e in errors), errors


def test_duplicate_assignment():
    rows = plan()
    assert any("più volte" in e for e in check_plan(INSTANCE, rows + [rows[0]]))


def test_capacity_above_one():
    extra = Instance.model_validate({
        **INSTANCE.model_dump(by_alias=True),
        "activities": [
            {"id": f"X{i}", "job_id": "J2",
             "modes": [{"resource_ids": ["R"], "duration_min": 4}]} for i in range(3)],
        "precedences": [], "setup_times": [],
    })
    two = [Assignment(activity_id=f"X{i}", mode_index=0, resource_ids=["R"],
                      start_min=s, end_min=s + 4) for i, s in enumerate((0, 0, 4))]
    assert check_plan(extra, two) == []
    three = [a.model_copy(update={"start_min": 0, "end_min": 4}) for a in two]
    assert any("capacità 2" in e for e in check_plan(extra, three))
