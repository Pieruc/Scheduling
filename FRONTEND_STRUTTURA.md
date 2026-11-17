# Frontend FlowSync – Struttura del progetto

Documento di riferimento per lo sviluppo del frontend (React). Le schermate da
realizzare sono in `FE_Mockups/FlowSync – Mockup UI v2.html`; le API sono in
`CONTRATTI_API.md` (contratto A).

## 1. Perimetro

- Il frontend parla **solo** con il backend, tramite l'API pubblica `/api/v1`.
  Non chiama mai l'AI, l'LLM o il DB direttamente.
- Backend, servizio AI, LLM e training li sviluppano altri membri del gruppo. Quando
  al frontend serve un dato che il contratto non prevede, si chiede al backend
  (vedi §8) e nel frattempo lo si simula con i mock.
- **Login e ruoli si fanno per ultimi**, a sistema funzionante. Fino ad allora l'app
  gira come utente PLANNER fisso, ma la struttura lascia già il posto per
  aggiungerli senza riscrivere nulla (vedi §5.4).

## 2. Stack

| Ambito | Scelta | Perché |
|---|---|---|
| Build | **Vite** + **React** + **TypeScript** | Standard attuale, avvio rapido |
| Componenti UI | **PrimeReact 10** | Tabelle, tab, slider, stepper, tag, dialog già pronti, licenza MIT. La 11 non ha temi pronti e ha licenza commerciale. Tema: `npm run theme` |
| Routing | **React Router 7** | Rotte annidate, layout condivisi |
| Dati dal server | **TanStack Query** | Cache, caricamento ed errori, polling del piano asincrono |
| Form | **React Hook Form** + **Zod** | Validazione dichiarativa (commesse, risorse) |
| Grafo attività | **React Flow** (`@xyflow/react`) | Editor a nodi con trascinamento dei collegamenti |
| Grafici KPI | **Chart** di PrimeReact (Chart.js) | Già incluso, stesso stile |
| Gantt risorse | **Componente nostro** (vedi §6) | Il mockup ha esigenze molto specifiche |
| Date | **date-fns** (locale `it`) | Formati “gio 19, 8:00”, “4 g 6 h” |
| Mock API | **MSW 3** (Mock Service Worker) | Intercetta le chiamate HTTP vere: basta spegnerlo quando il backend è pronto. Errore simulato: `sessionStorage.setItem('mock:fail', '1')` |
| Test | **Vitest** + **Testing Library** | Unit e componenti |
| Qualità | ESLint + Prettier | |

Lo stato globale (Redux/Zustand) **non serve**: quasi tutto è dato del server
(TanStack Query) e il resto è stato locale della pagina.

## 3. Struttura delle cartelle

