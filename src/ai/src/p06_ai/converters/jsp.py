"""Convertitore del formato job shop classico (JSPLIB, Taillard, Adams, Demirkol).

Formato (le righe che iniziano con ``#`` sono commenti):
    riga 1:   <n_job> <n_macchine>
    riga job: coppie <macchina (da 0)> <durata>, nell'ordine di lavorazione

Nel file le macchine partono da 0; negli ID partono da 1 (``M1`` = macchina 0),
come nel convertitore ``.fjs``.

Uso da riga di comando:
    python -m p06_ai.converters.jsp <file o cartella> <cartella di output>
        [--metadata <JSPLIB/instances.json>]
"""

from __future__ import annotations

from pathlib import Path

from ..schema import Activity, Instance, Job, Mode, Precedence, Resource, Source
from ._common import FormatError, int_rows, machine_ids, run_cli


class JspFormatError(FormatError):
    pass


def parse_jsp(text: str, *, dataset: str, instance: str,
              license: str | None = None) -> Instance:
    try:
        rows = int_rows(text)
    except FormatError as exc:
        raise JspFormatError(str(exc)) from None
    if not rows or len(rows[0]) != 2:
        raise JspFormatError("intestazione mancante o non valida")
    n_jobs, n_machines = rows[0]
    job_lines = rows[1:1 + n_jobs]
    if len(job_lines) < n_jobs:
        raise JspFormatError(f"attesi {n_jobs} job, trovati {len(job_lines)}")

    mids = machine_ids(n_machines)
    jobs: list[Job] = []
    activities: list[Activity] = []
    precedences: list[Precedence] = []

    for j, tokens in enumerate(job_lines, start=1):
        job_id = f"J{j}"
        if not tokens or len(tokens) % 2:
            raise JspFormatError(f"{job_id}: numero dispari di valori")
        jobs.append(Job(id=job_id))
        previous: str | None = None
        for o, (machine, duration) in enumerate(zip(tokens[0::2], tokens[1::2]), start=1):
            if not 0 <= machine < n_machines:
                raise JspFormatError(f"{job_id}: macchina {machine} fuori intervallo")
            if duration < 0:
                raise JspFormatError(f"{job_id}: durata negativa")
            act_id = f"{job_id}-O{o}"
            activities.append(Activity(
                id=act_id, job_id=job_id,
                modes=[Mode(resource_ids=[mids[machine]], duration_min=duration)]))
            if previous is not None:
                precedences.append(Precedence(from_=previous, to=act_id))
            previous = act_id

    return Instance(
        source=Source(dataset=dataset, instance=instance, license=license),
        domain_profile="FACTORY",
        resources=[Resource(id=m) for m in mids],
        jobs=jobs, activities=activities, precedences=precedences,
    )


def convert_file(path: Path, *, dataset: str, license: str | None = None) -> Instance:
    return parse_jsp(path.read_text(encoding="utf-8"), dataset=dataset,
                     instance=path.stem, license=license)


def main(argv: list[str] | None = None) -> int:
    return run_cli(parse_jsp, "Converte istanze job shop nello Unified Instance Schema", argv)


if __name__ == "__main__":
    raise SystemExit(main())
