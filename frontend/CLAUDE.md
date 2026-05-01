# Frontend (frontend/) — scoped notes

This file is loaded only when working inside `frontend/`. For the task→file map, see `.claude/INDEX.md`.

## Stack

CRA + React 19 + TypeScript + Chakra UI v3 + framer-motion + recharts + lucide-react.

## File map

- `src/App.tsx` — router + WS provider.
- `src/api.ts` — axios client. All HTTP calls go through here.
- `src/hooks.ts` — `useWebSocket` (auto-reconnect) and other hooks.
- `src/types.ts` — **mirrors backend `src/models.rs`**. Keep in sync when models change.
- `src/pages/` — top-level screens (Dashboard, StocksPage, StockDetailPage, ScreenerPage, AlertsPage, OpportunitiesPage, FundsPage, NewsPage, SectorPage).
- `src/components/` — shared UI (FilterPanel, Navigation, StockCard, StockDetailModal, SettingsPanel, ProgressBar, MarkdownContent, WatchButton).
- `src/components/alerts/` — alerts-specific (ConditionBuilder).
- `src/components/ui/` — Chakra v3 primitives.
- `src/theme/` — tokens.

## Conventions

- Dev server: `npm start` on `:3001`, proxies API to `:3333` (see `package.json`).
- New API call → add to `src/api.ts`, not inline in components.
- New backend field → update `src/types.ts` first, then UI.
- Use Chakra v3 primitives over raw HTML for layout/spacing.

## Don't

- Don't fetch from components directly — use `src/api.ts`.
- Don't change the proxy port without also changing backend `SERVER_PORT`.
