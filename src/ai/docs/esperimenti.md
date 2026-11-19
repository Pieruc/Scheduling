# Registro degli esperimenti – parte AI

Una voce per ogni prova, con data, cosa si è misurato e cosa se ne è concluso.
I comandi per ripetere le misure sono nel [README](../README.md).

---

## E1 – Conversione dei benchmark job shop e flexible job shop

**Data:** 11 novembre 2026

**Cosa:** conversione di tutte le istanze FJSP e JSP disponibili nello schema
comune, con validazione di ciascuna.

| Dataset | Istanze | Errori | Con valore noto |
|---|---|---|---|
| Brandimarte | 10 | 0 | 0 |
| Hurink (edata, rdata, sdata, vdata) | 264 | 0 | 0 |
| Barnes | 21 | 0 | 0 |
| Dauzère-Pérès e Paulli | 18 | 0 | 0 |
| Fattahi | 20 | 0 | 0 |
| Kacem | 4 | 0 | 0 |
| JSPLIB | 162 | 0 | 152 (103 ottimi, 49 solo bound) |
| Demirkol | 80 | 0 | 0 |
| Taillard e Adams (TU/e) | 85 | 0 | 75 |

**Conclusioni:** i convertitori leggono tutti i file. Per JSPLIB il numero di
job, macchine e attività coincide con i metadati ufficiali di ogni istanza.
Mancano i valori noti di ta71–ta80 (nulli anche in `instances.json`), di
Demirkol e di tutto l'FJSP. Un file `.DS_Store` nella cartella Taillard
generava un errore: i file nascosti ora vengono ignorati.

---

## E2 – Prime istanze generate

**Data:** 11 novembre 2026

**Cosa:** 200 istanze per profilo con le scadenze della prima versione.

| Profilo | Attività (min / media / max) | Istanze con setup | Dimensione file (media / max) |
|---|---|---|---|
| FACTORY | 20 / 45 / 77 | 110 su 200 | 91 KB / 456 KB |
| PA | 20 / 67 / 123 | 0 | 51 KB / 124 KB |

Pesi medi degli obiettivi: FACTORY makespan 0,41, ritardo 0,41, setup 0,19;
PA makespan 0,23, ritardo 0,77.

**Conclusioni:** tutte le istanze sono valide. I setup elencati coppia per
coppia arrivano a 3208 voci per istanza: è la causa dei file grandi (vedi
decisione D5).

---

## E3 – Taratura su Brandimarte

**Data:** 11 novembre 2026

**Cosa:** taratura del profilo FACTORY sulle 10 istanze Brandimarte.

| Parametro | FACTORY predefinito | Tarato su Brandimarte |
|---|---|---|
| Job | 5–15 | 10–20 |
| Macchine | 4–10 | 4–15 |
| Attività per job | 3–6 | 5–15 |
| Alternative per attività | 1–3 | 1–5 |
| Durate | 10–120 | 2–18 |

**Conclusioni:** la taratura funziona. Il profilo tarato non è stato adottato
come predefinito: le istanze Brandimarte sono più grandi di quanto conviene per
CP-SAT in fase di training.

---

## E4 – Baseline EDD e ATC e correzione delle scadenze

**Data:** 17 novembre 2026

### Benchmark

Tutte le 579 istanze convertite ricevono un piano ammissibile con entrambe le
regole. Gap medio del makespan rispetto al miglior valore noto, su JSPLIB:

| Regola | Gap medio |
|---|---|
| EDD | 36,3% |
| ATC (k = 2) | 48,7% |

Nessun makespan scende sotto il limite inferiore noto (controllato su tutte le
istanze JSPLIB con al massimo 300 attività). I benchmark non hanno scadenze: EDD
diventa "prima chi finisce prima" e ATC diventa peso ÷ durata, quindi nessuna
delle due è pensata per il makespan. Tempo medio per istanza: da 1 a 105 ms.

### Istanze generate, prima versione delle scadenze

Ritardo pesato medio su 200 istanze per profilo:

| Profilo | EDD | ATC k = 1 | ATC k = 2 |
|---|---|---|---|
| FACTORY | 216 | 220 | 252 |
| PA | 904 | 707 | 785 |

Con EDD il ritardo è zero in 122 istanze FACTORY su 200 e in 157 PA su 200.
EDD e ATC danno lo stesso ritardo in circa metà delle istanze FACTORY e in tre
quarti delle PA.

**Problema:** troppe istanze senza ritardo non insegnano nulla al modello sul
ritardo. Causa: la scadenza dipendeva solo dalla durata del job, ignorando la
coda sulle risorse condivise.

### Scelta dei nuovi intervalli

