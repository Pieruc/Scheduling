import pytest

from p06_ai.checker import check_plan
from p06_ai.dispatcher import Dispatcher, run
from p06_ai.rules import atc, atc_index, edd, solve_atc, solve_edd
from p06_ai.schema import Instance


def make(resources, jobs, activities, precedences=(), setup_times=()) -> Instance:
    return Instance.model_validate({
        "source": {"dataset": "test", "instance": "t"},
        "resources": [r if isinstance(r, dict) else {"id": r} for r in resources],
        "jobs": [j if isinstance(j, dict) else {"id": j} for j in jobs],
        "activities": [
            {"id": aid, "job_id": job,
             "modes": [{"resource_ids": rids, "duration_min": d} for rids, d in modes],
             **extra}
            for aid, job, modes, *rest in activities for extra in [rest[0] if rest else {}]
        ],
        "precedences": [{"from": a, "to": b, **(x[0] if x else {})}
                        for a, b, *x in precedences],
        "setup_times": [{"resource_id": r, "from_activity": a, "to_activity": b,
                         "duration_min": d} for r, a, b, d in setup_times],
    })


def plan_of(result):
    return {a.activity_id: (a.start_min, a.end_min, a.resource_ids) for a in result.assignments}


@pytest.mark.parametrize("solve", [solve_edd, solve_atc])
def test_chain_and_shared_machine(solve):
    inst = make(["M1", "M2"], ["J1", "J2"], [
        ("A1", "J1", [(["M1"], 10)]),
        ("A2", "J1", [(["M2"], 5)]),
        ("B1", "J2", [(["M1"], 4)]),
    ], precedences=[("A1", "A2")])
    res = solve(inst)
    assert res.status == "OK"
    assert check_plan(inst, res.assignments) == []
    plan = plan_of(res)
    assert plan["A2"][0] >= plan["A1"][1]
    assert res.kpis.makespan_min == max(e for _, e, _ in plan.values())


def test_edd_orders_by_due_date():
    inst = make(["M1"], [{"id": "J1", "due_min": 30}, {"id": "J2", "due_min": 10},
                         {"id": "J3", "due_min": 20}],
                [("A", "J1", [(["M1"], 5)]), ("B", "J2", [(["M1"], 5)]),
                 ("C", "J3", [(["M1"], 5)])])
    plan = plan_of(solve_edd(inst))
    assert [plan[a][0] for a in ("B", "C", "A")] == [0, 5, 10]


def test_kpis_tardiness():
    inst = make(["M1"], [{"id": "J1", "due_min": 5, "weight": 2.0},
                         {"id": "J2", "due_min": 100}],
                [("A", "J1", [(["M1"], 10)]), ("B", "J2", [(["M1"], 10)])])
    k = solve_edd(inst).kpis
    assert (k.makespan_min, k.weighted_tardiness, k.late_jobs) == (20, 10.0, 1)
    assert k.avg_utilization == 1.0


def test_atc_without_due_dates_is_wspt():
    inst = make(["M1"], ["J1", "J2", {"id": "J3", "weight": 10.0}],
                [("A", "J1", [(["M1"], 10)]), ("B", "J2", [(["M1"], 5)]),
                 ("C", "J3", [(["M1"], 20)])])
    plan = plan_of(solve_atc(inst))
    # w/p: C = 0.5, B = 0.2, A = 0.1
    assert [plan[a][0] for a in ("C", "B", "A")] == [0, 20, 25]


def test_atc_prefers_urgent_job():
    inst = make(["M1"], [{"id": "J1", "due_min": 1000}, {"id": "J2", "due_min": 12}],
                [("A", "J1", [(["M1"], 10)]), ("B", "J2", [(["M1"], 10)])])
    disp = Dispatcher(inst)
    cands = disp.candidates()
    p_mean = disp.mean_remaining_duration()
    a, b = sorted(cands, key=lambda c: c.activity_id)
    assert atc_index(disp, b, 2.0, p_mean) > atc_index(disp, a, 2.0, p_mean)
    assert atc(disp, cands).activity_id == "B"


def test_release_and_min_lag():
    inst = make(["M1", "M2"], [{"id": "J1", "release_min": 7}], [
        ("A", "J1", [(["M1"], 3)]),
        ("B", "J1", [(["M2"], 2)]),
    ], precedences=[("A", "B", {"min_lag_min": 4})])
    plan = plan_of(solve_edd(inst))
    assert plan["A"][:2] == (7, 10)
    assert plan["B"][:2] == (14, 16)


def test_flexible_mode_picks_free_machine():
    inst = make(["M1", "M2"], [{"id": "J1", "due_min": 1}, "J2"], [
        ("A", "J1", [(["M1"], 50)]),
        ("B", "J2", [(["M1"], 10), (["M2"], 20)]),
    ])
    plan = plan_of(solve_edd(inst))
    assert plan["A"] == (0, 50, ["M1"])
    assert plan["B"] == (0, 20, ["M2"])


def test_sequence_dependent_setup():
    inst = make(["M1"], [{"id": "J1", "due_min": 1}, {"id": "J2", "due_min": 2}],
                [("A", "J1", [(["M1"], 10)]), ("B", "J2", [(["M1"], 10)])],
                setup_times=[("M1", "A", "B", 7), ("M1", "B", "A", 1)])
    res = solve_edd(inst)
    assert plan_of(res)["B"][:2] == (17, 27)
    assert res.kpis.total_setup_min == 7
    assert check_plan(inst, res.assignments) == []


