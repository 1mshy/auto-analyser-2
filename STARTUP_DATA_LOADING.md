# Automatic MongoDB Data Loading with Per-Ticker Caching

## Overview
The server automatically loads existing stock analysis data from MongoDB on startup and implements intelligent per-ticker caching. During analysis cycles, each ticker is checked individually - if it was analyzed within the configured interval (default: 1 hour), it's skipped to avoid unnecessary Yahoo Finance API calls.

## Implementation Details

### 1. Database Methods (`db.rs`)
Added methods to the `MongoDB` struct:

#### `get_analysis_by_symbol(symbol: &str)`
- Retrieves a specific stock's analysis from MongoDB
- Returns `Option<StockAnalysis>` - None if ticker hasn't been analyzed yet
- Used to check when each ticker was last analyzed

#### `get_all_analyses()`
- Loads all stock analyses from MongoDB
- Returns `Vec<StockAnalysis>` sorted by most recent first
- Used to populate the cache on startup

#### `get_latest_analysis_timestamp()`
- Queries the most recent `analyzed_at` timestamp across all tickers
- Used for logging and monitoring purposes

### 2. Analysis Engine Methods (`analysis.rs`)

#### `load_existing_data()`
- Loads all analyses from MongoDB on startup
- Populates the two-tier cache with existing data
- Returns the count of loaded analyses
- Makes data immediately available via API

#### Updated `run_analysis_cycle()`
**Per-Ticker Logic:**
1. For each ticker in the list:
   - Query MongoDB for existing analysis
   - Check the `analyzed_at` timestamp
   - If analyzed within `interval_secs`, skip (with log message)
   - If stale or never analyzed, query Yahoo Finance
   - Update database and cache with fresh data
2. Continue through entire ticker list without stopping
3. Report statistics: analyzed, skipped, errors

**Benefits:**
- Respects Yahoo Finance rate limits (4s between actual queries)
- Skips recently analyzed tickers automatically
- Never stops the analysis cycle
- Gradually refreshes all tickers over time

### 3. Main Startup Flow (`main.rs`)
Updated initialization sequence:
1. Load configuration
2. Connect to MongoDB  
3. Initialize cache layer
4. Create analysis engine
5. **Load existing data** from MongoDB into cache
6. Start background analysis task (begins immediately)
7. Start HTTP/WebSocket server

## Behavior Examples

### Scenario 1: First Startup (No Data)
```
📥 Loading existing stock data from database...
📊 No existing data found. Will perform initial analysis.
🔄 Analyzing new ticker: AAPL
🔄 Analyzing new ticker: MSFT
...
Cycle complete. Processed 60 stocks (60 analyzed, 0 skipped, 0 errors)
```

### Scenario 2: Fresh Restart (Data < 1 Hour Old)
```
📥 Loading existing stock data from database...
✅ Loaded 60 stock analyses from database
⏭️  Skipping AAPL - analyzed 450s ago (threshold: 3600s)
⏭️  Skipping MSFT - analyzed 454s ago (threshold: 3600s)
...
Cycle complete. Processed 60 stocks (0 analyzed, 60 skipped, 0 errors)
```

### Scenario 3: Partial Refresh (Some Stale Data)
```
📥 Loading existing stock data from database...
✅ Loaded 60 stock analyses from database
⏭️  Skipping AAPL - analyzed 500s ago (threshold: 3600s)
🔄 Re-analyzing MSFT - last analyzed 3650s ago
⏭️  Skipping GOOGL - analyzed 510s ago (threshold: 3600s)
🔄 Re-analyzing AMZN - last analyzed 3700s ago
...
Cycle complete. Processed 60 stocks (15 analyzed, 45 skipped, 2 errors)
```

## Configuration

The per-ticker caching threshold is controlled by `ANALYSIS_INTERVAL_SECS`:

```bash
# .env file
ANALYSIS_INTERVAL_SECS=3600  # 1 hour - tickers older than this will be re-analyzed
```

**Recommended values:**
- Development: `300` (5 minutes) - for frequent testing
- Production: `3600` (1 hour) - balanced freshness and API usage
- High-frequency: `1800` (30 minutes) - for more frequent updates
- Conservative: `7200` (2 hours) - minimize API calls

## Logging

The system provides detailed per-ticker logging:

```
Beginning new analysis cycle
Analyzing 60 stocks
⏭️  Skipping AAPL - analyzed 450s ago (threshold: 3600s)
🆕 Analyzing new ticker: NEWCO
🔄 Re-analyzing TSLA - last analyzed 3650s ago
⏭️  Skipping MSFT - analyzed 500s ago (threshold: 3600s)
...
Cycle complete. Processed 60 stocks (15 analyzed, 45 skipped, 2 errors)
```

**Log Symbols:**
- 📥 Loading data
- ✅ Success
- ⏭️  Skipped (fresh)
- 🆕 New ticker
- 🔄 Re-analyzing (stale)

## Performance Characteristics

### Analysis Cycle Duration
With 60 tickers and 4-second rate limiting:

- **All fresh (60 skipped)**: ~1 second (just database checks)
- **All stale (60 analyzed)**: ~4 minutes (60 × 4s)
- **Mixed (30/30)**: ~2 minutes (30 × 4s)

### Database Queries
- Startup: 1 query to load all analyses
- Per cycle: 1 query per ticker to check timestamp
- Minimal overhead (~10-50ms per check)

### Yahoo Finance API Calls
- Only for stale/new tickers
- Respects 4-second rate limit
- Automatic retry on failures
- Gradual refresh over multiple cycles

## API Impact

### Immediate Availability
All endpoints return cached data immediately:
- `/api/stocks` - All loaded analyses
- `/api/stocks/filter` - Filtered cached data
- `/api/progress` - Real-time cycle progress

### Data Freshness
Each ticker shows its actual analysis timestamp:
```json
{
  "symbol": "AAPL",
  "analyzed_at": "2025-11-06T14:30:45Z",
  ...
}
```

Clients can check freshness and decide if data is acceptable for their use case.

## Error Handling

### Per-Ticker Errors
- Database query failures: Log warning, analyze ticker anyway
- Yahoo Finance failures: Log error, continue to next ticker
- Save failures: Log error, increment error count

### Cycle Behavior
- **Never stops**: Processes entire ticker list
- **Tracks errors**: Reports in cycle summary
- **Continues scheduling**: Next cycle runs after `interval_secs`

### Error Recovery
- Failed tickers remain stale in database
- Will be retried in next cycle (immediately, since still stale)
- No permanent blacklisting

## Monitoring

Track these metrics for health:

1. **Skip Rate**: `skipped / total` - should be high for stable systems
2. **Error Rate**: `errors / analyzed` - should be low (<5%)
3. **Cycle Duration**: Should correlate with analyzed count
4. **Oldest Ticker**: Maximum staleness across all tickers

Example monitoring query:
```javascript
db.stock_analysis.find().sort({analyzed_at: 1}).limit(1)
// Shows oldest ticker - should be < 2× interval_secs
```

## Advantages Over Global Refresh

❌ **Old approach**: Check global timestamp, refresh all or none
✅ **New approach**: Check per-ticker, refresh only stale

**Benefits:**
1. **Gradual updates**: Never blocks on full refresh
2. **Rate limit friendly**: Spreads API calls over time
3. **Partial outages**: Some tickers can fail without blocking others
4. **Cost efficient**: Minimizes redundant API calls
5. **Always available**: Cached data served immediately
