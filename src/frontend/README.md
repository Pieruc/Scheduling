# FlowSync – Frontend

Interfaccia web di FlowSync (React + TypeScript + Vite).
Struttura e scelte del progetto: [`../../FRONTEND_STRUTTURA.md`](../../FRONTEND_STRUTTURA.md).
Schermate di riferimento: [`../../FE_Mockups/FlowSync – Mockup UI v2.html`](../../FE_Mockups/).

## Requisiti

- Node.js 22 o superiore

## Comandi

```bash
npm install          # prima volta
npm run dev          # avvia in sviluppo su http://localhost:5173
npm run build        # controllo dei tipi + build di produzione in dist/
npm run lint         # oxlint
npm run format       # formatta il codice con Prettier
```

## Cartelle in `src/`

| Cartella      | Contenuto                                                   |
| ------------- | ----------------------------------------------------------- |
| `app/`        | router, provider, layout (sidebar, vista operatore)         |
| `api/`        | unico punto che conosce URL e formati del backend           |
| `mocks/`      | backend finto (MSW) con gli stessi formati dei contratti    |
| `features/`   | una cartella per area: commesse, pianificazione, piani, ... |
| `components/` | componenti condivisi (card KPI, tag di stato, ...)          |
| `lib/`        | funzioni di utilità (formati di durate, date, euro)         |
| `styles/`     | token di colore e tema PrimeReact                           |

Gli import usano l'alias `@/` al posto di `src/` (es. `import App from '@/App'`).
