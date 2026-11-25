# Frontend FlowSync – Struttura del progetto

Documento di riferimento per lo sviluppo del frontend (React). Le schermate di partenza sono in
`FE_Mockups/FlowSync – Mockup UI v2.html`; le API sono in `CONTRATTI_API.md` (contratto A,
versione 1.1). Aggiornato al **25 novembre 2026**.

## 1. Perimetro

- Il frontend parla **solo** con il backend, tramite l'API pubblica `/api/v1`.
  Non chiama mai l'AI, l'LLM o il DB direttamente.
- Backend, servizio AI, LLM e training li sviluppano altri membri del gruppo. Quando al
  frontend serve un dato, lo si aggiunge al contratto e nel frattempo lo si simula con i mock
  (MSW), con lo stesso formato JSON.
- Si lavora **desktop prima**: il layout regge su schermi stretti, ma per ora non si
  progettano né verificano viste per il telefono.

## 2. Stack

| Ambito | Scelta | Perché |
|---|---|---|
| Linguaggio e build | **React 19** + **TypeScript** + **Vite** | Scelto al posto di Angular per le competenze del team; avvio rapido |
| Componenti UI | **PrimeReact 10** + PrimeIcons | Tabelle, dialog, slider, calendario, tag già pronti; licenza MIT. La 11 non ha temi pronti e ha licenza commerciale. Tema ricolorato con `npm run theme` |
| Routing | **React Router 7** | Rotte annidate, layout condivisi, blocco dell'uscita con modifiche non salvate |
| Dati dal server | **TanStack Query 5** | Cache, stati di caricamento ed errore, polling delle richieste asincrone |
| Form | **React Hook Form** + **Zod** | Regole dichiarative, errori sotto il campo, fuoco sul primo errore |
| Grafo attività | **React Flow** (`@xyflow/react`) | Editor a nodi con trascinamento dei collegamenti |
| Gantt risorse | **Componente nostro** (§6) | Le librerie gratuite sono orientate ai task, non alle risorse |
| Date e numeri | `Intl` del browser (it-IT) | Nessuna libreria in più: “gio 19, 8:00”, “4 g 6 h”, “9.600 €” |
| Mock API | **MSW 3** (Mock Service Worker) | Intercetta le chiamate HTTP vere: si spegne quando il backend è pronto |
| Qualità | `tsc` in modalità strict, **oxlint**, **Prettier** | Controllati prima di ogni commit |

Lo stato globale (Redux/Zustand) **non serve**: quasi tutto è dato del server
(TanStack Query) e il resto è stato locale della pagina. La sessione (utente e token) è un
piccolo store in `api/session.ts`.

## 3. Struttura delle cartelle

```
src/frontend/
├── .env.development          VITE_API_URL=/api/v1 · VITE_USE_MOCKS=true
├── vite.config.ts            alias @, plugin MSW, proxy /api -> localhost:8080
├── scripts/build-theme.mjs   tema PrimeReact con i colori del mockup
└── src/
    ├── main.tsx              avvio: stili, MSW se VITE_USE_MOCKS, router
    ├── app/                  router.tsx (tutte le rotte), providers.tsx (PrimeReact, Query,
    │                         sessione, notifiche), layouts/ (barra laterale; barra operatore),
    │                         toast/, locale.ts (italiano), RouteError.tsx
    ├── api/                  ⇦ unico punto che conosce URL e formati del backend
    │   ├── client.ts         fetch, token Bearer, errori RFC 7807 -> ApiError, 401 -> login
    │   ├── session.ts        utente e token (sessionStorage)
    │   ├── queryKeys.ts      chiavi della cache
    │   ├── types/            tipi del contratto A, uno per area
    │   └── auth.ts orders.ts plans.ts config.ts execution.ts alerts.ts kpis.ts models.ts audit.ts
    ├── mocks/                ⇦ backend finto: data/ (officina dei mockup), handlers/ (uno per area)
    ├── features/             ⇦ una cartella per area
    │   ├── auth/             login, sessione, permessi per ruolo, RequireAuth
    │   ├── dashboard/        KPI, avvisi, utilizzo risorse, richieste recenti
    │   ├── orders/           commesse, editor del grafo, tabella attività, form commessa e attività
    │   ├── planning/         nuova pianificazione: testo -> interpretazione -> domande -> invio
    │   ├── plans/            elenco piani, confronto dei 3 piani con ATC/EDD
    │   ├── plan-review/      Gantt, pannello attività, decisioni, ripianificazione
    │   ├── execution/        vista operatore: attività di oggi, segnalazioni
    │   ├── configuration/    risorse, calendari, competenze, profili di dominio
    │   ├── model-info/       modelli attivi, catena di riserva, storico versioni
    │   └── audit/            registro, dettaglio, export CSV
    ├── components/           condivisi: Card, PageHeader, KpiCard, StatusTag, FormField, ErrorState…
    ├── lib/                  format.ts (durate, date, euro), labels.ts (stati -> etichetta e colore),
    │                         schedule.ts (regole degli spostamenti nel Gantt), graph.ts (cicli),
    │                         period.ts, useNow.ts
    └── styles/               tokens.css (colori del mockup), tema PrimeReact generato
```