```
src/frontend/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.development          VITE_API_URL=/api/v1 · VITE_USE_MOCKS=true
├── public/
│   └── mockServiceWorker.js  (generato da MSW)
└── src/
    ├── main.tsx              avvio: provider, router, MSW se VITE_USE_MOCKS
    ├── app/
    │   ├── router.tsx        tutte le rotte (§4)
    │   ├── providers.tsx     PrimeReact, QueryClient, (poi) AuthProvider
    │   └── layouts/
    │       ├── AppLayout.tsx       sidebar + area contenuti (planner/admin)
    │       ├── Sidebar.tsx
    │       └── OperatorLayout.tsx  barra in alto, niente sidebar
    │
    ├── api/                  ⇦ unico punto che conosce gli URL del backend
    │   ├── client.ts         fetch + base URL + header + errori RFC 7807 → ApiError
    │   ├── queryKeys.ts      chiavi della cache centralizzate
    │   ├── types/            DTO del contratto A, uno per area
    │   │   ├── common.ts     ProblemDetails, Page, Iso date
    │   │   ├── orders.ts     Order, ProcessGraph, Activity, Precedence
    │   │   ├── plans.ts      PlanRequest, Plan, PlanVariant, Kpis, Assignment, Decision
    │   │   ├── config.ts     Resource, Calendar, Skill, DomainProfile
    │   │   ├── execution.ts  ExecutionEvent, Incident
    │   │   ├── models.ts     ModelVersion, ActiveModels
    │   │   └── audit.ts      AuditRecord
    │   ├── orders.ts         getOrders(), saveProcessGraph(), …
    │   ├── plans.ts          createPlanRequest(), getPlanRequest(), decide(), …
    │   ├── config.ts
    │   ├── execution.ts
    │   ├── models.ts
    │   ├── audit.ts
    │   └── kpis.ts
    │
    ├── mocks/                ⇦ backend finto, stessi formati del contratto
    │   ├── browser.ts        setupWorker(...handlers)
    │   ├── data/             commesse C-101…C-104, risorse, piani A/B/C, audit…
    │   └── handlers/         uno per area, rispondono come il backend (anche 202 + polling)
    │
    ├── features/             ⇦ una cartella per pagina/area del sistema
    │   ├── dashboard/
    │   │   ├── DashboardPage.tsx
    │   │   └── components/   KpiRow, AlertsList, UtilizationBars, RecentPlans
    │   ├── orders/
    │   │   ├── OrdersPage.tsx
    │   │   ├── components/   OrderList, OrderHeader, ProcessGraphEditor, ActivityTable, OrderForm
    │   │   ├── hooks.ts      useOrders, useOrder, useProcessGraph, useSaveProcessGraph
    │   │   └── graph.ts      controllo cicli lato client (feedback immediato)
    │   ├── planning/         nuova pianificazione
    │   │   ├── NewPlanPage.tsx
    │   │   ├── components/   PipelineSteps, RequestInput, Interpretation, MissingDataForm, ObjectiveWeights
    │   │   └── hooks.ts      useInterpretRequest, useCreatePlanRequest
    │   ├── plans/            elenco piani + confronto dei 3 candidati
    │   │   ├── PlansListPage.tsx
    │   │   ├── CandidatesPage.tsx
    │   │   ├── components/   PlansTable, PlanCard, BaselineComparison
    │   │   └── hooks.ts      usePlanRequests, usePlanRequest (polling finché PENDING)
    │   ├── plan-review/      Gantt, modifica, approva/rifiuta
    │   │   ├── PlanGanttPage.tsx
    │   │   ├── gantt/        GanttChart, GanttLane, GanttBar, TimeAxis, scale.ts (tempo ↔ pixel)
    │   │   ├── components/   PlanKpis, DecisionBar, ActivityPanel, MoveErrorBanner
    │   │   ├── validation.ts controllo spostamenti (precedenze, sovrapposizioni, indisponibilità)
    │   │   └── hooks.ts      usePlan, useGantt, useDecision, useReschedule
    │   ├── execution/        vista operatore
    │   │   ├── OperatorTodayPage.tsx
    │   │   └── components/   CurrentActivity, NextActivities, ReportIssueForm
    │   ├── configuration/
    │   │   ├── ConfigurationPage.tsx   (tab)
    │   │   ├── resources/ calendars/ skills/ profiles/
    │   ├── model-info/
    │   │   └── ModelInfoPage.tsx
    │   ├── audit/
    │   │   └── AuditPage.tsx
    │   └── auth/             ⇦ fase finale
    │       ├── LoginPage.tsx
    │       ├── AuthProvider.tsx
    │       └── RequireRole.tsx
    │
    ├── components/           componenti condivisi tra feature
    │   ├── PageHeader.tsx  KpiCard.tsx  StatusTag.tsx  PriorityTag.tsx
    │   ├── ErrorState.tsx  EmptyState.tsx  LoadingState.tsx
    │   └── Duration.tsx    Money.tsx
    ├── lib/
    │   ├── format.ts         durate (“4 g 6 h”), date it-IT, euro
    │   ├── labels.ts         stati/priorità/varianti → etichetta + colore
    │   └── time.ts           conversioni minuti ↔ date per il Gantt
    └── styles/
        ├── tokens.css        colori e spaziature presi dal mockup
        └── primereact.css    personalizzazione del tema PrimeReact
```

**Regola**: le pagine non chiamano mai `fetch` direttamente. Passano dagli hook
della propria feature, che usano le funzioni in `api/`. Se il backend cambia un
URL o un campo, si tocca solo `api/`.

## 4. Pagine e rotte

