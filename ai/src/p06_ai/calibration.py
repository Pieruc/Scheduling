"""Taratura del generatore sulle istanze convertite.

Misura le istanze di un dataset e restringe gli intervalli di un profilo al
5°-95° percentile di ciò che osserva. Tara solo ciò che i benchmark contengono
davvero (dimensioni, flessibilità, durate): due date, pesi e setup restano
quelli del profilo di partenza.

Uso da riga di comando:
    python -m p06_ai.calibration <cartella di istanze JSON> --profile FACTORY
        [--out profilo.json]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .generator import PROFILES, Profile
from .schema import Instance


def instance_stats(inst: Instance) -> dict[str, list[int]]:
    per_job: dict[str, int] = {}
    for act in inst.activities:
        per_job[act.job_id] = per_job.get(act.job_id, 0) + 1
    return {
        "n_jobs": [len(inst.jobs)],
        "n_resources": [len(inst.resources)],
        "activities_per_job": list(per_job.values()),
        "alternatives": [len(a.modes) for a in inst.activities],
        "duration": [m.duration_min for a in inst.activities for m in a.modes
                     if m.duration_min is not None],
    }


def _percentile_range(values: list[int], low: float = 0.05,
                      high: float = 0.95) -> tuple[int, int]:
    ordered = sorted(values)
    last = len(ordered) - 1
    return ordered[round(low * last)], ordered[round(high * last)]


def calibrate(base: Profile, instances: list[Instance]) -> Profile:
    if not instances:
        raise ValueError("nessuna istanza su cui tarare")
    pooled: dict[str, list[int]] = {}
    for inst in instances:
        for key, values in instance_stats(inst).items():
            pooled.setdefault(key, []).extend(values)
    update = {key: _percentile_range(values) for key, values in pooled.items() if values}
    update["duration"] = (max(1, update["duration"][0]), max(1, update["duration"][1]))
    return Profile.model_validate({**base.model_dump(), **update})


def load_instances(folder: Path) -> list[Instance]:
    return [Instance.model_validate_json(p.read_text(encoding="utf-8"))
            for p in sorted(folder.rglob("*.json"))]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Tara un profilo su istanze convertite")
    ap.add_argument("input", type=Path, help="cartella di istanze JSON")
    ap.add_argument("--profile", choices=sorted(PROFILES), required=True,
                    help="profilo di partenza")
    ap.add_argument("--out", type=Path, help="file JSON del profilo tarato")
    args = ap.parse_args(argv)
    if not args.input.is_dir():
        ap.error(f"{args.input} non è una cartella")
    instances = load_instances(args.input)
    if not instances:
        print(f"Nessun file .json in {args.input}", file=sys.stderr)
        return 1
    profile = calibrate(PROFILES[args.profile], instances)
    text = json.dumps(profile.model_dump(), indent=2)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
        print(f"Profilo tarato su {len(instances)} istanze scritto in {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