**Regola**: le pagine non chiamano mai `fetch` direttamente. Passano dagli hook della propria
feature (`features/<area>/hooks.ts`), che usano le funzioni in `api/`. Se il backend cambia un
URL o un campo, si tocca solo `api/`.

## 4. Pagine e rotte

| Rotta | Pagina | Mockup v2 | Ruoli | Endpoint principali |
|---|---|---|---|---|
| `/login` | Accesso | 0 | pubblico | `POST /auth/login` |
| `/` | Dashboard | 1 | PLANNER, ADMIN | `GET /kpis`, `GET /alerts`, `GET /plan-requests?limit=4` |
| `/commesse` · `/commesse/:id` | Commesse + grafo | 2 | PLANNER, ADMIN | `/orders`, `/orders/{id}/process-graph` |
| `/pianifica` | Nuova pianificazione | 3 | PLANNER | `POST /plan-requests/interpret`, `POST /plan-requests` |
| `/piani` | Elenco piani | 7 | PLANNER, ADMIN | `GET /plan-requests` |
| `/piani/richieste/:id` | Confronto dei 3 piani | 4 | PLANNER, ADMIN | `GET /plan-requests/{id}` (polling) |
| `/piani/:planId` | Gantt e revisione | 5 | PLANNER, ADMIN | `GET /plans/{id}/gantt`, `POST /plans/{id}/decisions` |
| `/piani/:planId/ripianifica` | Ripianifica | – | PLANNER | `POST /plans/{id}/reschedule`, `GET /alerts` |
| `/operatore` | Attività di oggi | 6 | OPERATOR | `GET /operator/today`, `POST /executions`, `POST /incidents` |
| `/configurazione/:tab` | Configurazione | 8 | PLANNER, ADMIN | `/resources`, `/calendars`, `/skills`, `/domain-profiles` |
| `/modello` | Modello AI | 9 | PLANNER, ADMIN | `GET /models/active`, `GET /models`, `GET /models/status` |
| `/audit` | Audit | 10 | ADMIN | `GET /audit` |

Da fare: **registrazione** (`/registrazione`, `POST /auth/register`) e **gestione utenti** per
l'amministratore (`/users`, approvazione con ruolo), già presenti nel backend.

## 5. Come si gestiscono i dati

### 5.1 Mock prima, backend dopo
Con `VITE_USE_MOCKS=true` MSW risponde al posto del backend con i dati di `mocks/data/`, usando
**gli stessi formati JSON** del contratto. Quando un endpoint reale è pronto basta togliere il
suo handler (o mettere il flag a `false`): il codice delle pagine non cambia. In sviluppo
`vite.config.ts` fa da proxy da `/api` al backend Spring su `localhost:8080`.
Errore simulato: `sessionStorage.setItem('mock:fail', '1')` (ogni chiamata risponde 503).

### 5.2 Richieste asincrone
`POST /plan-requests` (o `/plans/{id}/reschedule`) → `202` con l'id → `usePlanRequest(id)` ripete
la `GET` ogni 1,5 s finché lo stato è `PENDING` (`refetchInterval` di TanStack Query), poi si
ferma. La pagina mostra la fase in corso (validazione, stima M1, costruzione M2, confronto).

### 5.3 Errori
`api/client.ts` converte ogni risposta `application/problem+json` in `ApiError`
(`status`, `title`, `errors[]`). Le pagine li mostrano così:
- `422` → messaggio sotto il campo indicato da `path` (anche negli array, es. `shifts[1].end`);
- `409` → “è cambiato qualcosa” e si ricarica il dato;
- `401` → si torna al login; `503` → riquadro “servizio non disponibile” con *Riprova*.

### 5.4 Login e ruoli (versione di prova)
- `POST /auth/login`; token e utente in `sessionStorage` (restano ricaricando la pagina,
  spariscono chiudendo la scheda); `Authorization: Bearer` a ogni chiamata; niente rinnovo
  automatico per ora: a un 401 si torna al login.
