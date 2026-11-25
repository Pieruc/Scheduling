# Contratti API - P06 Scheduling con AI

Documento di riferimento per le interfacce tra i blocchi dell'architettura
(vedi `Spiegazione_architettura_VPP.txt`). Versione contratti: **v1.1 (bozza, 25/11/2026)**: la parte A include le richieste del frontend.

```
 Frontend (React)   ──[A: REST pubblica /api/v1, JWT]──> Backend (Spring Boot)
                                                              │
                                    [B: REST interna /optimize, ProblemSpec]
                                                              v
                                                 AI Inference Service (FastAPI)

 Training Pipeline ──[C: Model Metadata]──> DB MySQL      (registrazione versioni)
 Converters        ──[D: Unified Instance Schema]──> Instance Generator / Dataset
```

| Contratto | Produttore | Consumatore | Protocollo | Esposto a |
|-----------|-----------|-------------|-----------|-----------|
| A - API pubblica | Backend | Frontend | REST/JSON, JWT Bearer | Utenti autenticati |
| B - API di ottimizzazione | Inference Service | Backend (AI Client) | REST/JSON interno | Solo rete interna |
| C - Registrazione modelli | Model Publisher | Backend / Model Info | Record DB (tabella `model_version`) | - |
| D - Schema istanze | Converters | Instance Generator, Evaluation | File JSON | - |

---

## 0. Convenzioni comuni

- **Formato**: JSON UTF-8, campi in `snake_case` lato AI, `camelCase` lato API pubblica
  (convenzioni native di Python e di Java/TypeScript; la traduzione la fa l'AI Client).
- **Tempo**:
  - API pubblica: date in ISO-8601 con fuso (`2026-11-06T08:00:00+01:00`).
  - ProblemSpec: **interi in minuti** relativi a `horizon.start`. L'AI non gestisce
    fusi orari né calendari reali: il backend li converte in finestre numeriche.
- **ID**: stringhe opache (`"ORD-0012"`, `"R-CNC-01"`). L'AI non interpreta mai gli ID.
- **Versionamento**: prefisso `/api/v1` (pubblica) e campo `spec_version` (ProblemSpec).
  Una modifica non retrocompatibile incrementa la major.
- **Errori**: formato RFC 7807 `application/problem+json`:

```json
{
  "type": "https://p06.local/errors/validation",
  "title": "Validation failed",
  "status": 422,
  "detail": "La ProblemSpec contiene 2 errori",
  "instance": "/optimize",
  "traceId": "c1f9...",
  "errors": [
    { "code": "CYCLIC_PRECEDENCE", "path": "precedences", "message": "Ciclo A1 -> A3 -> A1" },
    { "code": "UNKNOWN_RESOURCE", "path": "activities[4].modes[0].resource_ids[0]", "message": "R-99 non esiste" }
  ]
}
```

| HTTP | Quando |
|------|--------|
| 400 | JSON malformato |
| 401 / 403 | Token mancante o scaduto / ruolo non autorizzato |
| 404 | Risorsa inesistente |
| 409 | Conflitto di stato (es. approvare un piano già rifiutato) |
| 422 | Input sintatticamente valido ma inconsistente |
| 503 | Servizio AI non disponibile e nessun fallback possibile |

---

## A. API pubblica (Frontend -> Backend)

Base URL: `/api/v1`. Tutte le chiamate (tranne login, refresh e registrazione) richiedono
`Authorization: Bearer <JWT>`. Ruoli: `PLANNER`, `OPERATOR`, `ADMIN`.

> **v1.1 (25/11/2026).** Le richieste del frontend (prima elencate in §8 di
> `FRONTEND_STRUTTURA.md`) sono entrate nel contratto: sono quello che serve al progetto.
> Le parti nuove sono segnate *(v1.1)*. Riferimento di dettaglio per i campi: i tipi
> TypeScript in `src/frontend/src/api/types/` e i dati finti in `src/frontend/src/mocks/`,
> che il frontend usa finché l'endpoint vero non c'è.

Stato dell'implementazione nel backend (25/11): fatti A.1, A.2 (risorse; calendari,
competenze e profili in lettura) e A.3; il resto è da fare.

### A.1 Auth & Roles (componente Security)

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| POST | `/auth/login` | pubblico | Credenziali -> access + refresh token |
| POST | `/auth/refresh` | pubblico | Rinnovo access token |
| GET | `/auth/me` | tutti | Utente corrente e ruoli |
| POST | `/auth/register` | pubblico | Registrazione: account **in attesa** di approvazione, nessun token *(aggiunto 20/11/2026)* |

