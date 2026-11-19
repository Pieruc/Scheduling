import csv
import json
import os
from pathlib import Path

import pytest

from p06_ai.baselines import evaluate, main
from p06_ai.checker import check_plan
from p06_ai.converters.jsp import convert_file as convert_jsp
from p06_ai.converters.fjsp import convert_file as convert_fjs
from p06_ai.converters._common import load_jsplib_metadata
from p06_ai.generator import FACTORY, PA, generate_instance
from p06_ai.rules import solve_atc, solve_edd

SOLVERS = [solve_edd, solve_atc]


@pytest.mark.parametrize("profile", [FACTORY, PA], ids=lambda p: p.code)
@pytest.mark.parametrize("solve", SOLVERS, ids=["EDD", "ATC"])
def test_generated_instances_get_feasible_plans(profile, solve):
    for seed in range(25):
        inst = generate_instance(profile, seed)
        res = solve(inst)
        assert res.status == "OK", (seed, res.warnings)
        assert check_plan(inst, res.assignments) == [], seed
        assert len(res.assignments) == len(inst.activities)
        assert res.kpis.makespan_min > 0


def _dataset_root() -> Path:
    default = Path(__file__).resolve().parents[4] / "Dataset"
    return Path(os.environ.get("P06_DATASET_DIR", default))


def test_jsplib_makespan_never_below_known_bounds():
    root = _dataset_root() / "JSPLIB"
    if not root.is_dir():
        pytest.skip("JSPLIB non presente")
    known = load_jsplib_metadata(root / "instances.json")
    checked = 0
    for name, best in known.items():
        inst = convert_jsp(root / "instances" / name, dataset="JSPLIB")
        if len(inst.activities) > 300:   # le più grandi rallentano i test
            continue
        bound = best.lower_bound
        for solve in SOLVERS:
            res = solve(inst)
            assert res.status == "OK" and check_plan(inst, res.assignments) == [], name
            assert res.kpis.makespan_min >= bound, (name, res.solver)
        checked += 1
    assert checked > 50


def test_brandimarte_plans_are_feasible():
    root = _dataset_root() / "Job_Shop_Scheduling_Benchmark_Environments_and_Instances" \
        / "data" / "fjsp" / "brandimarte"
    if not root.is_dir():
        pytest.skip("Brandimarte non presente")
    for path in sorted(root.glob("*.fjs")):
        inst = convert_fjs(path, dataset="brandimarte")
        for solve in SOLVERS:
            res = solve(inst)
            assert res.status == "OK", path
            assert check_plan(inst, res.assignments) == [], path


def test_cli_writes_csv(tmp_path, capsys):
    folder = tmp_path / "inst"
    folder.mkdir()
    for seed in range(2):
        (folder / f"s{seed}.json").write_text(generate_instance(FACTORY, seed).to_json(),
                                              encoding="utf-8")
    out = tmp_path / "res.csv"
    assert main([str(folder), "--csv", str(out)]) == 0
    rows = list(csv.DictReader(out.open(encoding="utf-8")))
    assert len(rows) == 4 and {r["rule"] for r in rows} == {"EDD", "ATC"}
    assert all(r["status"] == "OK" for r in rows)
    assert "synthetic/FACTORY" in capsys.readouterr().out
    assert main([str(tmp_path / "vuota")]) == 1


def test_gap_uses_best_known(tmp_path):
    inst = generate_instance(FACTORY, 0)
    doc = json.loads(inst.to_json())
    doc["source"]["best_known"] = {"makespan": 100, "optimal": True}
    path = tmp_path / "x.json"
    path.write_text(json.dumps(doc), encoding="utf-8")
    row = evaluate([path], ["EDD"])[0]
    assert row["gap"] == round((row["makespan"] - 100) / 100, 4)


@pytest.mark.parametrize("profile", [FACTORY, PA], ids=lambda p: p.code)
def test_due_dates_are_tight_enough_to_matter(profile):
    # Se quasi tutte le istanze hanno ritardo zero, non insegnano nulla sul ritardo.
    seeds = range(60)
    on_time = sum(solve_edd(generate_instance(profile, s)).kpis.weighted_tardiness == 0
                  for s in seeds)
    assert on_time < 0.3 * len(seeds)
