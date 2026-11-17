"""Convertitore del formato ``.fjs`` (flexible job shop).

Copre Brandimarte (Mk01-Mk10) e gli altri dataset che usano lo stesso formato:
Hurink, Barnes, Dauzère-Pérès e Paulli, Fattahi, Kacem.

Formato:
    riga 1:   <n_job> <n_macchine> [<media macchine per operazione>]
    riga job: <n_operazioni> poi, per ogni operazione:
              <k> seguito da k coppie <macchina (da 1)> <durata>

Uso da riga di comando:
    python -m p06_ai.converters.fjsp <file o cartella> <cartella di output>
"""

from __future__ import annotations

from pathlib import Path

from ..schema import Activity, Instance, Job, Mode, Precedence, Resource, Source
from ._common import FormatError, int_rows, machine_ids, run_cli


class FjsFormatError(FormatError):
    pass


def parse_fjs(text: str, *, dataset: str, instance: str,
              license: str | None = None) -> Instance:
    try:
        rows = int_rows(text)
    except FormatError as exc:
        raise FjsFormatError(str(exc)) from None
    if not rows or len(rows[0]) < 2:
        raise FjsFormatError("intestazione mancante")
    n_jobs, n_machines = rows[0][0], rows[0][1]
    job_lines = rows[1:1 + n_jobs]
    if len(job_lines) < n_jobs:
        raise FjsFormatError(f"attesi {n_jobs} job, trovati {len(job_lines)}")

    mids = machine_ids(n_machines)
    jobs: list[Job] = []
    activities: list[Activity] = []
    precedences: list[Precedence] = []

    for j, tokens in enumerate(job_lines, start=1):
        job_id = f"J{j}"
        jobs.append(Job(id=job_id))
        n_ops, pos = tokens[0], 1
        previous: str | None = None
        for o in range(1, n_ops + 1):
            if pos >= len(tokens):
                raise FjsFormatError(f"{job_id}: riga troppo corta")
            k = tokens[pos]
            pairs = tokens[pos + 1:pos + 1 + 2 * k]
            if k < 1 or len(pairs) != 2 * k:
                raise FjsFormatError(f"{job_id}: operazione {o} incompleta")
            modes = []
            for machine, duration in zip(pairs[0::2], pairs[1::2]):
                if not 1 <= machine <= n_machines:
                    raise FjsFormatError(f"{job_id}: macchina {machine} fuori intervallo")
                if duration < 0:
                    raise FjsFormatError(f"{job_id}: durata negativa")
                modes.append(Mode(resource_ids=[mids[machine - 1]], duration_min=duration))
            act_id = f"{job_id}-O{o}"
            activities.append(Activity(id=act_id, job_id=job_id, modes=modes))
            if previous is not None:
                precedences.append(Precedence(from_=previous, to=act_id))
            previous = act_id
            pos += 1 + 2 * k
        if pos != len(tokens):
            raise FjsFormatError(f"{job_id}: {len(tokens) - pos} valori in eccesso")

    return Instance(
        source=Source(dataset=dataset, instance=instance, license=license),
        domain_profile="FACTORY",
        resources=[Resource(id=m) for m in mids],
        jobs=jobs, activities=activities, precedences=precedences,
    )


def convert_file(path: Path, *, dataset: str, license: str | None = None) -> Instance:
    return parse_fjs(path.read_text(encoding="utf-8"), dataset=dataset,
                     instance=path.stem, license=license)


def main(argv: list[str] | None = None) -> int:
    return run_cli(parse_fjs, "Converte istanze .fjs nello Unified Instance Schema", argv)


if __name__ == "__main__":
    raise SystemExit(main())
