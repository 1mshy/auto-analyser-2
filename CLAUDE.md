# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Before exploring the repo, check `.claude/INDEX.md` — it's a task→file map that tells you exactly which files to read for common changes.** Scoped notes also live at `src/CLAUDE.md`, `src/notifications/CLAUDE.md`, and `frontend/CLAUDE.md` and load automatically when working in those directories.

## Stack

Rust (Axum) backend + React 19 / TypeScript / Chakra UI v3 frontend, MongoDB persistence, Moka caching, Yahoo Finance + NASDAQ screener as data sources, optional OpenRouter AI for analysis, Discord webhooks for alerts.

## Common commands

```bash
# Backend (from repo root)
cargo run                       # debug build
RUST_LOG=debug cargo run        # verbose logs
cargo build --release           # production binary -> target/release/auto_analyser_2
cargo check                     # fast typecheck
cargo clippy                    # lint
cargo fmt                       # format
cargo test                      # all tests
cargo test <name>               # single test by substring
cargo run --bin rate_limit_tester  # extra binary for tuning Yahoo rate limits
cargo run --example verify_rsi  # examples in examples/

# Frontend (from frontend/)
npm install
npm run dev                     # Vite dev server :3001, proxies /api + /ws to :3333 (see vite.config.ts)
npm run build                   # tsc --noEmit && vite build -> frontend/build/
npm test                        # Vitest (jsdom + @testing-library), single run

# Docker (full stack: Mongo + backend + nginx-served frontend)
docker compose up -d            # or: make up
make logs                       # follow logs
make rebuild                    # full rebuild
./test_api.sh                   # E2E API smoke test (server must be running)
```

## Architecture

### Backend modules (`src/`)

- `main.rs` — bootstrap: tracing → `Config::from_env` → `MongoDB::new` → `CacheLayer` → `YahooFinanceClient` → `OpenRouterClient` → `AlertEngine` → `MarketauxClient` → `AnalysisEngine` (loads existing data from Mongo, then `tokio::spawn` continuous loop) → `axum::serve` with permissive CORS. Also creates the `stock_tx` broadcast channel (512 cap) that pushes each freshly saved `StockAnalysis` to WS clients. **A new backend module must be declared in both `main.rs` (`mod`) and `lib.rs` (`pub mod`)** — `examples/` and integration tests consume the lib crate.
- `config.rs` — single `Config` struct loaded from `.env` (note: `OPENROUTER_API_KEY_STOCKS` is intentionally SCREAMING_SNAKE on the struct field too). Includes optional `CANADIAN_SYMBOLS` for the CAD side of the analysis universe.
- `models.rs` — serde data types: `Stock`, `StockAnalysis`, `HistoricalPrice`, `MACDIndicator`, `StockFilter`, `AnalysisProgress`. Mongo `_id` is `Option<ObjectId>` with `skip_serializing_if`.
- `db.rs` — `MongoDB` struct: connection, upserts on `symbol`, `$and`-built dynamic filters in `get_latest_analyses`, indexes on `symbol` (asc) and `analyzed_at` (desc).
- `indexes.rs` — embedded market-index constituent lists (S&P 500, Nasdaq 100, Dow 30, Russell 2000) + the `MARKET_INDEXES` catalog and heatmap types. **Not** Mongo index creation — that lives in `db.rs::create_indexes` (best-effort, non-fatal).
- `yahoo.rs` / `nasdaq.rs` — HTTP clients (must spoof a desktop User-Agent). NASDAQ supplies the symbol universe + market caps + sector + 52w hi/lo; Yahoo supplies OHLCV history.
- `async_fetcher.rs` — concurrent Yahoo batch fetcher governed by `YAHOO_CONCURRENCY` and `YAHOO_REQUEST_DELAY_MS`.
- `indicators.rs` — pure functions returning `Option<f64>`. **RSI uses Wilder's Smoothing** (matches TradingView): oversold < 30, overbought > 70. SMA(20/50), MACD(12/26 + signal-line approximation), EMA helper.
  RSI is **seeded, then smoothed**: the first `period` changes are averaged as a plain SMA, and only `changes[period..]` get `(prev_avg * (period-1) + current) / period`. Do not "simplify" this into smoothing from index 0 — it silently shifts every RSI (the original SMA-only bug read AAPL at 79.30 where TradingView said 68.42).
  Because Wilder's has effectively infinite memory, **RSI depends on how much history you feed it** — the 90-day fetch window is load-bearing, not arbitrary. Verify changes with `cargo run --example verify_rsi`.
