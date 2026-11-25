import pytest

from p06_ai import objective
from p06_ai.checker import check_plan
from p06_ai.generator import FACTORY, PA, generate_instance
from p06_ai.teacher import solve
from test_dispatcher import make, plan_of


def weighted(inst, **w):
    full = {"makespan": 0.0, "weighted_tardiness": 0.0, "setup": 0.0, **w}
    return inst.model_copy(update={"objective_weights": full})


def teach(inst, **kw):
    sol = solve(inst, time_limit_s=kw.pop("time_limit_s", 5), workers=kw.pop("workers", 2), **kw)
    if sol.plan.status == "OK":
        assert check_plan(inst, sol.plan.assignments) == []
    return sol


def test_small_job_shop_is_solved_to_optimality():
    inst = make(["M1", "M2"], ["J1", "J2"], [
        ("A1", "J1", [(["M1"], 3)]), ("A2", "J1", [(["M2"], 2)]),
        ("B1", "J2", [(["M2"], 3)]), ("B2", "J2", [(["M1"], 2)]),
    ], precedences=[("A1", "A2"), ("B1", "B2")])
    sol = teach(inst)
    assert sol.solver_status == "OPTIMAL"
    assert sol.plan.solver == "CP_SAT"
    assert sol.plan.kpis.makespan_min == 5
    assert sol.gap == 0


def test_sequence_dependent_setups_are_respected():
    inst = make(["M1"], ["J1", "J2"], [("A", "J1", [(["M1"], 5)]), ("B", "J2", [(["M1"], 5)])],
                setup_times=[("M1", "A", "B", 10), ("M1", "B", "A", 1)])
    sol = teach(inst)
    plan = plan_of(sol.plan)
    assert plan["B"][0] == 0 and plan["A"][0] == 6
    assert sol.plan.kpis.total_setup_min == 1


def test_availability_windows():
    inst = make([{"id": "M1", "availability": [[0, 10], [20, 40]]}], ["J1", "J2"],
                [("A", "J1", [(["M1"], 8)]), ("B", "J2", [(["M1"], 8)])])
    sol = teach(inst)
    assert sorted(s for s, _, _ in plan_of(sol.plan).values()) == [0, 20]


def test_max_lag_is_enforced():
    inst = make(["M1", "M2"], ["J1", "J2"], [
        ("A", "J1", [(["M1"], 5)]), ("B", "J1", [(["M2"], 5)]),
        ("C", "J2", [(["M2"], 10)]),
    ], precedences=[("A", "B", {"max_lag_min": 0})])
    sol = teach(inst)
    plan = plan_of(sol.plan)
    assert plan["B"][0] == plan["A"][1]
    assert sol.plan.kpis.makespan_min == 15


def test_capacity_greater_than_one():
    inst = make([{"id": "R", "capacity": 2}], ["J1", "J2", "J3"],
                [(a, j, [(["R"], 10)]) for a, j in (("A", "J1"), ("B", "J2"), ("C", "J3"))])
    assert teach(inst).plan.kpis.makespan_min == 20


def test_tardiness_objective_uses_job_weights():
    inst = make(["M1"], [{"id": "J1", "due_min": 10, "weight": 3.0},
                         {"id": "J2", "due_min": 5, "weight": 1.0}],
                [("A", "J1", [(["M1"], 10)]), ("B", "J2", [(["M1"], 5)])])
    sol = teach(weighted(inst, weighted_tardiness=1.0))
    assert plan_of(sol.plan)["A"][0] == 0
    assert sol.plan.kpis.weighted_tardiness == 10


def test_plan_is_compacted_when_makespan_does_not_count():
    inst = make(["M1"], [{"id": "J1", "due_min": 100}], [("A", "J1", [(["M1"], 5)])])
    sol = teach(weighted(inst, weighted_tardiness=1.0))
    assert plan_of(sol.plan)["A"][0] == 0


def test_no_feasible_mode_gives_no_plan():
    inst = make(["M1"], ["J1"], [("A", "J1", [(["M1"], 5)], {"required_skills": ["weld"]})])
    sol = teach(inst)
    assert sol.plan.status == "INFEASIBLE" and sol.cost is None


@pytest.mark.parametrize("profile", [FACTORY, PA])
def test_never_worse_than_dispatching_rules(profile):
    inst = generate_instance(profile, 3)
    sol = teach(inst, time_limit_s=3)
    assert sol.solver_status in ("OPTIMAL", "FEASIBLE")
    assert sol.cost <= sol.hint_cost + 1e-9
    assert sol.lower_bound <= sol.cost + 1e-6


def test_cost_of_makespan_only_instance():
    inst = make(["M1"], ["J1", "J2"], [("A", "J1", [(["M1"], 4)]), ("B", "J2", [(["M1"], 6)])])
    sol = teach(inst)
    assert objective.makespan_lower_bound(inst) == 10
    assert sol.cost == pytest.approx(1.0)
