# Backend (src/) — scoped notes

This file is loaded only when working inside `src/`. For the task→file map, see `.claude/INDEX.md`.

## Module map

- `main.rs` — bootstrap order: tracing → `Config::from_env` → `MongoDB::new` → `CacheLayer` → `YahooFinanceClient` → `OpenRouterClient` → `AlertEngine` → `MarketauxClient` → `AnalysisEngine` → `axum::serve`. Creates the `stock_tx` broadcast channel pushing each saved `StockAnalysis` to WS clients. **New modules must be declared in both `main.rs` (`mod`) and `lib.rs` (`pub mod`).**
- `config.rs` — `Config` from env. `OPENROUTER_API_KEY_STOCKS` is intentionally SCREAMING_SNAKE on the struct field.
- `models.rs` — serde data types shared with frontend via `frontend/src/types.ts`. Mongo `_id` is `Option<ObjectId>` with `skip_serializing_if`.
- `db.rs` — Mongo CRUD. Upsert key is `symbol`. Filters built with `$and` in `get_latest_analyses`.
- `indexes.rs` — startup index creation.
- `yahoo.rs`, `nasdaq.rs` — HTTP clients; both need a desktop User-Agent.
- `async_fetcher.rs` — concurrent Yahoo fetcher governed by `YAHOO_CONCURRENCY`, `YAHOO_REQUEST_DELAY_MS`.
- `indicators.rs` — pure fns returning `Option<f64>`. RSI uses **Wilder's Smoothing** (matches TradingView).
- `analysis.rs` — `AnalysisEngine`, the 24/7 loop, `AnalysisProgress`, post-cycle `AlertEngine::evaluate_and_dispatch`.
- `cache.rs` — two-tier Moka (stock-level 10k + list-level 100). List cache is invalidated end-of-cycle.
- `api.rs` — Axum router + `AppState`. `/ws` streams progress **and** per-stock updates; `/metrics` returns Prometheus text (exempt from the JSON convention).
- `openrouter.rs` — optional AI layer; gated by `OPENROUTER_ENABLED` + (key presence *or* a non-OpenRouter `AI_BASE_URL`). Raw OpenAI-compatible HTTP, so it serves OpenRouter and self-hosted vLLM alike; models come from the endpoint's `/models` list, never hardcoded.
- `ai_research.rs` — bounded, on-demand stock questions and comparisons over stored analysis snapshots. Keep validation before model calls, source snapshots attached to answers, and generated content separate from actions or database mutations.
- `marketaux.rs` — optional Marketaux news client; free tier is 100 req/day.
- `backtest.rs` — backtesting engine (`POST /api/backtest`); see `BACKTESTING.md`.
- `metrics.rs` — Prometheus counters on a dedicated `REGISTRY` + the `/metrics` handler.
- `symbols.rs` — `normalize_symbol_key` (`BRK.B` → `BRK-B`; keeps `.TO`/`.V`/`.NE`/`.CN`). Use it for anything keying Mongo by symbol.
- `notifications/` — `AlertEngine` is the only public surface; rest is internal.

## Hard rules

- **Errors do NOT abort cycles.** `AnalysisEngine` accumulates errors in `AnalysisProgress.errors`; `AlertEngine` swallows per-channel failures. Don't add early `?` returns at these boundaries.
- **Mongo upsert key is `symbol`.** One row per symbol, latest-wins. No non-keyed inserts.
- **Cache invalidation.** Anything mutating `StockAnalysis` server-side must invalidate the list cache.
- **Don't strip the desktop User-Agent** from Yahoo or NASDAQ clients.
- **API response shape** in notifications routes is `{ success, ... }` / `{ success: false, error }`. Older stocks routes don't all follow this — match the surrounding handler.

## When in doubt

Open `.claude/INDEX.md` in the repo root for a task→file lookup before reading widely.
