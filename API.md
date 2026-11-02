# API Documentation

## Base URL
```
http://localhost:3333
```

## Endpoints

### 1. Root
Get API information.

```
GET /
```

**Response:**
```json
{
  "name": "Auto Stock Analyser API",
  "version": "0.1.0",
  "status": "running"
}
```

---

### 2. Health Check
Check API and database status.

```
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "total_analyses": 150
}
```

---

### 3. Get Analysis Progress
Get current analysis cycle progress.

```
GET /api/progress
```

**Response:**
```json
{
  "total_stocks": 60,
  "analyzed": 45,
  "current_symbol": "AAPL",
  "cycle_start": "2025-11-06T10:00:00Z",
  "errors": 2,
  "completion_percentage": 75.0
}
```

---

### 4. Get All Stocks
Retrieve all analyzed stocks.

```
GET /api/stocks
```

**Response:**
```json
{
  "success": true,
  "count": 150,
  "stocks": [
    {
      "symbol": "AAPL",
      "price": 178.50,
      "rsi": 65.4,
      "sma_20": 175.20,
      "sma_50": 172.80,
      "macd": {
        "macd_line": 1.23,
        "signal_line": 1.10,
        "histogram": 0.13
      },
      "volume": 50000000,
      "is_oversold": false,
      "is_overbought": false,
      "analyzed_at": "2025-11-06T10:30:00Z"
    }
  ]
}
```

---

### 5. Filter Stocks
Filter stocks by various criteria.

```
POST /api/stocks/filter
Content-Type: application/json
```

**Request Body:**
```json
{
  "min_price": 50.0,
  "max_price": 200.0,
  "min_volume": 1000000,
  "min_rsi": 30.0,
  "max_rsi": 70.0,
  "only_oversold": false,
  "only_overbought": false
}
```

**Response:**
```json
{
  "success": true,
  "count": 25,
  "stocks": [...],
  "cached": false
}
```

**Filter Parameters:**
- `min_price` (optional): Minimum stock price
- `max_price` (optional): Maximum stock price
- `min_volume` (optional): Minimum trading volume
- `min_market_cap` (optional): Minimum market capitalization
- `max_market_cap` (optional): Maximum market capitalization
- `min_rsi` (optional): Minimum RSI value
- `max_rsi` (optional): Maximum RSI value
- `sectors` (optional): Array of sectors to filter by
- `only_oversold` (optional): Show only oversold stocks (RSI < 30)
- `only_overbought` (optional): Show only overbought stocks (RSI > 70)

---

### 6. WebSocket - Real-time Progress
Connect to receive real-time analysis progress updates.

```
WS ws://localhost:3333/ws
```

**Message Format:**
The server sends progress updates every 2 seconds:

```json
{
  "total_stocks": 60,
  "analyzed": 45,
  "current_symbol": "MSFT",
  "cycle_start": "2025-11-06T10:00:00Z",
  "errors": 2,
  "completion_percentage": 75.0,
  "last_cycle_started": "2025-11-06T10:00:00Z",
  "last_cycle_completed": null,
  "last_successful_cycle": "2025-11-06T09:00:00Z",
  "last_error": null
}
```

**JavaScript Example:**
```javascript
const ws = new WebSocket('ws://localhost:3333/ws');

ws.onmessage = (event) => {
  const progress = JSON.parse(event.data);
  console.log(`Progress: ${progress.analyzed}/${progress.total_stocks}`);
  console.log(`Current: ${progress.current_symbol}`);
};
```

---

## Backtesting

Run a rule-based strategy over historical prices and measure its performance.
Entry/exit reuse the alert engine's condition trees. Full reference, including
the strategy spec and metric definitions, is in `BACKTESTING.md`.

### Run a backtest

```
POST /api/backtest
```

**Request body:**
```jsonc
{
  "symbols": ["AAPL", "MSFT"],          // and/or a "watchlist_id"; union is simulated (≤ 25)
  "label": "RSI mean-reversion",         // optional
  "start_date": "2022-01-01T00:00:00Z",  // optional ISO-8601 window bounds
  "end_date":   "2024-01-01T00:00:00Z",
  "lookback_days": 730,                  // optional; overrides the date-derived Yahoo lookback
  "strategy": {
    "entry": { "op": "leaf", "condition": { "type": "rsi_below", "value": 30 } },
    "exit":  { "op": "leaf", "condition": { "type": "rsi_above", "value": 70 } },
    "stop_loss_pct": 8,
    "take_profit_pct": 20,
    "max_holding_bars": null,
    "position_size_pct": 1.0,
    "initial_capital": 10000,
    "commission_bps": 5,
    "slippage_bps": 5
  }
}
```

**Response:** `{ "success": true, "run": { ... } }` — the run embeds a result per
symbol (trade log, equity curve, metrics), an aggregate `summary`, and `_id`.

### List backtests

```
GET /api/backtests
```

Returns lightweight summaries (heavy equity curves omitted), most recent first:
```json
{ "success": true, "count": 3, "backtests": [ { "_id": "…", "label": "…", "total_return_pct": 12.5, "trade_count": 7, "win_rate_pct": 57.1, "max_drawdown_pct": 9.3, "ran_at": "…" } ] }
```

### Get a backtest run

```
GET /api/backtest/:id
```

Returns the full run (`{ "success": true, "run": { ... } }`) or
`{ "success": false, "error": "…" }` if the id is invalid or not found.

---

## AI research

```http
POST /api/ai/research
Content-Type: application/json
```

Generate an answer grounded in the latest stored analyses for one to four stock symbols. This endpoint does not modify stock data or user portfolios.

```json
{
  "symbols": ["AAPL", "MSFT"],
  "question": "Compare the available technical signals and identify the main uncertainties."
}
```

