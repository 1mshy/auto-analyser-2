# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
npm start                       # dev server :3001, proxies API to :3333 (see package.json)
npm run build
npm test                        # CRA / react-scripts test runner

# Docker (full stack: Mongo + backend + nginx-served frontend)
docker compose up -d            # or: make up
make logs                       # follow logs
make rebuild                    # full rebuild
./test_api.sh                   # E2E API smoke test (server must be running)
```

## Architecture

### Backend modules (`src/`)

- `main.rs` — bootstrap: tracing → `Config::from_env` → `MongoDB::new` → `CacheLayer` → `YahooFinanceClient` → `OpenRouterClient` → `AlertEngine` → `AnalysisEngine` (loads existing data from Mongo, then `tokio::spawn` continuous loop) → `axum::serve` with permissive CORS.
- `config.rs` — single `Config` struct loaded from `.env` (note: `OPENROUTER_API_KEY_STOCKS` is intentionally SCREAMING_SNAKE on the struct field too).
- `models.rs` — serde data types: `Stock`, `StockAnalysis`, `HistoricalPrice`, `MACDIndicator`, `StockFilter`, `AnalysisProgress`. Mongo `_id` is `Option<ObjectId>` with `skip_serializing_if`.
- `db.rs` — `MongoDB` struct: connection, upserts on `symbol`, `$and`-built dynamic filters in `get_latest_analyses`, indexes on `symbol` (asc) and `analyzed_at` (desc).
- `indexes.rs` — applied at startup via `db.rs`.
- `yahoo.rs` / `nasdaq.rs` — HTTP clients (must spoof a desktop User-Agent). NASDAQ supplies the symbol universe + market caps + sector + 52w hi/lo; Yahoo supplies OHLCV history.
- `async_fetcher.rs` — concurrent Yahoo batch fetcher governed by `YAHOO_CONCURRENCY` and `YAHOO_REQUEST_DELAY_MS`.
- `indicators.rs` — pure functions returning `Option<f64>`. **RSI uses Wilder's Smoothing** (matches TradingView): oversold < 30, overbought > 70. SMA(20/50), MACD(12/26 + signal-line approximation), EMA helper.
- `analysis.rs` — `AnalysisEngine`. Owns the 24/7 loop, `AnalysisProgress` (broadcast every ~2s by the WS handler), error tracking that does not abort the cycle, and post-cycle calls into `AlertEngine::evaluate_and_dispatch`. Filters small-caps via `MIN_MARKET_CAP_USD` and runaway moves via `MAX_ABS_PRICE_CHANGE_PCT`.
- `cache.rs` — two-tier Moka: stock-level (10k cap) + query/list-level (100 cap). The list cache is invalidated at the end of each cycle.
- `api.rs` — Axum router. `AppState` holds `db`, `cache`, `progress`, `yahoo_client`, `openrouter_client`, `nasdaq_client`, `alert_engine`. Endpoints: `GET /`, `/health`, `/api/progress`, `/api/stocks`, `POST /api/stocks/filter`, `WS /ws`, plus the alerts/watchlists routes (see below).
- `openrouter.rs` — optional AI summary/analysis layer; toggled by `OPENROUTER_ENABLED` and key presence.
- `bin/rate_limit_tester.rs` — standalone tool to sweep Yahoo concurrency/delay combos.

**Data flow:** NASDAQ screener → symbol universe → Yahoo OHLCV → `indicators.rs` → `StockAnalysis` → `db.rs` upsert + `cache.rs` insert → `api.rs` → frontend over REST/WS. `AlertEngine` consumes the same `Vec<StockAnalysis>` at end-of-cycle.

### Notifications subsystem (`src/notifications/`)

`AlertEngine` is the public surface; everything else is internal.

- `models.rs` — `ChannelKind`, `ChannelConfig`, rule trees (`AND`/`OR`/`NOT` + leaf conditions), `PendingNotification`, `DeliveryResult`.
- `repo.rs` — Mongo CRUD for channels / rules / watchlists / history. Creates its own indexes at startup (best-effort, non-fatal).
- `evaluator.rs` — state-aware evaluation: cooldowns, `require_consecutive` hysteresis, MACD bullish/bearish cross detection (compares previous cycle's histogram), `quiet_hours` UTC window.
- `dispatcher.rs` — fans out to channels; per-channel errors do not abort the batch. Substitutes `{{symbol}}`, `{{price}}`, `{{rsi}}`, `{{change_pct}}`, `{{matched}}`, `{{52w_low/high}}`, `{{market_cap}}`, `{{sector}}`, `{{rule_name}}`. Unknown placeholders are left intact (typos are visible).
- `channels/` — `Channel` trait + Discord implementation. `build_channel` in `channels/mod.rs` is the registration point.
- `api.rs` — HTTP routes: `/api/watchlists*`, `/api/alerts/channels*`, `/api/alerts/rules*`, `/api/alerts/history*`, `/api/alerts/status`. Webhook URLs live per-channel in MongoDB, NOT in env vars.

**To add a new channel** (Telegram/Email/etc.): extend `ChannelKind` + `ChannelConfig` in `models.rs`, add an impl under `channels/`, wire into `build_channel`, and mirror the config shape in `frontend/src/types.ts`. The evaluator/dispatcher/API are channel-agnostic.

### Frontend (`frontend/src/`)

CRA + React 19 + Chakra UI v3 + framer-motion + recharts + lucide-react. Key files: `App.tsx` (router + WS provider), `api.ts` (axios client), `hooks.ts` (`useWebSocket` auto-reconnect), `types.ts` (mirrors backend `models.rs`), `pages/` (Stocks, StockDetail, Alerts, etc.), `components/`, `theme/`.

## Conventions and gotchas

- **Port mismatch is the #1 footgun.** Backend default is `:3000` (`SERVER_PORT`). Frontend `package.json` proxy is `:3333`. Docker forces backend to `:3333`. For local dev, either set `SERVER_PORT=3333` in `.env` or change the proxy. Mongo in Docker is exposed on host `:27018` (mapped to container `:27017`) to avoid clashing with a local Mongo.
- **Yahoo rate limits.** Local default is `YAHOO_REQUEST_DELAY_MS=100` + `YAHOO_CONCURRENCY=5`; Docker raises delay to `500`. Older docs reference 4s — that was the old non-concurrent path. If you change these, sanity-check with `cargo run --bin rate_limit_tester`.
- **NASDAQ + Yahoo both need a desktop User-Agent.** Don't strip it.
- **Errors don't abort cycles.** `AnalysisEngine` accumulates them in `AnalysisProgress.errors` and continues; `AlertEngine` swallows per-channel failures the same way. Don't add early `?` returns at these boundaries.
- **Cache invalidation.** Anything that mutates `StockAnalysis` server-side must also invalidate the list cache, or the frontend will see stale results until next cycle. The continuous loop already does this at end-of-cycle.
- **Mongo upsert key is `symbol`.** One row per symbol, latest-wins. Do not introduce non-keyed inserts.
- **No `.cursor/` rules in repo.** The closest sibling doc is `.github/copilot-instructions.md`, which overlaps with this file but is older — prefer this file.
- **API response convention** (mainly notifications routes): `{ "success": true, ... }` / `{ "success": false, "error": "..." }`. Existing stock routes don't all follow this — match the surrounding handler.

## Adding things

- **New technical indicator** — pure fn in `indicators.rs` → field on `StockAnalysis` in `models.rs` → compute in `analysis.rs::analyze_stock` → expose to frontend via `frontend/src/types.ts`. Add a leaf condition in `notifications/models.rs` + `evaluator.rs` if it should be alertable.
- **New API endpoint** — handler in `api.rs` (or `notifications/api.rs` for alerts), route in `create_router`. Document in `API.md` if user-facing.
- **New filter** — extend `StockFilter` in `models.rs`, query branch in `db.rs::get_latest_analyses`, UI in `frontend/src/components/FilterPanel.tsx` (or its v2 location).
- **New stock universe source** — sit it next to `nasdaq.rs`; the engine consumes a `Vec<Stock>` so swapping/adding sources is local.

## Reference docs in repo

`API.md` (HTTP surface), `NOTIFICATIONS.md` (alert engine condition + placeholder reference), `STRUCTURE.md` (older per-module breakdown), `DOCKER.md` / `DOCKER_QUICK_REF.md` (compose details), `RSI_FIX_DETAILED.md` / `YAHOO_*_FIX*.md` (historical incidents — useful when something behaves "wrong" and you suspect regression).
