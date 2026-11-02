# Contratti API - P06 Scheduling con AI

Documento di riferimento per le interfacce tra i blocchi dell'architettura
(vedi `Spiegazione_architettura_VPP.txt`). Versione contratti: **v1 (bozza)**.

```
 Frontend (Angular) ──[A: REST pubblica /api/v1, JWT]──> Backend (Spring Boot)
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
  (convenzioni native di Python e Java/Angular; la traduzione la fa l'AI Client).
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

Base URL: `/api/v1`. Tutte le chiamate (tranne login) richiedono
`Authorization: Bearer <JWT>`. Ruoli: `PLANNER`, `OPERATOR`, `ADMIN`.

### A.1 Auth & Roles (componente Security)

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| POST | `/auth/login` | pubblico | Credenziali -> access + refresh token |
| POST | `/auth/refresh` | pubblico | Rinnovo access token |
| GET | `/auth/me` | tutti | Utente corrente e ruoli |

```json
// POST /auth/login  -> 200
{ "accessToken": "eyJ...", "refreshToken": "eyJ...", "expiresIn": 900,
  "user": { "id": "U-1", "username": "mrossi", "roles": ["PLANNER"] } }
```

### A.2 Configuration (risorse, calendari, competenze, profili)

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| GET / POST | `/resources` | lettura: tutti; scrittura: ADMIN | Elenco / creazione risorse |
| GET / PUT / DELETE | `/resources/{id}` | idem | Dettaglio / modifica / disattivazione |
| GET / POST | `/calendars` | idem | Turni, festività, indisponibilità |
| GET / POST | `/skills` | idem | Competenze |
| GET | `/domain-profiles` | tutti | Profili disponibili (`FACTORY`, `PA`, `PROJECT`, ...) |
| GET / PUT | `/domain-profiles/{code}` | ADMIN | Pesi di default degli obiettivi, vincoli attivi |

```json
// Resource
{ "id": "R-CNC-01", "name": "Tornio CNC 1", "type": "MACHINE",   // MACHINE | PERSON | ROOM
  "capacity": 1, "skills": ["TORNITURA"], "calendarId": "CAL-2TURNI", "active": true }

// DomainProfile
{ "code": "FACTORY", "description": "Job shop flessibile con setup",
  "defaultObjectiveWeights": { "makespan": 0.3, "weightedTardiness": 0.5, "setup": 0.2 },
  "features": ["SEQUENCE_DEPENDENT_SETUP", "ALTERNATIVE_RESOURCES"] }
```

### A.3 Orders & Process Graph

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| GET / POST | `/orders` | PLANNER, ADMIN | Elenco (filtri `status`, `dueBefore`) / creazione |
| GET / PUT / DELETE | `/orders/{id}` | PLANNER, ADMIN | |
| PATCH | `/orders/{id}/priority` | PLANNER | Cambio priorità |
| GET / PUT | `/orders/{id}/process-graph` | PLANNER | Attività + precedenze dell'ordine (editor a grafo) |

```json
// Order
{ "id": "ORD-0012", "customer": "ACME", "domainProfile": "FACTORY",
  "releaseDate": "2026-11-06T08:00:00+01:00", "dueDate": "2026-11-10T18:00:00+01:00",
  "priority": 3, "weight": 2.0, "status": "OPEN" }     // OPEN | PLANNED | IN_PROGRESS | DONE | CANCELLED

// PUT /orders/{id}/process-graph
{ "activities": [
    { "id": "A1", "name": "Taglio", "requiredSkills": ["TAGLIO"],
      "modes": [ { "resourceIds": ["R-SEGA-01"], "durationMin": 45 },
                 { "resourceIds": ["R-SEGA-02"], "durationMin": 60 } ] },
    { "id": "A2", "name": "Tornitura", "requiredSkills": ["TORNITURA"],
      "modes": [ { "resourceIds": ["R-CNC-01"], "durationMin": null } ] }   // null = da stimare (M1)
  ],
  "precedences": [ { "from": "A1", "to": "A2", "type": "FS", "minLagMin": 0, "maxLagMin": null } ] }
```

Il backend rifiuta con 422 un grafo con cicli già in fase di salvataggio.

### A.4 Planning & Gantt

La generazione è **asincrona**: l'inferenza dura pochi secondi, ma con il fallback
CP-SAT può durare di più e non si vuole tenere aperta la richiesta HTTP.

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| POST | `/plans` | PLANNER | Richiede un nuovo piano -> `202 Accepted` + `Location` |
| GET | `/plans` | tutti | Elenco piani (filtri `status`, `from`, `to`) |
| GET | `/plans/{id}` | tutti | Stato e risultato (polling) |
| GET | `/plans/{id}/gantt` | tutti | Vista pronta per il Gantt (righe per risorsa) |
| GET | `/plans/{id}/compare?baselineId=` | tutti | Confronto KPI con il piano di riferimento |
| POST | `/plans/{id}/reschedule` | PLANNER | Rischedulazione da un evento (guasto, urgenza) |

```json
// POST /plans
{ "orderIds": ["ORD-0012", "ORD-0013"],          // vuoto = tutti gli ordini OPEN
  "domainProfile": "FACTORY",
  "horizonStart": "2026-11-06T08:00:00+01:00",
  "horizonEnd":   "2026-11-13T18:00:00+01:00",
  "objectiveWeights": { "makespan": 0.2, "weightedTardiness": 0.6, "setup": 0.2 },  // opzionale: default del profilo
  "baselinePlanId": "PLAN-0040",                 // opzionale
  "mode": "NORMAL" }                             // NORMAL | SHADOW

