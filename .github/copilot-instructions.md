# Auto Stock Analyser - AI Agent Instructions

## Project Overview
Rust backend + React frontend stock analysis platform with 24/7 continuous analysis, MongoDB persistence, WebSocket updates, and multi-layer caching.

## Architecture

### Backend (Rust)
- **Entry**: `src/main.rs` bootstraps: config → MongoDB → cache → analysis engine → Axum HTTP/WebSocket server
- **Modules**:
  - `models.rs`: Data structures (Stock, StockAnalysis, StockFilter, AnalysisProgress, MACD)
  - `db.rs`: MongoDB operations with `MongoDB` struct (CRUD, filtering, indexing)
  - `yahoo.rs`: Yahoo Finance API client (`YahooFinanceClient`)
  - `indicators.rs`: Pure technical analysis functions (RSI, SMA, MACD, EMA)
  - `cache.rs`: Moka-based two-tier caching (stock-level + query-level)
  - `analysis.rs`: Continuous analysis engine (`AnalysisEngine`) - runs 24/7 in background tokio task
  - `api.rs`: Axum REST + WebSocket server (`AppState`, `create_router()`)

**Data Flow**: Yahoo Finance → `yahoo.rs` → `indicators.rs` → `analysis.rs` → `db.rs` + `cache.rs` → `api.rs` → Frontend

### Frontend (React + TypeScript)
- **Stack**: React 19, Chakra UI, TypeScript, Axios, WebSocket
- **Location**: `frontend/` directory
- **Key Files**:
  - `src/App.tsx`: Main component with WebSocket integration
  - `src/components/StockCard.tsx`: Individual stock display
  - `src/components/FilterPanel.tsx`: Advanced filtering UI
  - `src/components/ProgressBar.tsx`: Real-time analysis progress
  - `src/api.ts`: API client functions
  - `src/hooks.ts`: WebSocket custom hook
  - `src/types.ts`: TypeScript type definitions

## Critical Workflows

### Development
```bash
# Backend (from root)
cargo run                          # Debug build with hot reload
RUST_LOG=debug cargo run          # With verbose logging
cargo build --release             # Production build

# Frontend (from frontend/)
npm start                         # Dev server on port 3001, proxies to backend:3333
npm run build                     # Production build
npm test                          # Run tests

# Testing
cargo test                        # Run all Rust tests
./test_api.sh                     # E2E API tests (requires server running)
cargo clippy                      # Linting
cargo fmt                         # Formatting
```

### Environment Configuration
Copy `.env.example` to `.env` and modify as needed. **Critical**: Backend runs on port 3000 by default (configurable via `SERVER_PORT`), but frontend proxy expects port 3333 (see `frontend/package.json` proxy setting).

**Port Mismatch**: Set `SERVER_PORT=3333` in `.env` to match frontend proxy, or update `frontend/package.json` proxy to `http://localhost:3000`.

### Database Setup
```bash
# Local MongoDB (macOS)
brew install mongodb-community
brew services start mongodb-community

# Verify
mongosh --eval "db.version()"
```

Database: `stock_analyzer`, Collection: `stock_analysis` with indexes on `symbol` (asc) and `analyzed_at` (desc).

## Project-Specific Conventions

### Technical Indicators
- **RSI**: Uses Wilder's Smoothing (matches TradingView). Oversold < 30, Overbought > 70
- **SMA**: Simple moving average (20 & 50 periods)
- **MACD**: 12/26-period EMA convergence/divergence (signal line is approximation)
- All calculations in `indicators.rs` are pure functions returning `Option<f64>`

### Rate Limiting
**Yahoo Finance**: 4-second delay between requests in `analysis.rs` (line ~115) to avoid 429 errors. Do not reduce below 3 seconds.

### Error Handling
- Backend: `anyhow::Result` for async operations, `thiserror` for domain errors
- Analysis engine tracks errors in `AnalysisProgress.errors` but continues processing
- Frontend: Toast notifications via Chakra UI's `toaster`

### Testing
All modules include `#[cfg(test)]` blocks. Key test helper in `indicators.rs`: `create_test_prices()` generates synthetic `HistoricalPrice` data.

### WebSocket Pattern
- Server broadcasts progress every 2 seconds in `api.rs::websocket_connection()`
- Frontend hook (`useWebSocket`) auto-reconnects and updates state
- Progress structure: `{total_stocks, analyzed, current_symbol, cycle_start, errors}`

### Caching Strategy
Two-tier in `cache.rs`:
1. **Stock cache**: Individual analyses (10,000 capacity, TTL from config)
2. **List cache**: Query results (100 capacity, same TTL)
3. List cache invalidated after each full analysis cycle

### MongoDB Patterns
- Upsert on `symbol` field in `db.rs::save_analysis()` (line ~75)
- Dynamic filter building in `get_latest_analyses()` with `$and` combinator
- All models use `Option<ObjectId>` for `_id` field with `skip_serializing_if`

## Integration Points

### External APIs
- **Yahoo Finance**: CSV endpoint (`query2.finance.yahoo.com/v7/finance/download`)
- **NASDAQ Screener**: JSON API (`api.nasdaq.com/api/screener/stocks`) for symbol list with market caps
- Both require user agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

### Frontend-Backend Communication
- REST API: `GET /api/stocks`, `POST /api/stocks/filter`, `GET /api/progress`
- WebSocket: `ws://localhost:3000/ws` for live updates
- CORS: Configured to allow all origins in production (via `tower-http`)

## Common Pitfalls

1. **Port conflicts**: Backend defaults to 3000, but tests/docs often reference 3333. Check `.env` and `frontend/package.json` proxy.
2. **MongoDB connection**: Ensure MongoDB is running before starting backend. Connection string format matters (Atlas vs local).
3. **Yahoo Finance failures**: Some symbols fail (delisted, invalid). This is expected; check logs with `RUST_LOG=debug`.
4. **Analysis cycle**: First cycle takes ~4 minutes (60 stocks × 4s). WebSocket shows progress; wait before expecting data.
5. **Frontend proxy**: `npm start` proxies API calls to backend. If backend is on different port, update `package.json`.

## Key Files for Common Tasks

- **Add new indicator**: Edit `indicators.rs`, update `StockAnalysis` in `models.rs`, calculate in `analysis.rs::analyze_stock()`
- **Add API endpoint**: Create handler in `api.rs`, add route in `create_router()`
- **Modify stock list**: Edit `analysis.rs::get_stock_symbols()` fallback array
- **Change filter options**: Update `StockFilter` in `models.rs`, query logic in `db.rs::get_latest_analyses()`
- **Frontend UI changes**: Components in `frontend/src/components/`, Chakra UI theme in `frontend/src/index.tsx`

## Documentation
- **API Reference**: `API.md` (all endpoints with examples)
- **Setup Guide**: `SETUP.md` and `QUICKSTART.md` (5-minute start)
- **Architecture**: `STRUCTURE.md` (detailed module breakdown)
- **Test Results**: `TEST_RESULTS.md`, `FIX_COMPLETE.md` (historical fixes)
