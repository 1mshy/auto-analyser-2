# Auto Analyser frontend

A React 19 / TypeScript research workspace using Vite 7, Chakra UI 3, TanStack Query and Recharts.

## Development

```sh
npm ci
npm run dev
```

The development server starts on port 3001 and proxies `/api`, `/ws`, `/health`, and `/metrics` to the Rust backend at port 3333. Keep `SERVER_PORT=3333` in the backend environment. Optional `VITE_API_URL` and `VITE_WS_URL` override same-origin requests at build time.

```sh
npm run build
npm test
```

Production output stays in `build/`, as required by the Dockerfile, nginx and compose healthcheck. All pages are lazy-loaded. No new runtime dependencies are required for the workspace overhaul.

## Workspace features

- **Overview:** index snapshot, sector comparisons, market movers, RSI shortlists, watchlists, headlines and optional on-demand AI research. Start with Market overview, Find opportunities, or Daily monitor; create up to eight named layouts. Customize panel visibility, order and desktop width. Move controls work with keyboard and touch. Narrow screens stack panels.
- **Stocks and screener:** shareable filters, removable filter chips, saved views, sortable columns, column visibility, compact/comfortable density, table/cards and server pagination. Screener conditions stay drafts until Run screener. Global universe settings continue to constrain results.
- **Stock research:** native daily close chart with optional SMA 20/50 overlays, volume and Wilder RSI (14) in separate synchronized panels, percentage scale, keyboard/hover inspection, accessible price table and CSV. Ranges are 1W, 1M and 3M, bounded by the history returned by the backend. The chart labels the actual dates and available sessions. Indicators appear only after enough observations. Advanced chart keeps TradingView available.
- **Navigation:** grouped desktop rail, mobile drawer, stock search with Cmd/Ctrl+K, colour mode, notifications and universe settings. Alerts tabs have durable URLs (`/alerts?tab=watchlists`, `positions`, `rules`, `channels`, `inbox`).
- **Settings:** edits and presets apply only when Apply Settings is selected; Cancel leaves saved preferences untouched.
- **AI research:** ask a question about one stock or compare up to four. Answers include the submitted question, model, source figures, and analysis timestamps. Suggestions prefill the form; generation starts only when submitted. See [local model setup](../docs/ai-research.md).

Layouts, chart preferences, and saved stock views are stored in this browser. They do not sync across devices. Market records and watchlists continue to come from the backend. Missing data, failed requests, and empty results are distinct states; the production UI never substitutes demo prices.

## Organisation

See [project architecture](../docs/architecture.md) for the full ownership map.

```text
src/
  app/                 route registry, app frame, navigation model
  features/
    workspace/         named dashboard layouts and persistence
    dashboard/         market snapshot and data panels
    stocks/            filter codec, saved views, table and controls
    charts/            historical chart, indicators and preferences
    research/          AI questions, comparisons and source evidence
  pages/               route orchestration and remaining domain screens
  components/          shared UI and primitives
  contexts/            global universe settings and analysis progress
  theme/               CSS tokens, Chakra and chart adapters
  api.ts               HTTP transport
  queries.ts           server state
  types.ts             backend contract
```

See [design decisions and sources](../docs/frontend-research.md) and the [shared visual system](../design.md).
