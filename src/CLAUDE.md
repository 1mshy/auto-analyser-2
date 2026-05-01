# Backend (src/) — scoped notes

This file is loaded only when working inside `src/`. For the task→file map, see `.claude/INDEX.md`.

## Module map

- `main.rs` — bootstrap order: tracing → `Config::from_env` → `MongoDB::new` → `CacheLayer` → `YahooFinanceClient` → `OpenRouterClient` → `AlertEngine` → `AnalysisEngine` → `axum::serve`.
- `config.rs` — `Config` from env. `OPENROUTER_API_KEY_STOCKS` is intentionally SCREAMING_SNAKE on the struct field.
- `models.rs` — serde data types shared with frontend via `frontend/src/types.ts`. Mongo `_id` is `Option<ObjectId>` with `skip_serializing_if`.
- `db.rs` — Mongo CRUD. Upsert key is `symbol`. Filters built with `$and` in `get_latest_analyses`.
- `indexes.rs` — startup index creation.
- `yahoo.rs`, `nasdaq.rs` — HTTP clients; both need a desktop User-Agent.
- `async_fetcher.rs` — concurrent Yahoo fetcher governed by `YAHOO_CONCURRENCY`, `YAHOO_REQUEST_DELAY_MS`.
- `indicators.rs` — pure fns returning `Option<f64>`. RSI uses **Wilder's Smoothing** (matches TradingView).
- `analysis.rs` — `AnalysisEngine`, the 24/7 loop, `AnalysisProgress`, post-cycle `AlertEngine::evaluate_and_dispatch`.
- `cache.rs` — two-tier Moka (stock-level 10k + list-level 100). List cache is invalidated end-of-cycle.
- `api.rs` — Axum router + `AppState`.
- `openrouter.rs` — optional AI layer; gated by `OPENROUTER_ENABLED` + key presence.
- `notifications/` — `AlertEngine` is the only public surface; rest is internal.

## Hard rules

- **Errors do NOT abort cycles.** `AnalysisEngine` accumulates errors in `AnalysisProgress.errors`; `AlertEngine` swallows per-channel failures. Don't add early `?` returns at these boundaries.
- **Mongo upsert key is `symbol`.** One row per symbol, latest-wins. No non-keyed inserts.
- **Cache invalidation.** Anything mutating `StockAnalysis` server-side must invalidate the list cache.
- **Don't strip the desktop User-Agent** from Yahoo or NASDAQ clients.
- **API response shape** in notifications routes is `{ success, ... }` / `{ success: false, error }`. Older stocks routes don't all follow this — match the surrounding handler.

## When in doubt

Open `.claude/INDEX.md` in the repo root for a task→file lookup before reading widely.