- `analysis.rs` — `AnalysisEngine`. Owns the 24/7 loop, `AnalysisProgress` (broadcast every ~2s by the WS handler), error tracking that does not abort the cycle, and a per-stock hand-off to the alert engine via `AlertEngine::submit` (an mpsc queue drained by a worker, so rule evaluation tracks per-symbol latency rather than full-cycle latency). Filters small-caps via `MIN_MARKET_CAP_USD` and runaway moves via `MAX_ABS_PRICE_CHANGE_PCT`. Has a Yahoo circuit breaker (`yahoo_circuit_failure_threshold` / `yahoo_circuit_skip_cycles` on `Config`) and, when clients are configured, drives the Marketaux news prefetch + OpenRouter news summaries (article-count gate `NEWS_SUMMARY_MIN_ARTICLES`).
  **`ANALYSIS_INTERVAL_SECS` is a per-symbol staleness gate, not just the sleep between cycles.** At boot the engine hydrates the cache from Mongo so the API serves data immediately; each cycle then checks every symbol individually and skips any whose `analyzed_at` is younger than the interval. A cycle that analyses almost nothing is expected behaviour, not a stall — check the skipped count in the logs before hunting a bug.
- `cache.rs` — two-tier Moka: stock-level (10k cap) + query/list-level (100 cap). The list cache is invalidated at the end of each cycle. Separate TTLs for stock data (`CACHE_TTL_SECS`) and news (`NEWS_CACHE_TTL_SECS`).
- `api.rs` — Axum router. `AppState` holds `db`, `cache`, `progress`, `stock_tx`, `yahoo_client`, `openrouter_client`, `nasdaq_client`, `alert_engine`, `marketaux_client`, `news_summary_min_articles`. Endpoints: `GET /`, `/health`, `/metrics`, `/api/progress`, `/api/stocks` + `POST /api/stocks/filter`, per-symbol `/api/stocks/:symbol` (+ `/history`, `/profile`, `/ai-analysis`, `/news`, `/insiders`, `/earnings`), `/api/market-summary`, `/api/news`, `/api/sectors`, `/api/earnings`, `/api/analytics/correlation`, `/api/ai/status|models`, backtests (`POST /api/backtest`, `GET /api/backtests`, `GET /api/backtest/:id`), market indexes (`/api/market-indexes`, `/api/indexes`, `/api/indexes/:index_id[/heatmap]`), portfolio (`/api/portfolio`, `/related`, `/import`, `/holdings[/:id]`, mounted from `portfolio.rs`), `WS /ws` (streams `AnalysisProgress` ~every 2s **and** each freshly saved `StockAnalysis`), plus the alerts/watchlists/positions routes (see below).
- `openrouter.rs` — optional AI summary/analysis layer; toggled by `OPENROUTER_ENABLED` plus a key or a self-hosted endpoint. Speaks plain OpenAI-compatible HTTP, so `AI_BASE_URL` can point it at a vLLM/llama.cpp server instead of OpenRouter. The model is always discovered from the endpoint's `/models` list (OpenRouter filters to `:free`; self-hosted takes everything), sorted by context length.
- `ai_research.rs` — `POST /api/ai/research`: answers a free-text question about 1–4 symbols from their latest stored `StockAnalysis` rows (no web/news context). Validates input, builds a bounded source snapshot + prompt, calls `openrouter.rs`, and rejects empty / reasoning-only / truncated generations. Shares the single-generation concurrency limit with the other AI call sites. See `docs/ai-research.md`.
- `portfolio.rs` — user holdings (`portfolio_holdings` collection, separate from the alert-engine `positions`). `POST /api/portfolio/import` takes a multipart upload in any readable format (CSV/TSV, Excel/ODS via `calamine`, JSON, HTML, text), decodes it to text, then parses it **AI-first with a deterministic fallback**: `parse_document` calls `OpenRouterClient::generate_structured` (same single-slot permit as research) and validates every returned symbol against the document; `parse_heuristic` (delimiter detection + header alias mapping + token scan) answers whenever AI is disabled, busy, failing or empty. CDRs are detected from the description and priced from the file, not the live US quote. `GET /api/portfolio` joins lots with cached analyses; `GET /api/portfolio/related` ranks same-sector names by portfolio weight and RSI. Debug a broker export with `cargo run --example parse_portfolio -- file.csv`.
- `marketaux.rs` — `MarketauxClient`, optional news layer (per-stock news card + prefetch); enabled when `MARKETAUX_API_KEY` is set and `MARKETAUX_ENABLED` isn't false. Free tier is 100 req/day — don't add chatty call sites.
- `backtest.rs` — backtesting engine behind `POST /api/backtest`; strategy spec and metric definitions in `BACKTESTING.md`.
- `metrics.rs` — Prometheus `/metrics`. Uses its own `REGISTRY` (not the global default); counters such as `analysis_cycle_completed_total`, `yahoo_requests_total{status}`, `alerts_dispatched_total{channel,status}`. Returns Prometheus text format — the one endpoint exempt from the JSON response convention.
- `symbols.rs` — symbol normalization: US share classes use dashes (`BRK.B` → `BRK-B`), Canadian suffixes (`.TO`/`.V`/`.NE`/`.CN`) are preserved. Use `normalize_symbol_key` for anything that keys Mongo by symbol.
- `bin/rate_limit_tester.rs` — standalone tool to sweep Yahoo concurrency/delay combos.

