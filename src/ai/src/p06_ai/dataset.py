"""Dataset Builder: trasforma i piani del teacher CP-SAT in esempi per la policy M2.

Per ogni istanza risolta dal teacher il piano viene "rigiocato" nel Dispatcher.
A ogni passo:

- il Dispatcher propone i candidati (gli stessi che vedrà la policy online);
- l'etichetta 1 va al candidato che imita il teacher: l'attività che il teacher
  fa iniziare per prima tra quelle candidate, col modo scelto dal teacher (se
  quel modo non è tra i candidati, il modo che finisce prima); tutti gli altri
  candidati hanno etichetta 0;
- si applica il candidato etichettato e si passa al passo successivo.

Ogni passo è un gruppo (una "query" del ranking): il modello impara a mettere
in cima il candidato del teacher. Il piano ottenuto rigiocando è il massimo che
un imitatore perfetto può raggiungere: il suo costo (``replay_cost``) è salvato
nel manifest insieme a quello del teacher.

Lo split train/validation/test è per istanza (mai passi della stessa istanza in
split diversi) e deterministico: dipende solo da nome dell'istanza e seme.

Uso da riga di comando:
    python -m p06_ai.dataset --instances <cartella istanze> --teacher <cartella
        soluzioni> --out <cartella dataset> --version v1 [--max-gap 0.5]
        [--split 0.7 0.15 0.15] [--split-seed 0] [--overwrite]

Risultato in <out>/<version>/: train.csv, val.csv, test.csv, manifest.json.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Iterator

from . import objective
from .checker import check_plan
from .dispatcher import Dispatcher
from .features import FEATURE_NAMES, FEATURES, FeatureContext, candidate_features
from .plan import compute_kpis
from .schema import Instance
from .teacher import TeacherSolution

DATASET_FORMAT = "1.0"
META_COLUMNS = ["instance", "step", "activity_id", "mode_index", "label", "teacher_rank"]
SPLITS = ("train", "val", "test")


@dataclass
class Replay:
    rows: list[dict]          # una riga per candidato, tutti i passi
    steps: int
    replay_cost: float
    teacher_cost: float
    trivial_steps: int        # passi con un solo candidato


def replay(inst: Instance, sol: TeacherSolution, key: str) -> Replay:
    """Rigioca il piano del teacher nel Dispatcher ed etichetta ogni passo."""
    plan = {a.activity_id: a for a in sol.plan.assignments}
    if set(plan) != {a.id for a in inst.activities}:
        raise ValueError(f"{key}: il piano del teacher non copre tutte le attività")
    disp = Dispatcher(inst)
    ctx = FeatureContext(inst)
    rows: list[dict] = []
    trivial = 0
    while not disp.done:
        cands = disp.candidates()
        if not cands:
            raise ValueError(f"{key}: il Dispatcher si blocca al passo {disp.step}")
        feats = candidate_features(disp, cands, ctx)

        def teacher_key(c):
            t = plan[c.activity_id]
            return (t.start_min, t.end_min, c.mode_index != t.mode_index, c.end_min,
                    c.mode_index, disp.order(c.activity_id))
        chosen = min(range(len(cands)), key=lambda i: teacher_key(cands[i]))
        starts = sorted({plan[c.activity_id].start_min for c in cands})
        trivial += len(cands) == 1
        for i, (c, f) in enumerate(zip(cands, feats)):
            rows.append({"instance": key, "step": disp.step, "activity_id": c.activity_id,
                         "mode_index": c.mode_index, "label": int(i == chosen),
                         "teacher_rank": starts.index(plan[c.activity_id].start_min),
                         **{n: round(v, 6) for n, v in zip(FEATURE_NAMES, f)}})
        disp.apply(cands[chosen])

    assignments = disp.assignments
    violations = check_plan(inst, assignments)
    if violations:
        raise ValueError(f"{key}: piano rigiocato non ammissibile: {violations[0]}")
    kpis = compute_kpis(inst, assignments, disp.total_setup_min)
    scale = objective.scales(inst)
    teacher_cost = sol.cost if sol.cost is not None else objective.cost(inst, sol.plan.kpis, scale)
    return Replay(rows=rows, steps=disp.step, replay_cost=objective.cost(inst, kpis, scale),
                  teacher_cost=teacher_cost, trivial_steps=trivial)


def split_of(key: str, fractions: tuple[float, float, float], seed: int = 0) -> str:
    """Split deterministico dal nome: aggiungere istanze non sposta le altre."""
    h = hashlib.sha256(f"{seed}|{key}".encode()).digest()
    u = int.from_bytes(h[:8], "big") / 2 ** 64
    if u < fractions[0]:
        return "train"
    return "val" if u < fractions[0] + fractions[1] else "test"


def iter_groups(csv_path: Path) -> Iterator[tuple[str, list[list[float]], list[int]]]:
    """Legge un file del dataset un passo alla volta: (gruppo, feature, etichette)."""
    with csv_path.open(newline="", encoding="utf-8") as fh:
        group, feats, labels = None, [], []
        for row in csv.DictReader(fh):
            g = f"{row['instance']}#{row['step']}"
            if g != group and group is not None:
                yield group, feats, labels
                feats, labels = [], []
            group = g
            feats.append([float(row[n]) for n in FEATURE_NAMES])
            labels.append(int(row["label"]))
        if group is not None:
            yield group, feats, labels


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def build(instances: Path, teacher: Path, out: Path, version: str,
          fractions: tuple[float, float, float] = (0.7, 0.15, 0.15), split_seed: int = 0,
          max_gap: float | None = None, overwrite: bool = False) -> dict:
    target = out / version
    if target.exists():
        if not overwrite:
            raise FileExistsError(f"{target} esiste già: usa un'altra versione o --overwrite")
        shutil.rmtree(target)
    target.mkdir(parents=True)

    files = {s: (target / f"{s}.csv").open("w", newline="", encoding="utf-8") for s in SPLITS}
    writers = {s: csv.DictWriter(fh, fieldnames=META_COLUMNS + FEATURE_NAMES)
               for s, fh in files.items()}
    for w in writers.values():
        w.writeheader()

    entries, skipped = [], Counter()
    try:
        for path in sorted(instances.rglob("*.json")):
            rel = path.relative_to(instances)
            sol_path = teacher / rel
            if not sol_path.exists():
                skipped["senza soluzione del teacher"] += 1
                continue
            sol = TeacherSolution.model_validate_json(sol_path.read_text(encoding="utf-8"))
            if sol.plan.status != "OK":
                skipped[f"teacher {sol.solver_status}"] += 1
                continue
            if max_gap is not None and (sol.gap or 0) > max_gap:
                skipped[f"gap oltre {max_gap:.0%}"] += 1
                continue
            inst = Instance.model_validate_json(path.read_text(encoding="utf-8"))
            key = rel.with_suffix("").as_posix()
            rep = replay(inst, sol, key)
            split = split_of(key, fractions, split_seed)
            writers[split].writerows(rep.rows)
            entries.append({"key": key, "split": split, "profile": inst.domain_profile,
                            "teacher_status": sol.solver_status, "gap": sol.gap,
                            "teacher_cost": rep.teacher_cost, "hint_cost": sol.hint_cost,
                            "replay_cost": rep.replay_cost, "steps": rep.steps,
                            "rows": len(rep.rows), "trivial_steps": rep.trivial_steps})
    finally:
        for fh in files.values():
            fh.close()

    stats = {}
    for s in SPLITS:
        items = [e for e in entries if e["split"] == s]
        stats[s] = {"instances": len(items), "groups": sum(e["steps"] for e in items),
                    "rows": sum(e["rows"] for e in items),
                    "sha256": _sha256(target / f"{s}.csv")}
    ratios = [e["replay_cost"] / e["teacher_cost"] for e in entries if e["teacher_cost"]]
    manifest = {
        "format": DATASET_FORMAT, "version": version,
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": {"instances": instances.as_posix(), "teacher": teacher.as_posix()},
        "split": {"fractions": dict(zip(SPLITS, fractions)), "seed": split_seed,
                  "by": "istanza (sha256 di seme|nome)"},
        "filters": {"max_gap": max_gap, "skipped": dict(skipped)},
        "label": "1 al candidato che imita il teacher (attività che il teacher inizia "
                 "prima, col suo modo), 0 agli altri; un gruppo = (instance, step)",
        "features": FEATURES,
        "stats": stats,
        "replay_vs_teacher_cost": round(mean(ratios), 4) if ratios else None,
        "instances": entries,
    }
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False),
                                          encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Costruisce il dataset di imitazione per M2")
    ap.add_argument("--instances", type=Path, required=True, help="cartella delle istanze")
    ap.add_argument("--teacher", type=Path, required=True,
                    help="cartella delle soluzioni del teacher (stessa struttura)")
    ap.add_argument("--out", type=Path, required=True, help="cartella dei dataset")
    ap.add_argument("--version", required=True, help="nome della versione, es. v1")
    ap.add_argument("--split", type=float, nargs=3, default=(0.7, 0.15, 0.15),
                    metavar=("TRAIN", "VAL", "TEST"))
    ap.add_argument("--split-seed", type=int, default=0)
    ap.add_argument("--max-gap", type=float, help="scarta le soluzioni con gap più alto")
    ap.add_argument("--overwrite", action="store_true")
    args = ap.parse_args(argv)
    if abs(sum(args.split) - 1) > 1e-9 or min(args.split) < 0:
        ap.error("--split: tre quote non negative con somma 1")
    try:
        m = build(args.instances, args.teacher, args.out, args.version, tuple(args.split),
                  args.split_seed, args.max_gap, args.overwrite)
    except FileExistsError as e:
        print(e, file=sys.stderr)
        return 1
    for s in SPLITS:
        st = m["stats"][s]
        print(f"{s:<6} istanze {st['instances']:>4}  passi {st['groups']:>6}  righe {st['rows']:>7}")
    print(f"scartate: {m['filters']['skipped'] or 'nessuna'}")
    print(f"costo rigiocato / costo teacher: {m['replay_vs_teacher_cost']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