| Rotta | Pagina | Mockup v2 | Endpoint principali |
|---|---|---|---|
| `/` | Dashboard | 1 | `GET /kpis`, `GET /alerts`\*, `GET /plans` |
| `/commesse` · `/commesse/:id` | Commesse + grafo | 2 | `GET/POST/PUT /orders`, `GET/PUT /orders/{id}/process-graph` |
| `/pianifica` | Nuova pianificazione | 3 | `POST /plan-requests/interpret`\*, `POST /plan-requests`\* |
| `/piani` | Elenco piani | 7 | `GET /plan-requests`\* |
| `/piani/richieste/:id` | Confronto dei 3 piani | 4 | `GET /plan-requests/{id}`\* |
| `/piani/:planId` | Gantt e revisione | 5 | `GET /plans/{id}/gantt`, `POST /plans/{id}/decisions`, `POST /plans/{id}/reschedule` |
| `/operatore` | Attività di oggi | 6 | `GET /executions`, `POST /executions`, `POST /incidents`\* |
| `/configurazione/:tab` | Configurazione | 8 | `/resources`, `/calendars`, `/skills`, `/domain-profiles` |
| `/modello` | Modello AI | 9 | `GET /models/active`, `GET /models` |
| `/audit` | Audit | 10 | `GET /audit` |
| `/login` | Login (fase finale) | 0 | `POST /auth/login`, `/auth/refresh`, `/auth/me` |

\* = endpoint non ancora presente in `CONTRATTI_API.md`, da concordare (§8).

## 5. Come si gestiscono i dati

### 5.1 Mock prima, backend dopo
Con `VITE_USE_MOCKS=true` MSW risponde al posto del backend con i dati di
`mocks/data/`, usando **gli stessi formati JSON** del contratto. Quando un endpoint
reale è pronto basta togliere il suo handler (o mettere il flag a `false`): il
codice delle pagine non cambia. In dev `vite.config.ts` fa da proxy da `/api` al
backend Spring.

### 5.2 Piani asincroni
`POST` della richiesta → `202` con id → `usePlanRequest(id)` ripete la `GET` ogni
~1,5 s finché lo stato è `PENDING` (opzione `refetchInterval` di TanStack Query),
poi si ferma. Lo stepper della pagina 3 mostra a che punto si trova.

### 5.3 Errori
`api/client.ts` converte ogni risposta `application/problem+json` in `ApiError`
(`status`, `title`, `errors[]`). Le pagine li mostrano così:
- `422` → messaggi vicino ai campi o al grafo (es. `CYCLIC_PRECEDENCE`);
- `409` → “il piano è cambiato, ricarica”;
- `503` → banner “servizio AI non disponibile”.

### 5.4 Predisposizione per login e ruoli
- `client.ts` ha già un punto in cui aggiungere `Authorization: Bearer …`.
- Le rotte stanno in un solo file: aggiungere `RequireRole` è una riga per rotta.
- La sidebar legge le voci da un array: basta aggiungere un campo `roles`.

## 6. Il Gantt delle risorse

Nella schermata 5 il Gantt:
- ha una riga per risorsa;
- ha barre trascinabili nel tempo **e** da una risorsa all'altra;
- mostra fasce di indisponibilità e di straordinario;
- dice subito se uno spostamento non è valido e rimette a posto la barra.

**Scelta: lo costruiamo noi** (`features/plan-review/gantt/`), con CSS grid e
pointer events, come nel mockup. Motivi:
- Le librerie gratuite per React sono quasi tutte orientate ai *task* (una riga
  per attività, stile MS Project), non alle *risorse*.
- Quelle orientate alle risorse sono a pagamento (Bryntum, DHTMLX PRO) oppure poco
  mantenute.
- La parte difficile, cioè capire se lo spostamento è valido, va scritta comunque
  da noi (`validation.ts`).
- Disegnare le barre è semplice: `left = (inizio − inizioOrizzonte) / durataOrizzonte`.

Prima di costruirlo conviene un **prototipo di 2–3 giorni**: una riga, una barra
trascinabile con aggancio ai 15 minuti, il cambio di riga. Se va bene si procede,
altrimenti si rivaluta una libreria.

Lo spostamento viene validato due volte:
1. **nel browser, subito**: precedenze, sovrapposizione sulla stessa risorsa,
   indisponibilità e risorse ammesse per l'attività;