**Data flow:** NASDAQ screener → symbol universe → Yahoo OHLCV → `indicators.rs` → `StockAnalysis` → `db.rs` upsert + `cache.rs` insert → `api.rs` → frontend over REST/WS. `AlertEngine` consumes the same `Vec<StockAnalysis>` at end-of-cycle.

### Notifications subsystem (`src/notifications/`)

`AlertEngine` is the public surface; everything else is internal. `NOTIFICATIONS_ENABLED=false` keeps the CRUD API working but stops rules firing; `PUBLIC_BASE_URL` builds links from Discord embeds back to the stock detail page.

- `models.rs` — `ChannelKind`, `ChannelConfig`, rule trees (`AND`/`OR`/`NOT` + leaf conditions), `PendingNotification`, `DeliveryResult`.
- `repo.rs` — Mongo CRUD for channels / rules / watchlists / history. Creates its own indexes at startup (best-effort, non-fatal).
- `rules.rs` — pure, side-effect-free condition-tree walker (`evaluate(group, ctx)`).
- `evaluator.rs` — the stateful layer on top of `rules.rs`: cooldowns committed after successful delivery, `require_consecutive` hysteresis, MACD bullish/bearish cross detection (compares previous cycle's histogram), timezone-aware `quiet_hours`.
- `dispatcher.rs` — fans out to channels; per-channel errors do not abort the batch. Substitutes `{{symbol}}`, `{{price}}`, `{{rsi}}`, `{{change_pct}}`, `{{matched}}`, `{{52w_low/high}}`, `{{market_cap}}`, `{{sector}}`, `{{rule_name}}`. Unknown placeholders are left intact (typos are visible).
- `channels/` — `Channel` trait + Discord implementation. `build_channel` in `channels/mod.rs` is the registration point.
- `api.rs` — HTTP routes: `/api/watchlists*`, `/api/positions*`, `/api/alerts/channels*`, `/api/alerts/rules*` (incl. `/toggle`, `/test`), `/api/alerts/history*` (incl. `/unread-count`, `/:id/read`), `/api/alerts/status`. Webhook URLs live per-channel in MongoDB, NOT in env vars.

**To add a new channel** (Telegram/Email/etc.): extend `ChannelKind` + `ChannelConfig` in `models.rs`, add an impl under `channels/`, wire into `build_channel`, and mirror the config shape in `frontend/src/types.ts`. The evaluator/dispatcher/API are channel-agnostic.

### Frontend (`frontend/src/`)

Vite 7 + React 19 + Chakra UI v3 + TanStack Query v5 + recharts + lucide-react + react-router v7 (framer-motion, react-icons and @chakra-ui/icons were all removed in the frontend overhaul — lucide-react is the only icon library). Key files:

- `App.tsx` — provider stack `QueryClientProvider → SettingsProvider → ProgressProvider → Router`. `app/AppShell.tsx` owns the frame (sidebar, mobile drawer, global search), `app/AppRoutes.tsx` owns the lazy routes, `app/navigation.ts` is shared by desktop + mobile nav. **Every page is route-level code-split**: a new page needs a `React.lazy` import (pages are named exports mapped to `default`) and a `<Route>` in `AppRoutes.tsx`.
- `features/` — domain logic, kept out of route pages: `workspace/` (named dashboard layouts), `dashboard/` (overview panels), `stocks/` (URL-backed filters, saved views, results table/cards), `charts/` (history normalisation + native recharts graphs), `research/` (AI research form, answer, source evidence), `portfolio/` (upload + preview, holdings table, manual add, and the position/related lists reused by the dashboard panels `portfolio` / `portfolio_related`). Ownership and state boundaries are in `docs/architecture.md`.
- `queries.ts` / `queryClient.ts` — TanStack Query hooks; server state lives here, calling into `api.ts` (axios client). Don't hand-roll `useEffect` fetches.
- `hooks.ts` — `useWebSocket` (auto-reconnect); `contexts/` — `SettingsContext`, `ProgressContext` (progress arrives over WS via `ProgressProvider`).
- `types.ts` — mirrors backend `models.rs`; `format.ts` — shared formatting helpers.
- `pages/` (Dashboard, Portfolio, Stocks, StockDetail, Screener, Alerts, Opportunities, Funds, News, Sector, Backtest, Research), `components/` (incl. `ui/` Chakra primitives, `stock-detail/`, `alerts/`), `theme/` (`tokens.css` is the portable token source; root `tokens.css` re-exports it; `design-tokens.ts` adapts it for Chakra, `chartTheme.ts` for recharts). The design system itself is described in `design.md`.
- `index.html` (at the package root — Vite's entry, **not** in `public/`), `vite.config.ts` (build `outDir: "build"`, `target: es2020`, dev proxy, and the inline Vitest block), `tsconfig.json` + `tsconfig.node.json`, `public/` (static passthrough: `sw.js`, `manifest.json`, icons).

## Conventions and gotchas

- **Port mismatch is the #1 footgun.** Backend code default is `:3000` (`SERVER_PORT`), but `.env.example`, Docker, and the Vite dev proxy use `:3333`. For local dev, keep `SERVER_PORT=3333` in `.env` unless you also change `server.proxy` in `frontend/vite.config.ts`. Mongo in Docker is exposed on host `:27018` (mapped to container `:27017`) to avoid clashing with a local Mongo.
- **Yahoo rate limits.** Local default is `YAHOO_REQUEST_DELAY_MS=100` + `YAHOO_CONCURRENCY=5`; Docker raises delay to `500`. Older docs reference 4s — that was the old non-concurrent path. If you change these, sanity-check with `cargo run --bin rate_limit_tester`.
  Container egress is rate-limited harder than the host: a symbol that fetches fine from your laptop can still 429 from inside the container, so verify rate-limit changes *in Docker*, not just locally.
- **Yahoo auth is crumb-based, and that — not delay tuning — is what stopped the 429 storm.** `yahoo.rs` runs a cookie-store client that fetches cookies, then a crumb from `/v1/test/getcrumb`, caching it with a short TTL; a 403 triggers one crumb refresh and retry. Don't disable `.cookie_store(true)` or drop the crumb param.
- **NASDAQ + Yahoo both need a desktop User-Agent.** Don't strip it.
- **Errors don't abort cycles.** `AnalysisEngine` accumulates them in `AnalysisProgress.errors` and continues; `AlertEngine` swallows per-channel failures the same way. Don't add early `?` returns at these boundaries.
- **Cache invalidation.** Anything that mutates `StockAnalysis` server-side must also invalidate the list cache, or the frontend will see stale results until next cycle. The continuous loop already does this at end-of-cycle.
- **Mongo upsert key is `symbol`.** One row per symbol, latest-wins. Do not introduce non-keyed inserts.
- **No `.cursor/` rules in repo.** Sibling docs `.github/copilot-instructions.md` and `AGENTS.md` (a Codex-oriented copy) overlap with this file but lag behind — prefer this file.
- **API response convention** (mainly notifications routes): `{ "success": true, ... }` / `{ "success": false, "error": "..." }`. Existing stock routes don't all follow this — match the surrounding handler.

## Adding things

- **New technical indicator** — pure fn in `indicators.rs` → field on `StockAnalysis` in `models.rs` → compute in `analysis.rs::analyze_stock` → expose to frontend via `frontend/src/types.ts`. Add a leaf condition in `notifications/models.rs` + `evaluator.rs` if it should be alertable.
- **New API endpoint** — handler in `api.rs` (or `notifications/api.rs` for alerts), route in `create_router`. Document in `API.md` if user-facing.
- **New frontend page** — component in `frontend/src/pages/` (named export) → `React.lazy` import + `<Route>` in `App.tsx` → server state via a hook in `queries.ts`.
- **New filter** — extend `StockFilter` in `models.rs`, query branch in `db.rs::get_latest_analyses`, UI in `frontend/src/components/FilterPanel.tsx` (or its v2 location).
- **New stock universe source** — sit it next to `nasdaq.rs`; the engine consumes a `Vec<Stock>` so swapping/adding sources is local.

## Reference docs in repo

`API.md` (HTTP surface), `NOTIFICATIONS.md` (alert engine condition + placeholder reference), `BACKTESTING.md` (backtesting engine: strategy spec, metric definitions, API surface; decisions in `NOTES_BACKTESTING.md`), `STRUCTURE.md` (older per-module breakdown), `DOCKER.md` / `DOCKER_QUICK_REF.md` (compose details), `RSI_FIX_DETAILED.md` / `YAHOO_*_FIX*.md` (historical incidents — useful when something behaves "wrong" and you suspect regression).
