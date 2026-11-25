import json
import math
from collections import Counter

import pytest

from p06_ai import objective
from p06_ai.dataset import build, iter_groups, replay, split_of
from p06_ai.features import FEATURE_NAMES
from p06_ai.generator import FACTORY, PA, generate_instance
from p06_ai.rules import solve_edd
from p06_ai.teacher import TeacherSolution, solve


@pytest.fixture(scope="module")
def solved():
    out = []
    for profile, seed in ((FACTORY, 2), (PA, 2)):
        inst = generate_instance(profile, seed)
        out.append((inst, solve(inst, time_limit_s=3, workers=2)))
    return out


@pytest.mark.parametrize("which", [0, 1])
def test_replay_labels_one_candidate_per_step(solved, which):
    inst, sol = solved[which]
    rep = replay(inst, sol, "x")
    assert rep.steps == len(inst.activities)
    per_step = Counter()
    for row in rep.rows:
        per_step[row["step"]] += row["label"]
        assert all(math.isfinite(row[n]) for n in FEATURE_NAMES)
    assert set(per_step.values()) == {1}
    # Rigiocare il piano del teacher dà un piano vicino al suo costo.
    assert rep.replay_cost <= rep.teacher_cost * 1.1 + 1e-9


def test_replaying_a_dispatcher_plan_reproduces_it():
    inst = generate_instance(FACTORY, 5)
    res = solve_edd(inst)
    fake = TeacherSolution(dataset="t", instance="t", solver_status="FEASIBLE",
                           cost=objective.cost(inst, res.kpis), time_limit_s=0,
                           workers=1, seed=0, wall_s=0, plan=res)
    rep = replay(inst, fake, "x")
    assert rep.replay_cost == pytest.approx(rep.teacher_cost)


def test_split_is_deterministic_and_proportional():
    keys = [f"FACTORY/seed-{i}" for i in range(2000)]
    splits = [split_of(k, (0.7, 0.15, 0.15)) for k in keys]
    assert splits == [split_of(k, (0.7, 0.15, 0.15)) for k in keys]
    share = Counter(splits)
    assert abs(share["train"] / 2000 - 0.7) < 0.05
    assert abs(share["test"] / 2000 - 0.15) < 0.05


def test_build_end_to_end(tmp_path, solved):
    inst_dir, teach_dir = tmp_path / "inst", tmp_path / "teach"
    for i, (inst, sol) in enumerate(solved):
        for d, text in ((inst_dir, inst.to_json()), (teach_dir, sol.model_dump_json())):
            (d / "P").mkdir(parents=True, exist_ok=True)
            (d / "P" / f"i{i}.json").write_text(text, encoding="utf-8")
    (inst_dir / "P" / "orphan.json").write_text(solved[0][0].to_json(), encoding="utf-8")

    m = build(inst_dir, teach_dir, tmp_path / "ds", "v1", fractions=(1.0, 0.0, 0.0))
    assert m["stats"]["train"]["instances"] == 2
    assert m["filters"]["skipped"] == {"senza soluzione del teacher": 1}
    groups = list(iter_groups(tmp_path / "ds" / "v1" / "train.csv"))
    assert len(groups) == m["stats"]["train"]["groups"]
    assert all(sum(labels) == 1 and len(f[0]) == len(FEATURE_NAMES) for _, f, labels in groups)
    saved = json.loads((tmp_path / "ds" / "v1" / "manifest.json").read_text(encoding="utf-8"))
    assert saved["features"].keys() == set(FEATURE_NAMES)

    with pytest.raises(FileExistsError):
        build(inst_dir, teach_dir, tmp_path / "ds", "v1")