2. **nel backend, alla conferma** (`POST /decisions` con `MODIFY`): se risponde
   `422`, si mostra l'errore.

## 7. KPI

Definiti una volta in `api/types/plans.ts` e mostrati sempre con lo stesso nome.

**Di un piano** (card dei 3 piani, Gantt, confronto con ATC/EDD):

| Etichetta UI | Campo | Unità |
|---|---|---|
| Durata totale | `makespanMin` | minuti → “4 g 6 h” |
| Ritardo totale | `totalTardinessMin` (+ `lateOrders`) | minuti → “3 h (C-104)” |
| Straordinari | `overtimeMin` | minuti |
| Cambi di setup | `setupCount` (+ `totalSetupMin`) | numero |
| Utilizzo medio | `avgUtilization` | 0–1 → % |
| Costo stimato | `estimatedCost` | € (richiede il costo orario delle risorse) |

**Storici** (dashboard): puntualità %, commesse in ritardo, utilizzo medio per
risorsa, aderenza al piano (`planAdherence`).

## 8. Da concordare con il backend

Il frontend le simula già nei mock. Le forme JSON sono **proposte**: le decide
chi fa il backend.

1. **I 3 piani per richiesta.** Una richiesta produce i piani `ECONOMIC`
   (più lento, costo minimo), `BALANCED` e `FAST` (più veloce, più costoso), più il
   confronto con le regole ATC ed EDD sugli stessi dati. Proposta:
   `POST /plan-requests` → `202 { id, status }`;
   `GET /plan-requests/{id}` → `{ status, plans: [{ id, variant, kpis, … }×3], baselines: [{ solver: "ATC", kpis }, { solver: "EDD", kpis }] }`.
   I singoli piani restano su `/plans/{id}` (Gantt, decisioni).
2. **Interpretazione LLM** della richiesta a parole: un endpoint che riceve il
   testo e restituisce orizzonte, commesse, vincoli, pesi e **domande sui dati
   mancanti** (es. “C-104 non ha scadenza”).
3. **Nuovi KPI**:
   - nei KPI di un piano: `overtimeMin`, `setupCount`, `estimatedCost` e
     `totalTardinessMin` (ritardo in minuti, più leggibile di `weightedTardiness`);
   - nella serie di `GET /kpis`: `onTimeRate` (quota di commesse consegnate in tempo)
     e `utilizationByResource: [{ resourceId, resourceName, utilization }]`;
   - nelle risorse: `costPerHour`.

   **Unità delle durate**: il frontend mostra "4 g 6 h" assumendo una giornata
   lavorativa di 8 h (`WORKDAY_HOURS` in `src/lib/format.ts`). Da confermare: il
   makespan è in minuti di lavoro o in minuti di calendario?
4. **Stime di M1 nel piano**: per ogni attività con durata stimata, il valore e
   l'intervallo, cioè il `context_adjustments` del contratto B riportato nella
   risposta di `GET /plans/{id}`. Così non serve un endpoint di stima a parte.
5. **Segnalazioni dell'operatore e avvisi**: `POST /incidents` (guasto, materiale
   mancante, ritardo, altro + nota) e `GET /alerts` per la lista “Avvisi” della
   dashboard.
6. **Elenco richieste**: `GET /plan-requests` con filtri per stato e periodo.

## 9. Fasi di lavoro

1. **Fondamenta**: progetto Vite, PrimeReact con i token del mockup, layout e
   sidebar, router con pagine vuote, `api/client.ts`, MSW con i dati del mockup.
2. **Configurazione e commesse**: CRUD risorse (le altre tab dopo), elenco
   commesse, editor del grafo con React Flow. In parallelo, il prototipo del Gantt.
3. **Pianificazione**: nuova pianificazione con stepper e polling, confronto dei 3
   piani, elenco piani.
4. **Gantt e revisione**: Gantt, pannello attività, validazione degli spostamenti,
   approva/modifica/rifiuta, ripianifica.
5. **Resto**: vista operatore, dashboard con KPI, Modello AI, audit.
6. **Integrazione**: si spengono i mock un'area alla volta, poi login e ruoli.