def test_availability_windows():
    inst = make([{"id": "M1", "availability": [[0, 10], [20, 100]]}], ["J1"],
                [("A", "J1", [(["M1"], 15)])])
    assert plan_of(solve_edd(inst))["A"][:2] == (20, 35)


def test_mode_with_two_resources_waits_for_both():
    inst = make(["M1", "M2"], [{"id": "J1", "due_min": 1}, "J2"], [
        ("A", "J1", [(["M2"], 30)]),
        ("B", "J2", [(["M1", "M2"], 5)]),
    ])
    res = solve_edd(inst)
    assert plan_of(res)["B"][:2] == (30, 35)
    assert check_plan(inst, res.assignments) == []


def test_capacity_two():
    inst = make([{"id": "R", "capacity": 2}], ["J1", "J2", "J3"],
                [(a, j, [(["R"], 10)]) for a, j in (("A", "J1"), ("B", "J2"), ("C", "J3"))])
    res = solve_edd(inst)
    assert sorted(s for s, _, _ in plan_of(res).values()) == [0, 0, 10]
    assert check_plan(inst, res.assignments) == []


def test_skills_exclude_unqualified_modes():
    inst = make([{"id": "P1", "type": "PERSON", "skills": ["X"]},
                 {"id": "P2", "type": "PERSON", "skills": ["Y"]}], ["J1"],
                [("A", "J1", [(["P2"], 1), (["P1"], 50)], {"required_skills": ["X"]})])
    assert plan_of(solve_edd(inst))["A"][2] == ["P1"]


def test_windows_too_short_is_infeasible():
    inst = make([{"id": "M1", "availability": [[0, 10]]}], ["J1"],
                [("A", "J1", [(["M1"], 15)])])
    res = solve_edd(inst)
    assert res.status == "INFEASIBLE"
    assert res.assignments == [] and res.kpis is None
    assert "A" in res.warnings[0]


def test_violated_max_lag_is_reported_infeasible():
    # Dopo A, EDD sceglie C (due più vicina): B parte 5 minuti dopo A, ma max_lag è 0.
    inst = make(["M1"], [{"id": "J1", "due_min": 100}, {"id": "J2", "due_min": 50}], [
        ("A", "J1", [(["M1"], 10)]),
        ("B", "J1", [(["M1"], 5)]),
        ("C", "J2", [(["M1"], 5)], {}),
    ], precedences=[("A", "B", {"max_lag_min": 0})])
    # C deve essere pronto solo dopo A: lo rilascio a 10.
    inst.jobs[1].release_min = 10
    res = solve_edd(inst)
    assert res.status == "INFEASIBLE"
    assert any("distanza" in w for w in res.warnings)


def test_stale_candidate_is_rejected():
    inst = make(["M1"], ["J1", "J2"], [("A", "J1", [(["M1"], 1)]), ("B", "J2", [(["M1"], 1)])])
    disp = Dispatcher(inst)
    first, second = disp.candidates()
    disp.apply(first)
    with pytest.raises(ValueError):
        disp.apply(second)


def test_invalid_instance_is_rejected():
    inst = make(["M1"], ["J1"], [("A", "J1", [(["M1"], 1)]), ("B", "J1", [(["M1"], 1)])],
                precedences=[("A", "B"), ("B", "A")])
    with pytest.raises(ValueError):
        Dispatcher(inst)


def test_active_candidates_skip_needless_idle():
    # B potrebbe finire a 5 su M1; A partirebbe solo a 20 (rilascio): non è nel set attivo.
    inst = make(["M1"], [{"id": "J1", "release_min": 20, "due_min": 21}, "J2"],
                [("A", "J1", [(["M1"], 5)]), ("B", "J2", [(["M1"], 5)])])
    disp = Dispatcher(inst)
    assert [c.activity_id for c in disp.candidates()] == ["B"]
    assert {c.activity_id for c in disp.candidates(active_only=False)} == {"A", "B"}


def test_run_with_custom_rule_is_deterministic():
    inst = make(["M1", "M2"], ["J1", "J2"], [
        ("A", "J1", [(["M1"], 3), (["M2"], 3)]), ("B", "J2", [(["M1"], 3), (["M2"], 3)])])
    first = run(inst, lambda d, cs: cs[-1], "EDD")
    assert first == run(inst, lambda d, cs: cs[-1], "EDD").model_copy(
        update={"timing_ms": first.timing_ms})


def test_atc_picks_earliest_completing_mode():
    # Caso trovato nell'esempio del report: dopo J2 su M2, per J1-A2 il modo su M1
    # finisce a 109 (in orario), quello su M2 a 166 (in ritardo). Va scelto M1.
    inst = make(["M1", "M2"],
                [{"id": "J1", "release_min": 31, "due_min": 155},
                 {"id": "J2", "release_min": 8, "due_min": 163, "weight": 3.0}], [
        ("J1-A1", "J1", [(["M1"], 32), (["M2"], 40)]),
        ("J1-A2", "J1", [(["M1"], 46), (["M2"], 59)]),
        ("J2-A1", "J2", [(["M2"], 46)]),
        ("J2-A2", "J2", [(["M2"], 53)]),
    ], precedences=[("J1-A1", "J1-A2"), ("J2-A1", "J2-A2")])
    res = solve_atc(inst)
    assert plan_of(res)["J1-A2"] == (63, 109, ["M1"])
    assert res.kpis.late_jobs == 0
