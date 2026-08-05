# Frontend (frontend/) — scoped notes

This file is loaded only when working inside `frontend/`. For the task→file map, see `.claude/INDEX.md`.

## Stack

CRA + React 19 + TypeScript + Chakra UI v3 + TanStack Query v5 + recharts + lucide-react + react-router v7. (framer-motion was removed in the frontend overhaul.)

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

## Conventions

- Dev server: `npm start` on `:3001`, proxies API to `:3333` (see `package.json`).
- New server state → TanStack Query hook in `src/queries.ts` calling `src/api.ts`; don't hand-roll `useEffect` fetches.
- New backend field → update `src/types.ts` first, then UI.
- Use Chakra v3 primitives over raw HTML for layout/spacing.

## Don't

- Don't fetch from components directly — go through `src/queries.ts` / `src/api.ts`.
- Don't change the proxy port without also changing backend `SERVER_PORT`.
- Don't import a page directly in `App.tsx` — use the `React.lazy` pattern, or you defeat code-splitting.
