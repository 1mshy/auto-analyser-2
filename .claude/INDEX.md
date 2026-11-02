# Task → File Index

Use this map to jump straight to the right files instead of exploring. Paths are relative to repo root.

## Backend (Rust / Axum)

| Task | Files to read/edit |
|---|---|
| Add a new technical indicator | `src/indicators.rs` → `src/models.rs` (add field on `StockAnalysis`) → `src/analysis.rs::analyze_stock` → `frontend/src/types.ts` |
| Add/modify an HTTP endpoint (stocks/screener) | `src/api.rs` (handler + `create_router`), then `API.md` |
| Add/modify an alerts endpoint | `src/notifications/api.rs`, then `NOTIFICATIONS.md` |
| Add a new alert condition | `src/notifications/models.rs` (rule tree leaf) → `src/notifications/evaluator.rs` |
| Add a new notification channel | `src/notifications/models.rs` (`ChannelKind`/`ChannelConfig`) → `src/notifications/channels/mod.rs` (`build_channel`) → new file under `src/notifications/channels/` → `frontend/src/types.ts` |
| Change Mongo schema or filters | `src/models.rs` → `src/db.rs::get_latest_analyses` → `src/indexes.rs` if a new index is needed |
| Tune Yahoo concurrency / rate limits | `src/async_fetcher.rs`, `.env` (`YAHOO_CONCURRENCY`, `YAHOO_REQUEST_DELAY_MS`); verify with `cargo run --bin rate_limit_tester` |
| Modify the analysis loop / progress / per-cycle behavior | `src/analysis.rs` (owns the loop, `AnalysisProgress`, `AlertEngine` call) |
| Caching changes | `src/cache.rs` (two-tier Moka). Anything mutating `StockAnalysis` server-side must invalidate the list cache. |
| Add a config / env var | `src/config.rs` (`Config::from_env`), `.env.example` |
| AI summary / OpenRouter behavior | `src/openrouter.rs`, `src/config.rs` (`OPENROUTER_*`) |
| AI research / stock comparisons | `src/ai_research.rs`, `src/openrouter.rs`, `frontend/src/features/research/`, `frontend/src/pages/ResearchPage.tsx`, `docs/ai-research.md` |
| Stock universe source (NASDAQ etc.) | `src/nasdaq.rs`; engine consumes `Vec<Stock>` so add new sources as siblings |
| Add a new filter to the stocks query | `src/models.rs` (`StockFilter`) → `src/db.rs::get_latest_analyses` → `frontend/src/components/FilterPanel.tsx` |
| Backtesting engine / endpoints | `src/backtest.rs`, routes in `src/api.rs`, spec in `BACKTESTING.md` |
| Per-stock news / Marketaux | `src/marketaux.rs`, prefetch in `src/analysis.rs`, UI in `frontend/src/components/NewsCard.tsx` + `frontend/src/pages/NewsPage.tsx` |
| Portfolio upload / holdings / related stocks on the overview | `src/portfolio.rs` (decode → `parse_document` AI-first / `parse_heuristic` fallback → views), `src/openrouter.rs` (`generate_structured`), `frontend/src/features/portfolio/`, `frontend/src/pages/PortfolioPage.tsx`, dashboard panels in `frontend/src/features/dashboard/DashboardWidgets.tsx` + `features/workspace/model.ts`; verify with `cargo run --example parse_portfolio -- file.csv` |
| Prometheus metrics | `src/metrics.rs` (dedicated registry + `/metrics` handler + increment sites) |
| Symbol normalization | `src/symbols.rs` (`normalize_symbol_key`) |
| Add a backend module | declare in **both** `src/main.rs` (`mod`) and `src/lib.rs` (`pub mod`) |

## Frontend (Vite 7 / React 19 / TS / Chakra v3)

| Task | Files to read/edit |
|---|---|
| Add/modify a backend type on the client | `frontend/src/types.ts` (mirrors `src/models.rs`) |
| Add a server-state fetch | `frontend/src/queries.ts` (TanStack Query hook) → `frontend/src/api.ts` (axios client) |
| WebSocket consumer changes | `frontend/src/contexts/ProgressContext.tsx`, `frontend/src/hooks.ts` (`useWebSocket`) |
| Routing / shell changes | `frontend/src/App.tsx` (providers), `frontend/src/app/AppShell.tsx`, `AppRoutes.tsx` (lazy routes), `navigation.ts` (desktop/mobile destinations) |
| Edit a screen | `frontend/src/pages/<Page>.tsx` (Dashboard, StocksPage, StockDetailPage, ScreenerPage, AlertsPage, OpportunitiesPage, FundsPage, NewsPage, SectorPage, Backtest) |
| Filter panel UI / saved stock views | `frontend/src/components/FilterPanel.tsx`, `frontend/src/features/stocks/` (shared filters, URL codec, columns, density, saved views and results) |
| Dashboard panels / saved layouts | `frontend/src/pages/Dashboard.tsx`, `frontend/src/features/dashboard/`, `frontend/src/features/workspace/` |
| Price history / chart indicators | `frontend/src/features/charts/`, `frontend/src/pages/stock-detail/OverviewTab.tsx` |
| Alerts UI primitives | `frontend/src/components/alerts/ConditionBuilder.tsx` |
| Theme tokens | `frontend/src/theme/` |
| Service worker / offline shell | `frontend/src/index.tsx`, `frontend/public/sw.js` |
| Build config / dev proxy / test runner | `frontend/vite.config.ts` (`build.outDir: "build"`, `server.proxy` for `/api` + `/ws`, inline Vitest block), `frontend/index.html` (Vite entry, package root), `frontend/package.json` |
| Frontend deploy / CI | `frontend/Dockerfile` (must copy `index.html` + `vite.config.ts`), `frontend/nginx.conf`, `.github/workflows/ci.yml` (build + gzip bundle budget + `npm test`) |

## Common entry points (do NOT skip)

- Root config & wiring: `src/main.rs`
- App state for handlers: `src/api.rs::AppState`
- Backend ↔ frontend type contract: `src/models.rs` ↔ `frontend/src/types.ts` (must stay in sync)

## Reference docs in repo

`API.md`, `NOTIFICATIONS.md`, `STRUCTURE.md`, `DOCKER.md`, `DOCKER_QUICK_REF.md`, `RSI_FIX_DETAILED.md`, `YAHOO_*_FIX*.md`.

## Rule of thumb

If your task isn't here, check the table above for the closest analogue, then read **only** those files. Do not Glob/Grep the whole repo before editing.
