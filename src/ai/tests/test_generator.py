import json

import pytest

from p06_ai.calibration import calibrate, instance_stats
from p06_ai.converters.fjsp import parse_fjs
from p06_ai.generator import (FACTORY, PA, PROFILES, Profile, generate_dataset,
                              generate_instance, main)
from p06_ai.schema import Instance
from p06_ai.validation import validate_instance

SEEDS = range(40)


@pytest.mark.parametrize("profile", [FACTORY, PA], ids=lambda p: p.code)
def test_same_seed_same_instance(profile):
    assert generate_instance(profile, 7).to_json() == generate_instance(profile, 7).to_json()
    assert generate_instance(profile, 7).to_json() != generate_instance(profile, 8).to_json()


@pytest.mark.parametrize("profile", [FACTORY, PA], ids=lambda p: p.code)
def test_instances_are_valid_and_within_profile(profile):
    for seed in SEEDS:
        inst = generate_instance(profile, seed)
        assert validate_instance(inst) == [], seed
        stats = instance_stats(inst)
        for key in ("n_jobs", "n_resources", "activities_per_job"):
            lo, hi = getattr(profile, key)
            assert lo <= min(stats[key]) and max(stats[key]) <= hi, (seed, key)
        assert min(stats["duration"]) >= 1
        assert inst.domain_profile == profile.code
        assert all(r.type == profile.resource_type for r in inst.resources)
        for job in inst.jobs:
            assert job.due_min > job.release_min >= 0
            assert job.weight in profile.job_weights


@pytest.mark.parametrize("profile", [FACTORY, PA], ids=lambda p: p.code)
def test_objective_weights(profile):
    for seed in SEEDS:
        inst = generate_instance(profile, seed)
        w = inst.objective_weights
        assert set(w) == {"makespan", "weighted_tardiness", "setup"}
        assert sum(w.values()) == pytest.approx(1.0, abs=1e-9)
        assert all(v >= 0 for v in w.values())
        # Senza setup nell'istanza, il peso del setup non ha senso.
        if not inst.setup_times:
            assert w["setup"] == 0.0


def test_factory_has_flexibility_and_setups():
    instances = [generate_instance(FACTORY, s) for s in SEEDS]
    with_setup = [i for i in instances if i.setup_times]
    assert 0 < len(with_setup) < len(instances)        # setup_prob = 0.5
    assert any(len(a.modes) > 1 for i in instances for a in i.activities)
    for inst in instances:
        # Job shop: ogni job è una catena.
        assert len(inst.precedences) == len(inst.activities) - len(inst.jobs)
        families = {a.id: a.features.get("family") for a in inst.activities}
        eligible = {a.id: {m.resource_ids[0] for m in a.modes} for a in inst.activities}
        for s in inst.setup_times:
            assert families[s.from_activity] != families[s.to_activity]
            assert s.resource_id in eligible[s.from_activity] & eligible[s.to_activity]


def test_pa_uses_skills_and_branches():
    instances = [generate_instance(PA, s) for s in SEEDS]
    branched = 0
    for inst in instances:
        assert not inst.setup_times
        skills = {r.id: set(r.skills) for r in inst.resources}
        assert all(skills.values())
        for a in inst.activities:
            assert len(a.required_skills) == 1
            capable = {r for r, owned in skills.items() if a.required_skills[0] in owned}
            assert {m.resource_ids[0] for m in a.modes} == capable
        fan_out: dict[str, int] = {}
        for p in inst.precedences:
            fan_out[p.from_] = fan_out.get(p.from_, 0) + 1
        branched += any(n > 1 for n in fan_out.values())
    assert branched > 0


def test_invalid_profile_is_rejected():
    with pytest.raises(ValueError):
        Profile.model_validate({**FACTORY.model_dump(), "n_jobs": (10, 5)})
    with pytest.raises(ValueError):
        Profile.model_validate({**FACTORY.model_dump(), "objective_alpha": {"makespan": 1}})


def test_generate_dataset_and_cli(tmp_path):
    assert generate_dataset(PA, tmp_path, count=3, first_seed=5) == 3
    files = sorted(p.name for p in (tmp_path / "PA").iterdir())
    assert files == ["seed-5.json", "seed-6.json", "seed-7.json"]
    inst = Instance.model_validate_json((tmp_path / "PA" / "seed-5.json").read_text("utf-8"))
    assert inst == generate_instance(PA, 5)

    custom = tmp_path / "custom.json"
    custom.write_text(json.dumps({**FACTORY.model_dump(), "code": "MINI",
                                  "n_jobs": [2, 2]}), encoding="utf-8")
    assert main(["--profile-file", str(custom), "--count", "2", "--out", str(tmp_path)]) == 0
    mini = json.loads((tmp_path / "MINI" / "seed-0.json").read_text("utf-8"))
    assert len(mini["jobs"]) == 2

    custom.write_text("{}", encoding="utf-8")
    assert main(["--profile-file", str(custom), "--out", str(tmp_path)]) == 1


def test_calibration_narrows_profile_to_observed_data():
    # 2 job, 3 macchine; attività per job 2 e 1; alternative 2,1,1; durate 5,7,4,6.
    inst = parse_fjs("2 3\n2 2 1 5 2 7 1 3 4\n1 1 2 6\n", dataset="t", instance="mini")
    tuned = calibrate(FACTORY, [inst])
    assert tuned.n_jobs == (2, 2)
    assert tuned.n_resources == (3, 3)
    assert tuned.activities_per_job == (1, 2)
    assert tuned.alternatives == (1, 2)
    assert tuned.duration == (4, 7)
    # Ciò che i benchmark non contengono resta quello del profilo di partenza.
    assert tuned.due_tightness == FACTORY.due_tightness
    assert tuned.setup_prob == FACTORY.setup_prob
    generated = generate_instance(tuned, 1)
    assert validate_instance(generated) == []
    assert len(generated.jobs) == 2 and len(generated.resources) == 3
    with pytest.raises(ValueError):
        calibrate(FACTORY, [])


def test_profiles_registry():
    assert set(PROFILES) == {"FACTORY", "PA"}
