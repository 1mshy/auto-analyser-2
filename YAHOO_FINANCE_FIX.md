# Yahoo Finance Fix Notes

## Issue
The `yahoo_finance_api` crate is failing to fetch data for all stock symbols. This appears to be due to Yahoo Finance's unofficial API blocking or rate limiting requests.

## Potential Solutions

### Option 1: Add Headers and Retry Logic (Recommended)
Add User-Agent headers and implement exponential backoff in `src/yahoo.rs`:

```rust
// Add to yahoo_finance_api if possible, or switch to reqwest
```

### Option 2: Switch to Alternative API
Consider these alternatives:

1. **Alpha Vantage** (Free tier: 25 requests/day)
   - Crate: `alpha_vantage`
   - Very reliable, good documentation
   - Limited free tier

2. **IEX Cloud** (Free tier: 50K messages/month)
   - REST API via `reqwest`
   - Good data quality
   - Requires API key

3. **Polygon.io** (Free tier: Limited)
   - Comprehensive market data
   - Good for production
   - Requires API key

4. **Finnhub** (Free tier: 60 calls/minute)
   - Real-time data
   - WebSocket support
   - Requires API key

### Option 3: Add Mock Data for Testing
For demonstration and testing purposes, use mock data:

```rust
// In src/yahoo.rs
#[cfg(test)]
pub fn use_mock_data() -> bool {
    std::env::var("USE_MOCK_DATA").is_ok()
}
```

## Temporary Workaround

Set longer delays in `.env`:
```env
ANALYSIS_INTERVAL_SECS=7200  # Every 2 hours instead of 1
```

And increase rate limiting in `src/analysis.rs`:
```rust
// From:
sleep(Duration::from_millis(500)).await;

// To:
sleep(Duration::from_secs(3)).await;  // 3 seconds between requests
```

## Testing Without Yahoo Finance

You can still test all functionality by:
1. Manually inserting mock data into MongoDB
2. Testing API endpoints with existing data
3. Verifying WebSocket updates with progress tracking

## Long-term Solution

For production deployment:
- **Use Alpha Vantage** or **IEX Cloud** with API keys
- Implement proper error handling and retry logic
- Cache data aggressively (24-hour cache for historical data)
- Run analysis once per day during non-peak hours

## Files to Modify

If switching APIs:
1. `Cargo.toml` - Change dependency
2. `src/yahoo.rs` - Rewrite to use new API
3. `src/analysis.rs` - Update error handling
4. `.env.example` - Add API key variables
5. `SETUP.md` - Update setup instructions
