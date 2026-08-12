# Frontend (frontend/) — scoped notes

This file is loaded only when working inside `frontend/`. For the task→file map, see `.claude/INDEX.md`.

## Stack

Vite 7 + React 19 + TypeScript + Chakra UI v3 + TanStack Query v5 + recharts + lucide-react + react-router v7. (framer-motion, react-icons and @chakra-ui/icons were all removed in the frontend overhaul — lucide-react is the only icon library. Tests run on Vitest + jsdom.)

## File map

- `src/App.tsx` — provider stack (`QueryClientProvider → SettingsProvider → ProgressProvider → Router`) + routes. **Every page is route-level code-split**: a new page needs a `React.lazy` import (pages are named exports mapped to `default`) and a `<Route>`.
- `src/queries.ts` / `src/queryClient.ts` — TanStack Query hooks. Server state lives here.
- `src/api.ts` — axios client. All HTTP calls go through here (called by the query hooks).
- `src/hooks.ts` — `useWebSocket` (auto-reconnect) and other hooks.
- `src/contexts/` — `SettingsContext`, `ProgressContext` (progress arrives over WS via `ProgressProvider`).
- `src/types.ts` — **mirrors backend `src/models.rs`**. Keep in sync when models change.
- `src/format.ts` — shared number/date formatting helpers.
- `src/pages/` — top-level screens (Dashboard, StocksPage, StockDetailPage, ScreenerPage, AlertsPage, OpportunitiesPage, FundsPage, NewsPage, SectorPage, Backtest).
- `src/components/` — shared UI (FilterPanel, Navigation, NewsCard, MobileDrawer, SettingsPanel, ProgressBar, MarkdownContent).
- `src/components/alerts/` — alerts-specific (ConditionBuilder).
- `src/components/stock-detail/` — StockDetail sub-components.
- `src/components/ui/` — Chakra v3 primitives (Skeleton, etc.).
- `src/theme/` — tokens.
- `index.html` — **Vite entry, at the package root** (not `public/`). Holds the `<div id="root">`, the `theme-color` meta and the inline service-worker registration.
- `vite.config.ts` — plugin-react + rollup-plugin-visualizer; `build.outDir: "build"` (Dockerfile/nginx/compose healthcheck depend on it), `build.target: "es2020"`, dev server `:3001` with `/api` + `/ws` proxies, and the inline `test` (Vitest) block.
- `tsconfig.json` (app, `include: ["src"]`) / `tsconfig.node.json` (`vite.config.ts` only).
- `public/` — Vite `publicDir`, copied verbatim: `sw.js` (live, registered from `index.html`), `manifest.json`, icons, `robots.txt`.
- `src/vite-env.d.ts` — `/// <reference types="vite/client" />`, types `import.meta.env`.

## Conventions

- Dev server: `npm run dev` (or `npm start`) on `:3001`, proxies `/api` and `/ws` to `:3333` (see `vite.config.ts` `server.proxy`).
- Env vars are `VITE_API_URL` / `VITE_WS_URL`, read via `import.meta.env` in `src/api.ts` (see `.env.example`). Both are optional — unset means same-origin `/api` + `/ws`, which is what Docker/nginx relies on. Only `VITE_`-prefixed vars reach the bundle, and they are **inlined at build time**, not read at runtime.
- Tests: `npm test` (`vitest run`) / `npm run test:watch`. `src/setupTests.ts` is wired via `test.setupFiles`, not by filename convention.
- New server state → TanStack Query hook in `src/queries.ts` calling `src/api.ts`; don't hand-roll `useEffect` fetches.
- New backend field → update `src/types.ts` first, then UI.
- Use Chakra v3 primitives over raw HTML for layout/spacing.

## Don't

- Don't fetch from components directly — go through `src/queries.ts` / `src/api.ts`.
- Don't change the proxy port without also changing backend `SERVER_PORT`. The proxy lives in `vite.config.ts` now, not `package.json`.
- Don't change `build.outDir` away from `build` — `frontend/Dockerfile`, `nginx.conf` and the `docker-compose.yml` frontend healthcheck all point at it.
- Don't move `index.html` back under `public/` — Vite resolves the entry from the project root.
- Don't import a page directly in `App.tsx` — use the `React.lazy` pattern, or you defeat code-splitting.
