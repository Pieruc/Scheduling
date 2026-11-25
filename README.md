# FlowSync – AI-Production Scheduling Optimization

Progetto P06 del corso *Complex System Design* (Università di Camerino, a.a. 2026/27).

FlowSync è una piattaforma web che aiuta il pianificatore a decidere **chi fa cosa e quando**:
assegna le attività delle commesse alle risorse (macchine, persone, stanze) rispettando
precedenze, turni, indisponibilità e scadenze. **L'AI propone, il pianificatore decide**: per
ogni richiesta il sistema prepara **3 piani** (economico, bilanciato, veloce), li confronta con
le regole classiche **ATC** ed **EDD**, e un piano entra in esecuzione solo dopo l'approvazione.

Il modello è generico: lo stesso motore serve una fabbrica (job shop flessibile), un ufficio
della pubblica amministrazione (pratiche tra uffici) o un progetto (RCPSP), cambiando solo il
**profilo di dominio**.

## Team

| Chi | Parte |
|---|---|
| Leonardo Pierucci | AI e dati: generatore di istanze, dispatcher, regole EDD/ATC, teacher CP-SAT, modelli M1 e M2, servizio AI |
| Alessio Brutti | Backend e database: Spring Boot, MySQL, Flyway, sicurezza, client verso l'AI |
| Mattia Brizi | Frontend: React, grafo delle attività, Gantt delle risorse, dashboard |

## Architettura in breve

```
 Frontend (React) ──[A: REST /api/v1, JWT]──> Backend (Spring Boot) ──> MySQL
                                                   │
                                  [B: REST interna /optimize, ProblemSpec]
                                                   v
                                     Servizio AI (Python, FastAPI)
                                       M1 Context (stima durate) + M2 Policy (costruisce il piano)
                                       fallback: CP-SAT → ATC → EDD

 Pipeline di training (offline) ──[C: model_version]──> MySQL
 Convertitori benchmark ──[D: schema istanze]──> generatore / dataset
```

- Il **frontend non parla mai con l'AI**: tutto passa dal backend (sicurezza, audit, errori in un posto solo).
- **Training e inferenza sono separati**: CP-SAT si usa solo offline come "insegnante"; in esercizio risponde il modello.
- I contratti tra le parti sono in [`CONTRATTI_API.md`](CONTRATTI_API.md).

## Stato (25 novembre 2026)

| Parte | Fatto | Da fare |
|---|---|---|
| **Frontend** | Tutte le schermate del mockup su backend finto (MSW): dashboard, commesse con grafo delle attività, nuova pianificazione con lettura della richiesta a parole, confronto dei 3 piani con ATC/EDD, elenco piani, Gantt delle risorse con approvazione/modifica/rifiuto, ripianificazione dopo una segnalazione, vista operatore, configurazione, modello AI, audit, login di prova con ruoli | Registrazione e gestione utenti; collegamento al backend vero, un'area alla volta |
| **Backend** | Schema MySQL (23 tabelle, Flyway), login JWT con refresh, registrazione con approvazione, risorse, calendari/competenze/profili in lettura, commesse e grafo di processo | Pianificazione e richieste con 3 piani, Gantt, decisioni, ripianificazione, esecuzione, avvisi e segnalazioni, KPI, audit, client verso l'AI |
| **AI** | Schema delle istanze, convertitori dei benchmark (579 istanze), generatore FACTORY/PA, dispatcher, regole EDD/ATC, verifica di ammissibilità, teacher CP-SAT, dataset con 23 feature | Addestramento di M2 (pilota contro ATC) e di M1, servizio FastAPI, lettura della richiesta a parole (LLM) |
| **Integrazione** | Contratti concordati; il frontend lavora sugli stessi formati | Docker Compose di tutto il sistema, prove end-to-end |

## Avvio

**Frontend** (Node.js 22): parte con il backend finto, non serve altro.

```bash
cd src/frontend
npm install
npm run dev          # http://localhost:5173
```

Per usare il backend vero: in `src/frontend/.env.development` mettere `VITE_USE_MOCKS=false`
(le chiamate a `/api` vanno già a `localhost:8080`).

**Backend** (Java 21, Maven, Docker Desktop acceso): il profilo `dev` avvia anche MySQL.

```bash
cd src/backend
cp .env.example .env
mvn spring-boot:run -Pdev    # http://localhost:8080, Swagger su /swagger-ui.html
```

**AI** (Python 3.11+): vedi [`src/ai/README.md`](src/ai/README.md) per convertitori, generatore,
baseline e dataset.

```bash
cd src/ai
python -m venv .venv && .venv/bin/python -m pip install -e ".[dev]"
.venv/bin/python -m pytest
```

## Utenti di prova

Uguali in frontend e backend (solo sviluppo):

| Utente | Ruolo | Dove entra |
|---|---|---|
| `pianificatore` | PLANNER | Dashboard: commesse, pianificazione, piani |
| `operatore` | OPERATOR | Le sue attività di oggi |
| `amministratore` | ADMIN | Dashboard, configurazione, audit |

Password: `demo`. Con il backend finto del frontend si entra anche lasciando i campi vuoti
(come pianificatore).

## Documenti

| Documento | Contenuto |
|---|---|
| [`Tesi/`](Tesi/) | Relazione in LaTeX (inglese): `tesi.tex`, capitoli in `Tesi/chapters/` |
| [`CONTRATTI_API.md`](CONTRATTI_API.md) | Contratti tra frontend, backend, AI e pipeline |
| [`Spiegazione_architettura_VPP.txt`](Spiegazione_architettura_VPP.txt) | Spiegazione del diagramma dei componenti (Visual Paradigm) |
| [`FRONTEND_STRUTTURA.md`](FRONTEND_STRUTTURA.md) | Struttura e scelte del frontend |
| [`src/backend/README.md`](src/backend/README.md) | Database, migrazioni, endpoint, test del backend |
| [`src/ai/README.md`](src/ai/README.md), [`src/ai/docs/`](src/ai/docs/) | Parte AI: stato, comandi, decisioni, esperimenti |
| [`FE_Mockups/`](FE_Mockups/) | Mockup HTML delle schermate (v2) |
| [`GANTT/`](GANTT/) | Piano di progetto (versioni del diagramma di Gantt, indicativo) |
| `ProductionSchedulingOptimization.vpp`, `FlowSync_SequenceDiagrams_VP.xml` | Modelli UML (Visual Paradigm) |

Si lavora direttamente su `main`; i messaggi di commit iniziano con l'area toccata
(`frontend:`, `AI:`, `thesis:`, …).
