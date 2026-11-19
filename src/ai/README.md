# P06 – Parte AI (Python)

Codice Python della parte AI: schema comune delle istanze, convertitori dei
benchmark, generatore di istanze sintetiche, Dispatcher e regole di riferimento
EDD/ATC. Corrisponde ai blocchi *Log & Benchmark Converters*, *Instance
Generator* e *M2 Policy + Dispatcher / Fallback* di
[Spiegazione_architettura_VPP.txt](../../Spiegazione_architettura_VPP.txt).

Altri documenti:

- [docs/decisioni.md](docs/decisioni.md): scelte di progetto e differenze dal contratto
- [docs/esperimenti.md](docs/esperimenti.md): registro di prove e risultati

## Stato (17 novembre 2026)

| Componente | Task del Gantt | Stato |
|---|---|---|
| Schema istanze e validatore | 3 – ProblemSpec v1 | fatto (con differenze dal contratto, vedi decisioni) |
| Convertitore FJSP (`.fjs`) | 7 – Generatore e convertitori | fatto, 337 istanze |
| Convertitore JSP (JSPLIB, Demirkol) | 7 | fatto, 242 istanze |
| Convertitori PSPLIB, MSLIB | 7 | da fare: serve un'estensione dello schema |
| Generatore FACTORY e PA | 7 | fatto |
| Taratura del generatore | 7 | fatto per FACTORY; PA non tarato |
| Dispatcher | 8 – Dispatcher e baseline | fatto |
| Regole EDD e ATC | 8 | fatte |
| Verifica di ammissibilità dei piani | 8 | fatta |
| Valutazione delle baseline | 8 | fatta |

## Installazione

Serve Python 3.11 o successivo. Da questa cartella (`Scheduling/src/ai`):

```bash
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

Tutti i comandi seguenti si lanciano da `Scheduling/src/ai`. Su Windows si usa
`.\.venv\Scripts\python.exe`; altrove `.venv/bin/python`.

## Struttura

```
ai/
├── pyproject.toml
├── src/p06_ai/
│   ├── schema.py          Unified Instance Schema (contratto D), modelli Pydantic
│   ├── validation.py      controlli di consistenza (codici di errore del contratto B.1)
│   ├── converters/
│   │   ├── _common.py     parti condivise: lettura, conversione di cartelle, CLI
│   │   ├── fjsp.py        formato .fjs (Brandimarte, Hurink, Barnes, ...)
│   │   └── jsp.py         job shop classico (JSPLIB, Taillard, Adams, Demirkol)
│   ├── generator.py       generatore di istanze, profili FACTORY e PA
│   ├── calibration.py     taratura di un profilo su istanze convertite
│   ├── dispatcher.py      simulatore che costruisce il piano passo per passo
│   ├── rules.py           regole EDD e ATC
│   ├── checker.py         verifica di ammissibilità di un piano
│   ├── plan.py            PlanResult (contratto B.2) e calcolo dei KPI
│   └── baselines.py       valutazione di EDD e ATC su una cartella di istanze
├── tests/                 test pytest
└── data/                  dati prodotti (esclusa da git)
```

## Dati

I dataset grezzi stanno fuori dalla repo, nella cartella `Dataset` accanto a
`Scheduling`. I test che li usano vengono saltati se la cartella non c'è
(percorso modificabile con la variabile `P06_DATASET_DIR`).

| Dataset | Cartella | Istanze | Licenza | Stato |
|---|---|---|---|---|
| TU/e Job Shop Benchmark (FJSP, JSP, ...) | `Dataset/Job_Shop_Scheduling_Benchmark_Environments_and_Instances` | 337 FJSP + 165 JSP usati | MIT | convertito |
| JSPLIB | `Dataset/JSPLIB` | 162 | non trovata | convertito |
| PSPLIB j30, j60, j90, j120 (modo singolo) | `Dataset/PSPLIB` | 480 + 480 + 480 + 600 | non verificata | scaricato, non convertito |
| MSLIB v2.2, set 1–5 | `Dataset/MSLIB/MSLIB_v2_2` | 13.200 + 18.002 + 23.760 + 10.000 + 78 | uso per ricerca, citare Snauwaert & Vanhoucke (EJOR 2023); nessun testo di licenza trovato | scaricato, non convertito |

Taillard e Adams del repository TU/e sono le stesse istanze già presenti in
JSPLIB: per la valutazione bastano JSPLIB e Demirkol.

## Comandi

### Convertire i benchmark

```bash
# FJSP: tutte le sottocartelle (brandimarte, hurink/edata, ...)
.\.venv\Scripts\python.exe -m p06_ai.converters.fjsp "..\..\..\Dataset\Job_Shop_Scheduling_Benchmark_Environments_and_Instances\data\fjsp" data\converted --license MIT