> Le colonne ATC di questa tabella e della successiva sono state misurate con
> la versione di ATC poi corretta il 17 novembre (voce E5). Le colonne EDD e la
> scelta degli intervalli restano valide.

Nuova formula delle scadenze (decisione G4). Prova di cinque intervalli di
`due_slack` su 150 istanze per profilo, misurando con EDD:

| Profilo | `due_slack` | Istanze con ritardo zero | Job in ritardo | Ritardo pes. EDD | ATC k = 1 | ATC k = 2 |
|---|---|---|---|---|---|---|
| FACTORY | 0–1,0 | 44 | 19% | 336 | 313 | 311 |
| FACTORY | **0–0,6** | **18** | **37%** | 938 | 948 | 910 |
| FACTORY | 0–0,4 | 8 | 47% | 1434 | 1409 | 1368 |
| FACTORY | 0,1–0,5 | 18 | 34% | 992 | 934 | 943 |
| FACTORY | 0–0,3 | 5 | 52% | 1706 | 1706 | 1646 |
| PA | 0–1,0 | 82 | 13% | 1483 | 1142 | 1115 |
| PA | 0–0,6 | 43 | 23% | 3073 | 2346 | 2422 |
| PA | **0–0,4** | **27** | **33%** | 4466 | 3320 | 3444 |
| PA | 0,1–0,5 | 38 | 24% | 3173 | 2209 | 2450 |
| PA | 0–0,3 | 22 | 37% | 5069 | 4062 | 4145 |

Scelti FACTORY 0–0,6 e PA 0–0,4: poche istanze senza ritardo, circa un terzo
dei job in ritardo. Intervalli più stretti mettono in ritardo metà dei job, e
le istanze diventano tutte difficili allo stesso modo.

### Istanze generate, nuova versione

Ritardo pesato medio su 200 istanze per profilo (le istanze in `data/generated`):

| Profilo | EDD | ATC k = 1 | ATC k = 2 |
|---|---|---|---|
| FACTORY | 925 | 954 | 903 |
| PA | 4115 | 3141 | 3259 |

**Conclusioni:**

- ATC batte EDD in entrambi i profili, nettamente su PA, come ci si aspetta da
  una regola che usa i pesi dei clienti.
- Il miglior `k` dipende dal profilo (2 per FACTORY, 1 per PA); il default
  resta 2. Da rivedere quando i profili saranno tarati su dati reali.
- Le percentuali di ritardo sono plausibili ma non verificate su dati reali.

---

## E5 – Correzione della scelta del modo in ATC

**Data:** 17 novembre 2026

**Problema:** preparando l'esempio per il report, ATC ha assegnato l'ultima
attività di un job alla macchina M2 (fine a 166, job in ritardo) invece che a
M1 (fine a 109, job in orario). L'indice ATC veniva calcolato per ogni modo
usando la sua fine: il modo che finiva più tardi aveva margine nullo, quindi
indice di urgenza massimo, e vinceva.

**Correzione:** ATC ora sceglie l'attività e, per quella, il modo che finisce
prima; l'indice di ogni attività è calcolato su quel modo (decisione R7).
Aggiunto un test con il caso trovato. EDD non cambia; sui benchmark job shop
(un solo modo per attività) i risultati non cambiano: JSPLIB resta al 48,7%.

**Nuove misure** – ritardo pesato medio, 150 istanze per profilo:

| Profilo | `due_slack` | EDD | ATC k = 1 | ATC k = 2 |
|---|---|---|---|---|
| FACTORY | 0–1,0 | 336 | 202 | 221 |
| FACTORY | **0–0,6** | 938 | 729 | 738 |
| FACTORY | 0–0,4 | 1434 | 1150 | 1198 |
| FACTORY | 0,1–0,5 | 992 | 742 | 811 |
| FACTORY | 0–0,3 | 1706 | 1440 | 1434 |
| PA | 0–1,0 | 1483 | 964 | 938 |
| PA | 0–0,6 | 3073 | 1845 | 2033 |
| PA | **0–0,4** | 4466 | 2621 | 2947 |
| PA | 0,1–0,5 | 3173 | 1750 | 2065 |
| PA | 0–0,3 | 5069 | 3150 | 3486 |

Sulle 200 istanze per profilo in `data/generated`:

| Profilo | EDD | ATC k = 1 | ATC k = 2 |
|---|---|---|---|
| FACTORY | 925 | 739 | 747 |
| PA | 4115 | 2465 | 2758 |

**Conclusioni:**

- ATC batte EDD nettamente in entrambi i profili: −19% di ritardo pesato su
  FACTORY, −33% su PA (con k = 2).
- Con la correzione, k = 1 è migliore o uguale a k = 2 in quasi tutti i casi.
  Il default resta 2 in attesa di una decisione; da rivedere prima del pilota.