- Permessi in `features/auth/permissions.ts`; `RequireAuth` protegge le rotte; la barra laterale
  mostra solo le voci del proprio ruolo. Il controllo vero resta al backend (403).
- Utenti di prova (uguali nel backend, profilo `dev`): `pianificatore`, `operatore`,
  `amministratore`, password `demo`. Con i mock si entra anche a campi vuoti.

## 6. Il Gantt delle risorse

Nella schermata 5 il Gantt ha una riga per risorsa, barre trascinabili nel tempo (aggancio ai
15 minuti) **e** da una risorsa all'altra, fasce grigie per le indisponibilità, barre
tratteggiate per le durate stimate da M1, e due zoom ("Dettaglio" e "Tutto il periodo").

**Scelta: lo costruiamo noi** (`features/plan-review/components/GanttChart.tsx`), con CSS grid
e pointer events. Le librerie gratuite per React sono quasi tutte orientate ai *task* (una riga
per attività), quelle orientate alle *risorse* sono a pagamento o poco mantenute, e la parte
difficile, cioè capire se uno spostamento è valido, andava scritta comunque.

**Scala del tempo:** il Gantt usa i dati del backend così come arrivano (`GET /plans/{id}/gantt`):
minuti di lavoro dall'inizio del periodo, con `minutesPerDay` e l'elenco dei giorni lavorativi.
La conversione dai calendari reali la fa il backend.

Lo spostamento viene validato due volte, con le stesse regole (`lib/schedule.ts`):
1. **nel browser, subito**: precedenze, sovrapposizione sulla stessa risorsa, indisponibilità,
   risorse ammesse, periodo; se non va bene compare il motivo e la barra torna a posto;
2. **nel backend, alla conferma** (`POST /decisions` con `MODIFY`): se risponde `422`, si mostra
   l'errore.

Alternativa da tastiera: le barre sono pulsanti; il pannello laterale permette di spostare
l'attività su un'altra risorsa o di ±15 min / ±1 h.

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

## 8. Contratto con il backend

Tutto quello che il frontend chiedeva in più rispetto alla prima versione del contratto (le
"proposte §8": 3 piani per richiesta, lettura LLM della richiesta, Gantt e decisioni, avvisi e
segnalazioni, vista operatore, KPI in più, campi di calendari e profili, ripianificazione,
dettagli dell'audit, modello AI) è entrato in **`CONTRATTI_API.md` v1.1** (25/11/2026): è quello
che serve al progetto. Il riferimento per ogni campo sono i tipi in `src/api/types/` e i mock
in `src/mocks/`.

Punti ancora aperti, lato frontend:
- **Nome dell'utente**: il backend usa `fullName`; il frontend oggi legge `displayName`.
  Si allinea a `fullName` insieme alle pagine di registrazione e gestione utenti.
- **Una risorsa per alternativa**: il backend accetta un solo `resourceId` per modo
  (`MODE_RESOURCE_COUNT`); il form attività del frontend oggi permette di sceglierne più d'una.
  Da correggere nel form (un menu a scelta singola per alternativa).
- **Codici delle risorse**: il backend usa codici brevi (`LASER`, `CNC2`), i mock del frontend
  `R-LAS-01`, `R-CNC-02`: sono opachi per il frontend, cambiano solo i dati di prova.

## 9. Fasi di lavoro e stato

| Fase | Contenuto | Stato (25/11) |
|---|---|---|
| 1. Fondamenta | Vite, PrimeReact con i colori del mockup, layout, router, `api/client.ts`, MSW | fatto |
| 2. Configurazione e commesse | Risorse, calendari, competenze, profili; commesse con grafo, form di commessa e attività | fatto |
| 3. Pianificazione | Nuova pianificazione con interpretazione e polling, confronto dei 3 piani, elenco piani | fatto |
| 4. Gantt e revisione | Gantt, validazione degli spostamenti, approva/modifica/rifiuta, ripianificazione da segnalazione | fatto |
| 5. Resto | Vista operatore, dashboard, Modello AI, audit | fatto |
| 6. Login e ruoli | Login di prova, menu e rotte per ruolo | fatto (versione semplice) |
| 7. Utenti | Registrazione, approvazione e gestione utenti | da fare |
| 8. Integrazione | Spegnere i mock un'area alla volta man mano che il backend implementa gli endpoint | da fare |

Ogni passo è verificato nel browser (flussi completi, errori, accessibilità: contrasto,
fuoco visibile, etichette e messaggi sotto i campi, obiettivi di almeno 44 px).