# JSPLIB, con ottimi e bound noti
.\.venv\Scripts\python.exe -m p06_ai.converters.jsp ..\..\..\Dataset\JSPLIB\instances data\converted --dataset JSPLIB --metadata ..\..\..\Dataset\JSPLIB\instances.json

# Demirkol
.\.venv\Scripts\python.exe -m p06_ai.converters.jsp "..\..\..\Dataset\Job_Shop_Scheduling_Benchmark_Environments_and_Instances\data\jsp\demirkol" data\converted --license MIT
```

Output: `data/converted/<dataset>/<istanza>.json`. Il comando stampa quante
istanze ha convertito e quanti errori; i file non validi non vengono scritti.

### Generare istanze

```bash
.\.venv\Scripts\python.exe -m p06_ai.generator --profile FACTORY --count 200 --seed 0 --out data\generated
.\.venv\Scripts\python.exe -m p06_ai.generator --profile PA --count 200 --seed 0 --out data\generated
```

Output: `data/generated/<PROFILO>/seed-<n>.json`. Lo stesso profilo e lo stesso
seed producono sempre lo stesso file. `--seed` è il primo seed.

### Tarare un profilo

```bash
.\.venv\Scripts\python.exe -m p06_ai.calibration data\converted\brandimarte --profile FACTORY --out data\factory_brandimarte.json
.\.venv\Scripts\python.exe -m p06_ai.generator --profile-file data\factory_brandimarte.json --count 100 --out data\generated
```

La taratura restringe dimensioni, flessibilità e durate al 5°–95° percentile
delle istanze lette; scadenze, pesi e setup restano quelli del profilo di partenza.

### Valutare EDD e ATC

```bash
.\.venv\Scripts\python.exe -m p06_ai.baselines data\converted --csv data\baselines_converted.csv
.\.venv\Scripts\python.exe -m p06_ai.baselines data\generated --csv data\baselines_generated.csv --atc-k 2
```

Stampa un riassunto per dataset e regola (istanze non risolte, gap medio dal
miglior valore noto, ritardo pesato medio, tempo); il CSV ha una riga per
istanza e regola.

### Usare i moduli da Python

```python
from pathlib import Path
from p06_ai.schema import Instance
from p06_ai.generator import FACTORY, generate_instance
from p06_ai.rules import solve_atc
from p06_ai.checker import check_plan

inst = Instance.model_validate_json(Path("data/converted/brandimarte/Mk01.json").read_text("utf-8"))
inst = generate_instance(FACTORY, seed=42)

result = solve_atc(inst)                       # PlanResult (contratto B.2)
print(result.status, result.kpis)
print(check_plan(inst, result.assignments))    # [] = piano ammissibile
```

Per scegliere le mosse con un decisore diverso (la futura policy M2):

```python
from p06_ai.dispatcher import Dispatcher

disp = Dispatcher(inst)
while not disp.done:
    candidates = disp.candidates()    # mosse lecite del passo corrente
    disp.apply(candidates[0])         # qui sceglie la policy
```

## Test

```bash
.\.venv\Scripts\python.exe -m pytest -q
```

Al 17 novembre: 80 test, tutti passati. Comprendono la conversione di tutti i
file reali, la verifica di ammissibilità dei piani su benchmark e istanze
generate, e un controllo che nessun makespan scenda sotto i limiti noti di JSPLIB.