The question must contain 1–1,000 characters after trimming. Symbols are normalized and validated; duplicate symbols do not produce duplicate source rows. Unavailable symbols are reported separately. An entirely unavailable selection returns an error rather than generating an ungrounded answer.

Successful responses contain:

| Field | Meaning |
| --- | --- |
| `success` | `true` |
| `answer` | Generated Markdown with symbol references |
| `question` | The submitted, normalized question |
| `model_used` | Model discovered from the configured endpoint |
| `generated_at` | Generation timestamp |
| `sources` | Exact source snapshots used: symbol, analyzed_at, price, day change percentage, RSI, SMA 20/50, sector, volume, and market cap |
| `missing_symbols` | Requested symbols with no stored analysis |

Indicators and metadata may be `null`. Prices use the source listing's units; cross-currency absolute prices are not comparable without conversion. `analyzed_at` is the application's analysis timestamp, not a guarantee of real-time exchange data.

Errors use a non-success HTTP status and `{ "success": false, "error": "..." }`: 400 for invalid inputs or duplicate symbols, 404 when all symbols are missing, 422 for an invalid stored price, 429 while another research request is running, 503 for unavailable data/model services, 504 for the 120-second deadline, and 502 for an invalid, truncated, or failed model response. JSON bodies are limited to 16 KiB. The model output is capped at 1,200 tokens and 64 KiB of response bytes. See [AI research setup](docs/ai-research.md) for the local model connection.

`GET /api/ai/status` returns `enabled`, `current_model`, `available_models_count`, and `base_url`. Existing stock-analysis and news-summary routes continue to use the same configured AI client.

## Portfolio

Upload the holdings you own and the dashboard tailors itself to them. Holdings live in the `portfolio_holdings` Mongo collection, one row per lot (a symbol in one account). They are separate from the alert-engine `positions` collection.

```http
POST /api/portfolio/import?mode=replace|merge&parser=auto|llm|heuristic&dry_run=true|false
Content-Type: multipart/form-data
```

Send a `file` field (CSV / TSV / semicolon-separated, Excel `.xlsx`/`.xls`/`.xlsm`, ODS, JSON, HTML table or plain text; max 8 MB) **or** a `text` field with pasted content plus an optional `filename`. PDF is rejected with a clear message. The document is decoded to text, then parsed:

- `parser=auto` (default): the configured AI model (`openrouter.rs`) extracts holdings as JSON; the deterministic parser runs as the backup whenever AI is disabled, busy, times out (180 s), fails, or returns nothing usable. Symbols the model returns must literally appear in the document, which blocks hallucinated tickers. Lots the deterministic parser recognised from column headers but the model dropped are added back with a warning.
- `parser=heuristic`: deterministic only. Detects the delimiter, maps column headers through alias lists (symbol / ticker, quantity / shares / units, average cost / book value, market price / value, currency, account), reads JSON arrays of objects, and falls back to scanning for ticker-like tokens followed by a number when no header row exists.
- `parser=llm`: AI only (still falls back on failure, with a warning).

Canadian Depositary Receipts are detected from the description (`CDR`, `C$HDG`), flagged `is_cdr`, keyed by the underlying US symbol and priced in CAD from the file rather than from the live US quote. `mode=replace` (default) wipes every holding first; `mode=merge` replaces only lots that share `(symbol, account)` with the upload. `dry_run=true` returns the parsed preview without saving.

Response: `{ success, dry_run, mode, format, filename, parser: "llm"|"heuristic", model_used, holdings: [ParsedHolding], count, imported, warnings, skipped }`. A document that yields no holdings returns 422 with the same diagnostics.

```http
GET /api/portfolio
```

Returns `holdings` (each lot joined with the latest analysis: `market` slice, `current_value`, `value_source: "live"|"import"`, `unrealized_pnl`, `unrealized_pnl_pct`, `day_change_value`), `positions` (lots folded per symbol with weight and lot count) and `summary` (counts, per-currency totals, sector weights, last import, symbols not yet in the analysis universe).

```http
GET /api/portfolio/related?limit=12&min_market_cap=2000000000
```

Stocks relevant to what is held, excluding held symbols: same-sector names score by the portfolio's sector weight; when sector data is missing (NASDAQ does not always supply it) names of similar market cap (within roughly 3× of a held position) score by closeness and position weight; then an oversold / low-RSI tilt and market cap as tie-breakers, capped per sector for diversity. Each row carries a human-readable `reason` and the held symbols it relates to.

```http
POST   /api/portfolio/holdings          { symbol, quantity, avg_cost?, currency?, account?, description?, is_cdr? }
PATCH  /api/portfolio/holdings/:id      any subset of the fields above
DELETE /api/portfolio/holdings/:id
DELETE /api/portfolio                   remove every holding
```

`cargo run --example parse_portfolio -- holdings.csv` runs a file through the deterministic parser from the command line.

## Technical Indicators

### RSI (Relative Strength Index)
- **Range:** 0-100
- **Oversold:** < 30 (potential buy opportunity)
- **Overbought:** > 70 (potential sell opportunity)
- **Period:** 14 days

### SMA (Simple Moving Average)
- **SMA 20:** 20-day moving average
- **SMA 50:** 50-day moving average
- Used to identify trend direction

### MACD (Moving Average Convergence Divergence)
- **MACD Line:** Difference between 12-day and 26-day EMA
- **Signal Line:** 9-day EMA of MACD line
- **Histogram:** Difference between MACD and signal line

---

## Error Responses

All errors follow this format:
```json
{
  "success": false,
  "error": "Error description"
}
```

---

## Rate Limiting

- Analysis engine: 500ms delay between stock requests
- WebSocket updates: Every 2 seconds
- Cache TTL: 5 minutes (configurable)
- Analysis cycle: Every 1 hour (configurable)