```json
// POST /auth/login  -> 200
{ "accessToken": "eyJ...", "refreshToken": "eyJ...", "expiresIn": 900,
  "user": { "id": "U-1", "username": "pianificatore", "fullName": "Giulia Neri",
            "roles": ["PLANNER"], "department": null } }
```

*(v1.1)* In `user` servono anche `fullName` (il nome mostrato nella barra laterale e nella vista
operatore) e `department` (facoltativo, es. "Reparto saldatura" per l'operatore).

Utenti demo (solo profilo `dev`, uguali nel frontend finto): `pianificatore` (PLANNER),
`operatore` (OPERATOR), `amministratore` (ADMIN), password `demo`.

```json
// POST /auth/register  -> 201        (un campo "role" nel corpo è ignorato)
{ "username": "lbianchi", "email": "l.bianchi@example.com", "fullName": "Luca Bianchi", "password": "almeno-8-caratteri" }
// risposta
{ "id": "U-7", "username": "lbianchi", "status": "PENDING",
  "message": "Registration received: an administrator must approve the account before you can log in" }

// POST /auth/login di un account in attesa o disattivato (password corretta) -> 403
{ "status": 403, "errors": [ { "code": "ACCOUNT_PENDING", ... } ] }        // oppure ACCOUNT_DISABLED
```

#### Gestione utenti (solo ADMIN) *(aggiunta 20/11/2026)*

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| GET | `/users?status=` | ADMIN | Elenco utenti; `status` = `PENDING` \| `ACTIVE` \| `DISABLED` |
| POST | `/users/{id}/approve` | ADMIN | Approva una registrazione scegliendo il ruolo; 409 se non è in attesa |
| PATCH | `/users/{id}` | ADMIN | Cambia ruolo e/o `active`; 409 `SELF_LOCKOUT` se l'ADMIN tocca sé stesso |
| DELETE | `/users/{id}` | ADMIN | Rifiuta (cancella) una registrazione in attesa; 409 per gli utenti approvati |

```json
// User (role è null finché l'account è in attesa)
{ "id": "U-7", "username": "lbianchi", "email": "l.bianchi@example.com", "fullName": "Luca Bianchi",
  "role": "PLANNER", "status": "ACTIVE", "createdAt": "2026-11-20T08:56:00Z", "approvedAt": "2026-11-20T09:10:00Z" }

// POST /users/U-7/approve
{ "role": "PLANNER" }
```

### A.2 Configuration (risorse, calendari, competenze, profili)

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| GET / POST | `/resources` | lettura: tutti; scrittura: ADMIN | Elenco / creazione risorse |
| GET / PUT / DELETE | `/resources/{id}` | idem | Dettaglio / modifica / disattivazione |
| GET / POST | `/calendars` | idem | Turni, festività |
| PUT | `/calendars/{id}` | ADMIN | Modifica di un calendario *(v1.1)* |
| GET / POST | `/skills` | idem | Competenze (nessuna modifica né cancellazione) |
| GET | `/domain-profiles` | tutti | Profili disponibili (`FACTORY`, `PA`, `PROJECT`, ...) |
| GET / PUT | `/domain-profiles/{code}` | ADMIN | Pesi di default degli obiettivi, vincoli attivi |

```json
// Resource  (costPerHour e unavailability: v1.1)
{ "id": "CNC2", "name": "Fresa CNC 2", "type": "MACHINE",   // MACHINE | PERSON | ROOM
  "capacity": 1, "skills": ["FRESATURA"], "calendarId": "CAL-2TURNI", "active": true,
  "costPerHour": 72,                                          // euro/ora, null = non indicato; serve al costo dei piani
  "unavailability": [ { "from": "2026-11-26T08:00:00+01:00", "to": "2026-11-26T17:00:00+01:00",
                        "reason": "Manutenzione" } ] }

// Calendar  (v1.1: stessi turni in tutti i giorni lavorativi; 1 = lunedì ... 7 = domenica)
{ "id": "CAL-2TURNI", "name": "2 turni", "shiftsSummary": "Lun–Ven 8–12 / 13–17",   // il riepilogo lo calcola il backend
  "workDays": [1, 2, 3, 4, 5],
  "shifts": [ { "start": "08:00", "end": "12:00" }, { "start": "13:00", "end": "17:00" } ],
  "holidays": [ { "date": "2026-12-25", "name": "Natale" } ] }
// POST / PUT: stesso corpo senza shiftsSummary; 422 con path per turni sovrapposti o nessun giorno

// Skill: POST /skills { "code": "TORNITURA", "name": "Tornitura" }  -> 422 se il codice esiste

// DomainProfile  (name e inUse: v1.1)
{ "code": "FACTORY", "name": "Fabbrica", "description": "Job shop flessibile con setup",
  "defaultObjectiveWeights": { "makespan": 0.3, "weightedTardiness": 0.5, "setup": 0.2 },  // somma 1, 422 altrimenti
  "features": ["SEQUENCE_DEPENDENT_SETUP", "ALTERNATIVE_RESOURCES", "OVERTIME"],
  "inUse": true }                                             // il profilo usato di default dalle nuove pianificazioni
```

Vincoli che il frontend sa mostrare: `SEQUENCE_DEPENDENT_SETUP`, `ALTERNATIVE_RESOURCES`,
`OVERTIME`, `HARD_DEADLINES`, `PRECEDENCE_LAGS`, `MULTI_RESOURCE`; gli altri li mostra con il codice.

### A.3 Orders & Process Graph

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| GET / POST | `/orders` | PLANNER, ADMIN | Elenco (filtri `status`, `dueBefore`) / creazione |
| GET / PUT / DELETE | `/orders/{id}` | PLANNER, ADMIN | DELETE = annulla (`CANCELLED`), non cancella |
| PATCH | `/orders/{id}/priority` | PLANNER | Cambio priorità |
| GET / PUT | `/orders/{id}/process-graph` | PLANNER | Attività + precedenze dell'ordine (editor a grafo) |

```json
// Order  (description e activityCount: v1.1, già implementati)
{ "id": "C-101", "customer": "Rinaldi Carrelli", "description": "Telaio carrello",
  "domainProfile": "FACTORY",
  "releaseDate": "2026-11-26T08:00:00+01:00", "dueDate": "2026-11-28T18:00:00+01:00",   // dueDate null = non ancora nota
  "priority": 3, "weight": 3.0, "status": "OPEN",     // priority 1 bassa, 2 media, 3 alta
  "activityCount": 6 }                                // OPEN | PLANNED | IN_PROGRESS | DONE | CANCELLED
// POST / PUT: stesso corpo senza status e activityCount.
// 422 con path per codice duplicato o scadenza prima del rilascio; 409 se la commessa non è più OPEN.

// PUT /orders/{id}/process-graph
{ "activities": [
    { "id": "C101-A1", "name": "Taglio", "requiredSkills": ["TAGLIO"],
      "modes": [ { "resourceIds": ["LASER"], "durationMin": 120 } ] },
    { "id": "C101-A4", "name": "Saldatura", "requiredSkills": ["SALDATURA"],
      "modes": [ { "resourceIds": ["SAL1"], "durationMin": 180 },       // un modo per alternativa
                 { "resourceIds": ["SAL2"], "durationMin": null } ] }   // null = da stimare (M1)
  ],
  "precedences": [ { "from": "C101-A1", "to": "C101-A4", "type": "FS", "minLagMin": 0, "maxLagMin": null } ] }
```

Il backend rifiuta con 422 un grafo con cicli già in fase di salvataggio. Gli id delle attività
nuove li sceglie il frontend (`C105-A1`, ...): sono univoci nella commessa.

### A.4 Planning & Gantt *(v1.1: richieste con 3 piani)*

**Ogni richiesta produce 3 piani alternativi** con pesi diversi degli obiettivi:
`ECONOMIC` (più lento, costo minimo, niente straordinari), `BALANCED` (compromesso, scelto con
i pesi del pianificatore) e `FAST` (finisce prima, costa di più). Ogni richiesta è anche
**confrontata con le regole ATC ed EDD** calcolate sugli stessi dati.

La generazione è **asincrona**: la richiesta risponde subito 202 e il frontend interroga
`GET /plan-requests/{id}` (polling ogni 1,5 s) finché non è più `PENDING`.

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| POST | `/plan-requests/interpret` | PLANNER | L'LLM legge la richiesta scritta a parole e propone i parametri |
| POST | `/plan-requests` | PLANNER | Nuova richiesta -> `202 Accepted` + `Location` |
| GET | `/plan-requests?limit=&q=&status=&from=` | tutti | Elenco richieste, dalla più recente, con i loro piani |
| GET | `/plan-requests/{id}` | tutti | Stato, fase, 3 piani, confronto con ATC/EDD (polling) |
| GET | `/plans/{id}/gantt` | tutti | Vista pronta per il Gantt (righe per risorsa) |
| POST | `/plans/{id}/reschedule` | PLANNER | Ripianificazione del piano in esecuzione dopo un evento |

```json
// POST /plan-requests/interpret
{ "text": "Pianifica C-101…C-104 per la prossima settimana, evita gli straordinari" }
// -> 200
{ "horizonStart": "2026-11-26T08:00:00+01:00", "horizonEnd": "2026-12-02T17:00:00+01:00",
  "orderIds": ["C-101", "C-102", "C-103", "C-104"],
  "hardConstraints": ["C-101 entro ven 28 nov", "Fresa CNC 2: manutenzione gio 27, 8:00 – 17:00"],
  "preferences": ["Evitare gli straordinari"],
  "weights": { "punctuality": 8, "overtime": 7, "setup": 4 },        // 0–10, come gli slider
  "weightNotes": ["“Evitare straordinari” è salito a 7 perché lo hai scritto nella richiesta."],
  "missingData": [
    { "id": "due-C-104", "kind": "DUE_DATE", "orderId": "C-104", "question": "C-104 non ha una scadenza. Quando va consegnata?" },
    { "id": "welding-C-103", "kind": "CHOICE", "question": "Per la saldatura di C-103 quale postazione?",
      "options": [ { "value": "SAL1,SAL2", "label": "S1 o S2" }, { "value": "SAL1", "label": "Solo S1" } ] } ] }

// POST /plan-requests
{ "text": "...", "horizonStart": "...", "horizonEnd": "...", "orderIds": ["C-101", "C-102"],
  "weights": { "punctuality": 8, "overtime": 7, "setup": 4 },
  "answers": { "due-C-104": "2026-12-01T18:00:00+01:00" } }   // risposte alle domande, per id
// -> 202 { "id": "REQ-0013", "status": "PENDING" }   Location: /api/v1/plan-requests/REQ-0013
// 422 con path "answers.<id>" se manca una risposta; le scadenze date in risposta si salvano sulle commesse.

// GET /plan-requests/REQ-0012 -> 200
{ "id": "REQ-0012", "status": "COMPLETED",          // PENDING | COMPLETED | FAILED
  "stage": null,                                    // con PENDING: VALIDATION | CONTEXT | POLICY | BASELINES
  "createdAt": "...", "createdBy": "pianificatore", "label": "Commesse C-101 – C-104",
  "orderIds": ["C-101", "C-102", "C-103", "C-104"], "horizonStart": "...", "horizonEnd": "...",
  "weights": { "punctuality": 8, "overtime": 7, "setup": 4 },
  "recommendedPlanId": "PLAN-0042", "elapsedSeconds": 1.8,
  "plans": [
    { "id": "PLAN-0042", "variant": "BALANCED", "status": "PROPOSED",
      // PENDING | PROPOSED | APPROVED | REJECTED | SUPERSEDED | FAILED
      "solver": "POLICY", "modelVersion": "m2-policy-1.3.0", "confidence": 0.87, "createdAt": "...",
      "summary": "Nessun ritardo, 2 ore di straordinario martedì in saldatura.",
      "kpis": { "makespanMin": 2280, "totalTardinessMin": 0, "lateOrders": 0, "totalSetupMin": 95,
                "setupCount": 7, "overtimeMin": 120, "avgUtilization": 0.81, "estimatedCost": 9600 } } ],
  "baselines": [ { "solver": "ATC", "kpis": { ... } }, { "solver": "EDD", "kpis": { ... } } ],
  "rescheduleOf": null, "event": null,              // valorizzati se è una ripianificazione
  "error": null }                                   // motivo, se FAILED
```

I KPI sono in **minuti di lavoro** (`makespanMin`, `totalTardinessMin`, `overtimeMin`) e
`estimatedCost` in euro (richiede `costPerHour` delle risorse). Approvando un piano, gli altri
della stessa richiesta passano a `SUPERSEDED`.

**Gantt.** `GET /plans/{id}/gantt` restituisce il piano **già convertito dal backend** nella
scala del Gantt: minuti di lavoro dall'inizio del periodo, con `minutesPerDay` per giornata
(480 = turni 8–12 e 13–17) e l'elenco dei giorni lavorativi. Il frontend non conosce i calendari:
disegna i dati del backend così come arrivano.

```json
{ "planId": "PLAN-0042", "requestId": "REQ-0012", "status": "PROPOSED", "variant": "BALANCED",
  "solver": "POLICY", "modelVersion": "m2-policy-1.3.0", "confidence": 0.87, "kpis": { ... },
  "days": ["2026-11-26", "2026-11-27", "2026-11-28", "2026-12-01", "2026-12-02"], "minutesPerDay": 480,
  "resources": [ { "id": "CNC2", "name": "Fresa CNC 2",
                   "unavailable": [ { "start": 480, "end": 960, "reason": "Manutenzione" } ] } ],
  "bars": [ { "activityId": "C101-A2", "activityName": "Fresatura", "orderId": "C-101", "resourceId": "CNC1",
              "start": 120, "end": 300,
              "durations": { "CNC1": 180, "CNC2": 210 },          // risorse ammesse e durata su ciascuna
              "declaredMin": 180,                                 // null = durata stimata da M1
              "estimate": { "value": 198, "low": 180, "high": 243, "confidence": 0.86 } } ],
  "precedences": [ { "from": "C101-A1", "to": "C101-A2" } ],
  "dueByOrder": { "C-101": 1440, "C-104": null },               // scadenza in minuti di lavoro
  "manualChanges": 0 }
```

**Ripianificazione.** Riparte dal piano in esecuzione (`APPROVED`) dopo un evento. Risponde come
una nuova richiesta: 3 piani e confronto con ATC/EDD; la richiesta porta `rescheduleOf` ed
`event`. Approvando uno dei nuovi piani, quello di partenza passa a `SUPERSEDED`.

```json
// POST /plans/PLAN-0037/reschedule
{ "event": { "type": "RESOURCE_DOWN", "resourceId": "SAL2",
             "from": "2026-11-25T10:42:00+01:00", "to": null },        // to null = fino a nuovo avviso
  // oppure { "type": "URGENT_ORDER", "orderId": "C-102", "dueDate": "..." | null }
  // oppure { "type": "DELAY", "orderId": "C-102", "delayMin": 120 }
  "freezeBefore": "2026-11-25T10:45:00+01:00",   // le attività iniziate prima restano dove sono
  "alertId": "AL-31",                            // l'avviso da cui nasce: il backend lo chiude
  "weights": { "punctuality": 8, "overtime": 4, "setup": 4 },   // assenti = quelli della richiesta di partenza
  "scope": "MINIMAL",                            // MINIMAL = cambia il meno possibile, FULL = riottimizza tutto
  "note": "Tecnico domani mattina" }
// -> 202 { "id": "REQ-0015", "status": "PENDING" }; 409 se il piano non è APPROVED; 422 se to <= from
```

### A.5 Plan Review (componente Decisions)

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| POST | `/plans/{id}/decisions` | PLANNER | Approva, modifica o rifiuta il piano |
| GET | `/plans/{id}/decisions` | tutti | Storico decisioni |

```json
// POST /plans/PLAN-0042/decisions
{ "decision": "MODIFY",                          // APPROVE | MODIFY | REJECT
  "reason": "Spostata la saldatura per la manutenzione della S2",   // obbligatorio con MODIFY e REJECT
  "changes": [ { "activityId": "C101-A4", "resourceId": "SAL1", "start": 600 } ] }   // start nella scala del Gantt
// -> 201 { "planId": "PLAN-0042.1", "status": "PROPOSED" }   (con MODIFY: nuova versione)
// MODIFY è verificata dal backend con le stesse regole del frontend (precedenze, risorsa ammessa,
// sovrapposizioni, indisponibilità, periodo): se non è ammissibile -> 422 con path "changes[i]".
// Decisione su piano non PROPOSED -> 409.
```

### A.6 Execution, segnalazioni, avvisi e KPI

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| GET | `/operator/today` | OPERATOR | Le attività di oggi dell'operatore collegato *(v1.1)* |
| POST | `/executions` | OPERATOR | Registra inizio, pausa, ripresa, fine di un'attività |
| GET | `/executions?planId=` | tutti | Esecuzione reale di un piano |
| POST | `/incidents` | OPERATOR | Segnalazione di un problema *(v1.1)* |
| GET | `/alerts` | PLANNER, ADMIN | Avvisi aperti per la dashboard *(v1.1)* |
| GET | `/kpis?from=&to=&profile=` | tutti | Serie storiche KPI (dashboard) |

```json
// GET /operator/today -> 200
{ "date": "2026-11-25", "operatorName": "Marco Rossi", "department": "Reparto saldatura",
  "shifts": [ { "start": "08:00", "end": "12:00" }, { "start": "13:00", "end": "17:00" } ],
  "resources": [ { "id": "SAL1", "name": "Saldatrice S1" }, { "id": "SAL2", "name": "Saldatrice S2" } ],
  "activities": [
    { "planId": "PLAN-0037", "activityId": "C101-A4", "activityName": "Saldatura telaio",
      "orderId": "C-101", "customer": "Rinaldi Carrelli", "resourceId": "SAL1", "resourceName": "Saldatrice S1",
      "plannedStart": "...", "plannedEnd": "...",
      "state": "IN_PROGRESS",                    // TODO | IN_PROGRESS | PAUSED | DONE, ricavato dagli eventi
      "workedMin": 0, "runningSince": "...", "actualStart": "...", "actualEnd": null,
      "waitingFor": null } ] }                   // { activityName, plannedEnd } se una precedente non è finita

// POST /executions
{ "planId": "PLAN-0037", "activityId": "C101-A4", "resourceIds": ["SAL1"],
  "event": "END",                                // START | PAUSE | RESUME | END
  "timestamp": "2026-11-25T11:52:00+01:00", "note": "..." }
// -> 201 con l'attività aggiornata (stesso formato di operator/today).
// 409 se il passaggio non è ammesso: un'attività alla volta in corso, niente inizio prima della
// fine delle precedenti, niente ripresa o fine di un'attività non iniziata.

// POST /incidents  -> 201 { "id": "AL-32" }; 422 se manca la nota con OTHER
{ "kind": "BREAKDOWN",                           // BREAKDOWN | MISSING_MATERIAL | DELAY | OTHER
  "resourceId": "SAL2", "planId": "PLAN-0037", "activityId": "C101-A4",
  "note": "Non si accende", "timestamp": "..." }

// GET /alerts -> 200   (ogni segnalazione diventa un avviso INCIDENT)
[ { "id": "AL-31", "type": "INCIDENT",           // INCIDENT | PLANS_TO_REVIEW | MAINTENANCE
    "title": "Guasto segnalato da M. Rossi", "detail": "Saldatrice S2 non si accende", "createdAt": "...",
    "link": { "label": "Ripianifica", "planId": "PLAN-0037" },     // oppure planRequestId
    "event": { "type": "RESOURCE_DOWN", "resourceId": "SAL2", "from": "...", "to": null } } ]
// "event" serve alla pagina Ripianifica: il problema è già noto e non si richiede.

// GET /kpis -> 200
{ "points": [ { "date": "2026-11-23", "makespanMin": 2310, "lateOrders": 1, "avgUtilization": 0.78,
                "planAdherence": 0.91, "onTimeRate": 0.94 } ],    // una riga per settimana
  "utilizationByResource": [ { "resourceId": "CNC1", "resourceName": "Fresa CNC 1", "utilization": 0.92 } ] }
```

> La **modalità shadow** (piano AI calcolato accanto a quello reale senza applicarlo) è stata
> tolta dal progetto il 25/11/2026: niente `mode: SHADOW` né `GET /kpis/shadow`.

### A.7 Model Info (sola lettura)

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| GET | `/models/active` | tutti | Versione attiva di M1 e M2 + metriche |
| GET | `/models` | ADMIN | Storico versioni |
| GET | `/models/status` | tutti | Servizi attivi e uso del metodo di riserva *(v1.1)* |

```json
// GET /models/active  (datasetVersion, specVersion e le metriche segnate: v1.1)
{ "policy":  { "version": "m2-policy-1.3.0", "publishedAt": "2026-10-28T12:00:00Z",
               "datasetVersion": "ds-2026-10-25", "specVersion": "1.0",
               "metrics": { "gapVsCpSat": 0.04, "winRateVsAtc": 0.81, "winRateVsEdd": 0.93, "avgInferenceMs": 420 } },
  "context": { "version": "m1-context-1.1.0", "publishedAt": "2026-10-20T09:00:00Z",
               "datasetVersion": "ds-2026-10-18", "specVersion": "1.0",
               "metrics": { "durationMape": 0.12, "weeklyEstimates": 38, "intervalCoverage": 0.8, "avgInferenceMs": 35 } } }
// Il frontend mostra solo le metriche che riceve.

// GET /models -> 200
[ { "version": "m2-policy-1.4.0-rc1", "component": "POLICY",   // POLICY | CONTEXT
    "publishedAt": "...", "status": "CANDIDATE",                 // ACTIVE | CANDIDATE | RETIRED
    "metrics": { "gapVsCpSat": 0.036 } } ]

// GET /models/status -> 200
{ "aiServiceUp": true, "cpSatAvailable": true, "confidenceThreshold": 0.6, "days": 30,
  "plansBySolver": { "POLICY": 39, "CP_SAT": 2, "ATC": 1, "EDD": 0 } }
```

Nessun endpoint di scrittura: un modello si pubblica solo dalla pipeline (contratto C).

### A.8 Audit

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| GET | `/audit?planId=&from=&to=&action=&user=` | ADMIN | Record di tracciabilità, dal più recente |

```json
{ "id": "AUD-0912", "timestamp": "2026-11-25T09:15:00+01:00", "planId": "PLAN-0041",
  "user": "pianificatore",                       // "system" per gli eventi automatici
  "action": "PLAN_GENERATED",                    // PLAN_GENERATED | DECISION | RESCHEDULE | FALLBACK_USED
  "modelVersion": "m2-policy-1.3.0", "solver": "POLICY",
  "inputHash": "sha256:9f2c...", "outputHash": "sha256:41ab...",   // outputHash null se non c'è un piano
  "details": {                                   // v1.1: per leggere il record senza aprire il piano
    "decision": null, "reason": null, "newPlanId": null, "changes": null,
    "planIds": ["PLAN-0041", "PLAN-0042", "PLAN-0043"],   // con PLAN_GENERATED
    "confidence": null, "trigger": null } }      // con FALLBACK_USED / RESCHEDULE: la causa
```

L'hash della ProblemSpec permette di riprodurre esattamente il piano (stesso input +
stessa versione del modello). L'export CSV lo fa il frontend dai record filtrati.

