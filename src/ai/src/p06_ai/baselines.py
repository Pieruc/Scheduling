"""Valutazione delle regole EDD e ATC su una cartella di istanze.

Per ogni istanza e regola scrive una riga CSV (KPI, gap dal miglior valore noto,
tempo) e stampa un riassunto per dataset.

Uso da riga di comando:
    python -m p06_ai.baselines <cartella di istanze JSON> [--rules EDD ATC]
        [--csv risultati.csv] [--atc-k 2.0]
"""

from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path
from statistics import mean

from .rules import solve_atc, solve_edd
from .schema import Instance

FIELDS = ["dataset", "instance", "rule", "status", "makespan", "best_known", "gap",
          "weighted_tardiness", "late_jobs", "total_setup", "utilization", "ms"]


def evaluate(paths: list[Path], rules: list[str], atc_k: float = 2.0) -> list[dict]:
    solvers = {"EDD": solve_edd, "ATC": lambda inst: solve_atc(inst, atc_k)}
    rows = []
    for path in paths:
        inst = Instance.model_validate_json(path.read_text(encoding="utf-8"))
        best = inst.source.best_known.makespan if inst.source.best_known else None
        for rule in rules:
            res = solvers[rule](inst)
            row = {"dataset": inst.source.dataset, "instance": inst.source.instance,
                   "rule": rule, "status": res.status, "best_known": best,
                   "ms": res.timing_ms.get("total")}
            if res.kpis is not None:
                k = res.kpis
                row.update(makespan=k.makespan_min, weighted_tardiness=k.weighted_tardiness,
                           late_jobs=k.late_jobs, total_setup=k.total_setup_min,
                           utilization=k.avg_utilization)
                if best:
                    row["gap"] = round((k.makespan_min - best) / best, 4)
            rows.append(row)
    return rows


def summarize(rows: list[dict]) -> list[str]:
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        groups[row["dataset"], row["rule"]].append(row)
    lines = [f"{'dataset':<24}{'regola':<7}{'istanze':>8}{'non OK':>8}"
             f"{'gap medio':>11}{'ritardo pes. medio':>20}{'ms medi':>9}"]
    for (dataset, rule), items in sorted(groups.items()):
        ok = [r for r in items if r["status"] == "OK"]
        gaps = [r["gap"] for r in ok if r.get("gap") is not None]
        tard = [r["weighted_tardiness"] for r in ok]
        gap = f"{mean(gaps):.1%}" if gaps else "-"
        wt = f"{mean(tard):.1f}" if tard else "-"
        ms = f"{mean(r['ms'] for r in items):.0f}"
        lines.append(f"{dataset:<24}{rule:<7}{len(items):>8}{len(items) - len(ok):>8}"
                     f"{gap:>11}{wt:>20}{ms:>9}")
    return lines


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Valuta EDD e ATC su istanze JSON")
    ap.add_argument("input", type=Path, help="file JSON o cartella (ricorsiva)")
    ap.add_argument("--rules", nargs="+", choices=["EDD", "ATC"], default=["EDD", "ATC"])
    ap.add_argument("--csv", type=Path, help="file CSV con una riga per istanza e regola")
    ap.add_argument("--atc-k", type=float, default=2.0, help="parametro k di ATC")
    args = ap.parse_args(argv)
    if args.atc_k <= 0:
        ap.error("--atc-k deve essere positivo")
    paths = [args.input] if args.input.is_file() else sorted(args.input.rglob("*.json"))
    if not paths:
        print(f"Nessun file .json in {args.input}", file=sys.stderr)
        return 1
    rows = evaluate(paths, args.rules, args.atc_k)
    if args.csv:
        with args.csv.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
    print("\n".join(summarize(rows)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