// 202 Accepted   Location: /api/v1/plans/PLAN-0041
{ "id": "PLAN-0041", "status": "PENDING" }

// GET /plans/PLAN-0041  -> 200
{ "id": "PLAN-0041", "status": "PROPOSED",       // PENDING | PROPOSED | APPROVED | REJECTED | SUPERSEDED | FAILED
  "createdAt": "2026-11-06T08:00:03+01:00", "createdBy": "mrossi",
  "solver": "POLICY", "modelVersion": "m2-policy-1.3.0", "confidence": 0.87,
  "kpis": { "makespanMin": 2310, "weightedTardiness": 120.5, "lateOrders": 1,
            "totalSetupMin": 95, "avgUtilization": 0.78 },
  "warnings": ["Durata di A2 stimata dal modello (nessun dato inserito)"],
  "assignments": [
    { "activityId": "A1", "orderId": "ORD-0012", "resourceIds": ["R-SEGA-01"],
      "start": "2026-11-06T08:00:00+01:00", "end": "2026-11-06T08:45:00+01:00" } ] }

// POST /plans/{id}/reschedule
{ "event": { "type": "RESOURCE_DOWN",           // RESOURCE_DOWN | URGENT_ORDER | DELAY
             "resourceId": "R-CNC-01",
             "from": "2026-11-07T10:00:00+01:00", "to": "2026-11-07T16:00:00+01:00" },
  "freezeBefore": "2026-11-07T10:00:00+01:00" }  // attività già iniziate/precedenti restano fisse
// -> 202 con un nuovo piano PENDING che punta a quello di origine
```

### A.5 Plan Review (componente Decisions)

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| POST | `/plans/{id}/decisions` | PLANNER | Approva, modifica o rifiuta il piano |
| GET | `/plans/{id}/decisions` | tutti | Storico decisioni |

```json
// POST /plans/PLAN-0041/decisions
{ "decision": "MODIFY",                          // APPROVE | MODIFY | REJECT
  "reason": "Spostata A2 per manutenzione programmata",
  "changes": [ { "activityId": "A2", "resourceIds": ["R-CNC-02"],
                 "start": "2026-11-06T10:00:00+01:00" } ] }
// -> 201. MODIFY genera una nuova versione del piano, verificata dal backend
//    (precedenze e capacità); se non è ammissibile -> 422.
// Decisione su piano non PROPOSED -> 409.
```

### A.6 Execution & KPI

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| POST | `/executions` | OPERATOR | Registra inizio/fine reale di un'attività |
| GET | `/executions?planId=` | tutti | Esecuzione reale di un piano |
| GET | `/kpis?from=&to=&profile=` | tutti | Serie storiche KPI (dashboard) |
| GET | `/kpis/shadow?from=&to=` | PLANNER, ADMIN | Confronto piano AI (shadow) vs piano reale |

```json
// POST /executions
{ "planId": "PLAN-0041", "activityId": "A1", "resourceIds": ["R-SEGA-01"],
  "event": "END",                                // START | END | PAUSE | RESUME
  "timestamp": "2026-11-06T08:52:00+01:00", "note": "Lama sostituita" }

// GET /kpis -> 200
{ "points": [ { "date": "2026-11-06", "makespanMin": 2310, "lateOrders": 1,
                "avgUtilization": 0.78, "planAdherence": 0.91 } ] }
```

> Punto aperto: l'integrazione dei KPI è ancora da decidere; questi endpoint sono
> il perimetro minimo se la si conferma.

### A.7 Model Info (sola lettura)

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| GET | `/models/active` | tutti | Versione attiva di M1 e M2 + metriche |
| GET | `/models` | ADMIN | Storico versioni |

```json
// GET /models/active
{ "policy":  { "version": "m2-policy-1.3.0", "publishedAt": "2026-10-28T12:00:00Z",
               "metrics": { "gapVsCpSat": 0.04, "winRateVsAtc": 0.81, "avgInferenceMs": 420 } },
  "context": { "version": "m1-context-1.1.0", "publishedAt": "2026-10-20T09:00:00Z",
               "metrics": { "durationMape": 0.12 } } }
```

Nessun endpoint di scrittura: un modello si pubblica solo dalla pipeline (contratto C).

### A.8 Audit

| Metodo | Path | Ruoli | Descrizione |
|--------|------|-------|-------------|
| GET | `/audit?planId=&from=&to=` | ADMIN | Record di tracciabilità |

```json
{ "id": "AUD-901", "timestamp": "2026-11-06T08:00:03+01:00", "planId": "PLAN-0041",
  "user": "mrossi", "action": "PLAN_GENERATED",  // PLAN_GENERATED | DECISION | RESCHEDULE | FALLBACK_USED
  "modelVersion": "m2-policy-1.3.0", "solver": "POLICY",
  "inputHash": "sha256:9f2c...", "outputHash": "sha256:41ab..." }
```

L'hash della ProblemSpec permette di riprodurre esattamente il piano (stesso input +
stessa versione del modello).

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
  "mode": "NORMAL",                               // NORMAL | SHADOW
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
3. Polling vs WebSocket/SSE per lo stato del piano (per ora polling su `GET /plans/{id}`).
4. Schema OpenAPI: generare `openapi.yaml` da Spring (springdoc) e da FastAPI
   (automatico) e confrontarlo con questo documento.
