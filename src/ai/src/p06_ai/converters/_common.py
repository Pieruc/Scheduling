"""Parti condivise dai convertitori: lettura righe, conversione di cartelle, CLI."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Callable

from ..schema import BestKnown, Instance
from ..validation import validate_instance


class FormatError(ValueError):
    """Il file non rispetta il formato atteso."""


# parse(text, dataset=..., instance=..., license=...) -> Instance
Parser = Callable[..., Instance]


def int_rows(text: str) -> list[list[int]]:
    """Righe non vuote e non di commento (``#``), come liste di interi.

    L'intestazione di alcuni file ``.fjs`` contiene un terzo valore decimale:
    i token non interi della prima riga vengono ignorati.
    """
    rows: list[list[int]] = []
    for line in text.splitlines():
        tokens = line.split()
        if not tokens or tokens[0].startswith("#"):
            continue
        try:
            rows.append([int(tok) for tok in tokens])
        except ValueError as exc:
            if rows:
                raise FormatError(f"valore non intero: {exc}") from None
            try:
                rows.append([int(tok) for tok in tokens[:2]])
            except ValueError as exc2:
                raise FormatError(f"intestazione non valida: {exc2}") from None
    return rows


def machine_ids(n_machines: int) -> list[str]:
    """ID ``M1..Mn`` con zeri a sinistra, così l'ordine alfabetico è quello numerico."""
    width = len(str(n_machines))
    return [f"M{m:0{width}d}" for m in range(1, n_machines + 1)]


def load_jsplib_metadata(path: Path) -> dict[str, BestKnown]:
    """Legge ``instances.json`` di JSPLIB: nome istanza -> miglior valore noto."""
    out: dict[str, BestKnown] = {}
    for entry in json.loads(path.read_text(encoding="utf-8")):
        if entry.get("optimum") is not None:
            out[entry["name"]] = BestKnown(makespan=entry["optimum"],
                                           lower_bound=entry["optimum"], optimal=True)
        elif entry.get("bounds"):
            out[entry["name"]] = BestKnown(makespan=entry["bounds"].get("upper"),
                                           lower_bound=entry["bounds"].get("lower"),
                                           optimal=False)
    return out


def convert_tree(root: Path, out_dir: Path, parse: Parser, *,
                 dataset: str | None = None, license: str | None = None,
                 best_known: dict[str, BestKnown] | None = None,
                 ) -> tuple[int, list[str]]:
    """Converte un file o tutti i file di una cartella (ricorsivamente).

    Senza ``dataset`` il nome è la sottocartella (es. ``brandimarte``,
    ``hurink/edata``). Restituisce (numero di file scritti, errori).
    """
    if root.is_file():
        files, base = [root], root.parent
    else:
        files = sorted(p for p in root.rglob("*")
                       if p.is_file() and not p.name.startswith(".")
                       and p.suffix.lower() in ("", ".fjs", ".txt"))
        base = root
    written, errors = 0, []
    for path in files:
        rel = path.parent.relative_to(base).as_posix()
        name = dataset or (base.name if rel == "." else rel)
        try:
            inst = parse(path.read_text(encoding="utf-8"), dataset=name,
                         instance=path.stem, license=license)
        except (FormatError, UnicodeDecodeError) as exc:
            errors.append(f"{path}: {exc}")
            continue
        issues = validate_instance(inst)
        if issues:
            errors.append(f"{path}: {issues[0].code} {issues[0].message}")
            continue
        if best_known and path.stem in best_known:
            inst.source.best_known = best_known[path.stem]
        target = out_dir / name / f"{path.stem}.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(inst.to_json(), encoding="utf-8")
        written += 1
    return written, errors


def run_cli(parse: Parser, description: str, argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=description)
    ap.add_argument("input", type=Path, help="file o cartella da convertire")
    ap.add_argument("output", type=Path, help="cartella di output")
    ap.add_argument("--dataset", help="nome del dataset (default: nome della cartella)")
    ap.add_argument("--license", help="licenza da scrivere in source.license")
    ap.add_argument("--metadata", type=Path,
                    help="instances.json di JSPLIB, per riempire source.best_known")
    args = ap.parse_args(argv)
    for p in (args.input, args.metadata):
        if p is not None and not p.exists():
            ap.error(f"{p} non esiste")
    best_known = load_jsplib_metadata(args.metadata) if args.metadata else None
    written, errors = convert_tree(args.input, args.output, parse, dataset=args.dataset,
                                   license=args.license, best_known=best_known)
    for err in errors:
        print(f"ERRORE {err}", file=sys.stderr)
    print(f"{written} istanze convertite, {len(errors)} errori")
    return 1 if errors else 0