---

## B. API di ottimizzazione (Backend AI Client -> Inference Service)

Endpoint **interni**, non raggiungibili dal frontend. Autenticazione tra servizi
con chiave condivisa (`X-Service-Key`) o mTLS.

| Metodo | Path | Descrizione |
|--------|------|-------------|
| POST | `/optimize` | ProblemSpec -> PlanResult (sincrono) |
| POST | `/validate` | Solo validazione della ProblemSpec (usato dall'editor e nei test) |
| GET | `/health` | Liveness/readiness + versioni modelli caricati |

### B.1 Request: `ProblemSpec`

Documento autosufficiente e indipendente dal dominio: l'AI non conosce il DB.

```json
{
  "spec_version": "1.0",
  "request_id": "PLAN-0041",
  "domain_profile": "FACTORY",
  "horizon": { "start": "2026-11-06T08:00:00+01:00", "length_min": 10080 },
  "objective_weights": { "makespan": 0.2, "weighted_tardiness": 0.6, "setup": 0.2 },

  "resources": [
    { "id": "R-CNC-01", "type": "MACHINE", "capacity": 1, "skills": ["TORNITURA"],
      "availability": [ [0, 480], [1440, 1920] ] }       // finestre [inizio, fine) in minuti
  ],

  "jobs": [
    { "id": "ORD-0012", "release_min": 0, "due_min": 6240, "weight": 2.0, "priority": 3 }
  ],

  "activities": [
    { "id": "A1", "job_id": "ORD-0012", "required_skills": ["TAGLIO"],
      "modes": [ { "resource_ids": ["R-SEGA-01"], "duration_min": 45 },
                 { "resource_ids": ["R-SEGA-02"], "duration_min": 60 } ],
      "features": { "material": "ACCIAIO", "batch_size": 20 } },   // usate da M1 per stimare
    { "id": "A2", "job_id": "ORD-0012", "required_skills": ["TORNITURA"],
      "modes": [ { "resource_ids": ["R-CNC-01"], "duration_min": null } ] }
  ],

  "precedences": [ { "from": "A1", "to": "A2", "type": "FS", "min_lag_min": 0, "max_lag_min": null } ],

  "setup_times": [                                 // setup dipendenti dalla sequenza
    { "resource_id": "R-CNC-01", "from_activity": "A2", "to_activity": "A7", "duration_min": 15 }
  ],

  "fixed_assignments": [                           // rischedulazione: attività congelate
    { "activity_id": "A0", "resource_ids": ["R-SEGA-01"], "start_min": 0, "end_min": 30 }
  ],

  "options": {
    "time_limit_ms": 5000,
    "allow_fallback": true,
    "fallback_chain": ["CP_SAT", "ATC", "EDD"],    // CP_SAT ancora da confermare
    "min_confidence": 0.6,                         // sotto soglia -> fallback
    "seed": 42
  }
}
```

Regole di validazione (`API & Validation`, errore 422 con `code`):

| Code | Regola |
|------|--------|
| `CYCLIC_PRECEDENCE` | Il grafo delle precedenze deve essere aciclico |
| `UNKNOWN_RESOURCE` / `UNKNOWN_ACTIVITY` / `UNKNOWN_JOB` | Riferimenti a ID inesistenti |
| `NO_FEASIBLE_MODE` | Nessuna risorsa ha le competenze richieste |
| `INVALID_WINDOW` | Finestre di disponibilità sovrapposte o fuori orizzonte |
| `INVALID_WEIGHTS` | Pesi negativi o tutti nulli |
| `FIXED_CONFLICT` | Attività congelate in conflitto tra loro |
| `UNSUPPORTED_SPEC_VERSION` | Major di `spec_version` non supportata |

### B.2 Response: `PlanResult`

```json
{
  "request_id": "PLAN-0041",
  "status": "OK",                                  // OK | FALLBACK | INFEASIBLE
  "solver": "POLICY",                              // POLICY | CP_SAT | ATC | EDD
  "fallback_reason": null,                         // ERROR | LOW_CONFIDENCE | TIMEOUT
  "model_versions": { "context": "m1-context-1.1.0", "policy": "m2-policy-1.3.0" },
  "confidence": 0.87,

  "assignments": [
    { "activity_id": "A1", "mode_index": 0, "resource_ids": ["R-SEGA-01"], "start_min": 30, "end_min": 75 },
    { "activity_id": "A2", "mode_index": 0, "resource_ids": ["R-CNC-01"],  "start_min": 75, "end_min": 165 }
  ],

  "context_adjustments": [                         // cosa ha stimato/corretto M1
    { "activity_id": "A2", "field": "duration_min", "value": 90, "source": "M1_ESTIMATE", "uncertainty": 12 }
  ],

  "kpis": { "makespan_min": 2310, "weighted_tardiness": 120.5, "late_jobs": 1,
            "total_setup_min": 95, "avg_utilization": 0.78 },

  "warnings": [],
  "timing_ms": { "validation": 8, "context": 35, "policy": 377, "total": 420 }
}
```

Garanzie del contratto:
- Con `status` `OK` o `FALLBACK` il piano è **sempre ammissibile** (precedenze,
  capacità, disponibilità, attività fisse rispettate): ogni attività compare una sola volta.
- `INFEASIBLE` (200, non errore) quando il problema non ha soluzione nell'orizzonte;
  `assignments` vuoto e `warnings` con la causa.
- Il servizio risponde entro `time_limit_ms` + margine; l'AI Client usa un timeout
  leggermente maggiore.

### B.3 `GET /health`

```json
{ "status": "UP", "models_loaded": { "context": "m1-context-1.1.0", "policy": "m2-policy-1.3.0" },
  "cp_sat_available": true }
```

### B.4 Comportamento dell'AI Client (Resilience4j)

| Parametro | Valore iniziale |
|-----------|-----------------|
| Timeout | `time_limit_ms` + 2 s |
| Retry | 2 tentativi, backoff 500 ms, solo su 503 e timeout (mai su 422) |
| Circuit breaker | apre al 50% di errori su 20 chiamate, riprova dopo 30 s |
| Circuit aperto | Il piano passa a `FAILED`, audit `AI_UNAVAILABLE`; il backend non calcola piani in proprio |

`request_id` rende `/optimize` idempotente: un retry con lo stesso id restituisce lo
stesso risultato (cache di breve durata nel servizio).

---

## C. Registrazione modelli (Model Publisher -> DB Model Metadata)

Il Model Publisher scrive una riga per ogni versione approvata; il backend la legge
per `/models/active`, l'Inference Service la usa (tramite Model Loader) per sapere
quale artefatto caricare.

```json
{
  "version": "m2-policy-1.3.0",
  "component": "POLICY",                           // POLICY | CONTEXT
  "artifact_uri": "models/policy/1.3.0/model.onnx",
  "artifact_sha256": "a3f1...",
  "dataset_version": "ds-2026-10-25",
  "spec_versions_supported": ["1.0"],
  "metrics": { "gap_vs_cp_sat": 0.04, "win_rate_vs_atc": 0.81, "win_rate_vs_edd": 0.93,
               "avg_inference_ms": 420 },
  "status": "ACTIVE",                              // CANDIDATE | ACTIVE | RETIRED
  "published_at": "2026-10-28T12:00:00Z"
}
```

Regole: una sola versione `ACTIVE` per componente; una versione diventa `ACTIVE`
solo se l'Evaluation la giudica non peggiore di ATC/EDD.

---

## D. Unified Instance Schema (Converters -> Generator / Evaluation)

I convertitori (Brandimarte, PSPLIB, MSLIB, log BPIC, ...) producono **lo stesso
formato della ProblemSpec** (sezioni `resources`, `jobs`, `activities`,
`precedences`, `setup_times`), più un blocco `source`:

```json
{ "source": { "dataset": "Brandimarte", "instance": "Mk01", "license": "MIT",
              "best_known": { "makespan": 40, "optimal": true } } }
```

Usare un solo schema per training, valutazione e inferenza significa che il modello
vede in produzione esattamente la stessa struttura su cui è stato addestrato.

---

## Punti aperti

1. CP-SAT come fallback online: dipende dai tempi su istanze grandi (`fallback_chain`).
2. Integrazione KPI: gli endpoint A.6 sono il minimo se confermata.
3. Polling vs WebSocket/SSE per lo stato della richiesta (per ora polling su `GET /plan-requests/{id}`).
4. Schema OpenAPI: generare `openapi.yaml` da Spring (springdoc) e da FastAPI
   (automatico) e confrontarlo con questo documento.
5. Come l'AI produce i 3 piani: tre chiamate a `/optimize` con pesi diversi, oppure una
   chiamata che restituisce più piani (estensione di B.2). Il contratto A non cambia.
