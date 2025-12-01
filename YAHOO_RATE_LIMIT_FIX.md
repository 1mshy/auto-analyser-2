# Yahoo Finance Rate Limiting in Docker - Analysis & Solutions

## Problem Summary

When running in Docker containers, **all requests to Yahoo Finance are being rate limited (HTTP 429)**, even with:
- ✅ Proper browser-like headers (Accept, User-Agent, sec-ch-ua, etc.)
- ✅ Updated Chrome 142 User-Agent
- ✅ Using `query2.finance.yahoo.com` endpoint
- ✅ 10+ second delays between requests with random jitter
- ✅ Exponential backoff retry logic (5s, 10s, 20s)

## Root Cause

Yahoo Finance uses sophisticated detection to identify and block automated traffic:

1. **Container Detection**: Docker containers have different network fingerprints
2. **Missing Browser Context**: No cookies, localStorage, or session state
3. **TLS Fingerprinting**: reqwest's TLS handshake differs from browsers
4. **IP Reputation**: Container IPs may be flagged or have poor reputation
5. **Request Patterns**: Even with delays, the pattern is too regular

## What Was Fixed

### 1. Updated Yahoo Finance Client (`src/yahoo.rs`)
- ✅ Switched from `query1` to `query2.finance.yahoo.com`
- ✅ Added comprehensive browser headers matching successful curl
- ✅ Updated User-Agent to Chrome 142
- ✅ Enhanced retry logic with exponential backoff
- ✅ Added random jitter (0-2s) to all delays
- ✅ Improved logging for debugging

### 2. Configurable Rate Limiting (`src/config.rs`, `src/analysis.rs`)
- ✅ Added `YAHOO_REQUEST_DELAY_MS` environment variable
- ✅ Default: 8000ms (8 seconds) between requests
- ✅ Docker: 10000ms (10 seconds) with 0-2s jitter
- ✅ Visible in logs during startup

### 3. Enhanced Error Handling
- ✅ Retries with increasing delays: 5s → 10s → 20s
- ✅ Detailed logging at each retry attempt
- ✅ Graceful degradation (continues with other stocks)

## Solutions & Workarounds

### Option 1: Use a Proxy Service ⭐ **RECOMMENDED**
Add a rotating proxy service to bypass rate limits:

```yaml
# docker-compose.yml
backend:
  environment:
    - HTTP_PROXY=http://your-proxy:port
    - HTTPS_PROXY=http://your-proxy:port
    - YAHOO_REQUEST_DELAY_MS=5000  # Can reduce delay with proxy
```

**Proxy Services**:
- [Bright Data](https://brightdata.com/) (paid, residential IPs)
- [ScraperAPI](https://www.scraperapi.com/) (paid, handles rate limiting)
- [ProxyMesh](https://proxymesh.com/) (paid, rotating proxies)
- [Tor SOCKS proxy](https://hub.docker.com/r/dperson/torproxy/) (free, slower)

### Option 2: Alternative Data Sources

Replace Yahoo Finance with more API-friendly alternatives:

#### Alpha Vantage (Free tier: 25 req/day)
```rust
// Add to Cargo.toml
alpha_vantage = "0.9"

// Implementation
use alpha_vantage::Client;
let client = Client::new("YOUR_API_KEY");
let data = client.time_series_daily("AAPL").await?;
```

#### Twelve Data (Free tier: 800 req/day)
```rust
// HTTP endpoint
https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day&apikey=YOUR_KEY
```

#### Polygon.io (Free tier: 5 req/min)
```rust
https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/...?apikey=YOUR_KEY
```

### Option 3: Increase Delays Significantly

For Docker without proxies, increase delays dramatically:

```yaml
# docker-compose.yml
backend:
  environment:
    - YAHOO_REQUEST_DELAY_MS=30000  # 30 seconds between requests
```

This means analyzing 60 stocks takes **30 minutes** instead of 4 minutes.

### Option 4: Use Browser Automation (Selenium/Puppeteer)

Run a headless browser inside Docker to make truly browser-like requests:

```dockerfile
# Add to Dockerfile
RUN apt-get install -y chromium chromium-driver
```

```rust
// Use thirtyfour crate for Selenium
thirtyfour = "0.31"
```

This is **slow** but bypasses most detection.

### Option 5: Hybrid Approach - Cache Aggressively

Since you're already caching, extend cache TTL significantly:

```yaml
# docker-compose.yml
backend:
  environment:
    - ANALYSIS_INTERVAL_SECS=21600  # 6 hours instead of 1 hour
    - CACHE_TTL_SECS=18000          # 5 hours cache
    - YAHOO_REQUEST_DELAY_MS=20000  # 20 seconds
```

This reduces request frequency by 6x.

## Testing the Fix

### Test 1: Verify Local Machine Works
```bash
# Should work from your machine (with your browser cookies/IP)
curl 'https://query2.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=5d' \
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
```

### Test 2: Verify Docker Container Fails
```bash
# Run this inside the container - will likely get 429
docker exec stock_analyzer_backend sh -c "curl -s 'https://query2.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=5d'"
```

### Test 3: Monitor Logs
```bash
docker logs -f stock_analyzer_backend | grep -E "(Rate limited|✅)"
```

## Current Configuration

The application now includes:

| Setting | Value | Purpose |
|---------|-------|---------|
| `YAHOO_REQUEST_DELAY_MS` | 10000ms (Docker)<br>8000ms (local) | Base delay between requests |
| Random Jitter | 0-2000ms | Mimics human behavior |
| Retry Delays | 5s, 10s, 20s | Exponential backoff |
| Max Retries | 3 | Attempts before giving up |
| Request Headers | 11 browser headers | Mimics Chrome 142 |

## Recommended Configuration for Docker

```yaml
# docker-compose.yml - Best balance of speed vs. success rate
backend:
  environment:
    - YAHOO_REQUEST_DELAY_MS=15000   # 15 seconds
    - ANALYSIS_INTERVAL_SECS=7200    # 2 hours between cycles
    - CACHE_TTL_SECS=6000            # 1.5 hours cache
```

Or with proxy:
```yaml
backend:
  environment:
    - HTTP_PROXY=http://proxy:8080
    - HTTPS_PROXY=http://proxy:8080
    - YAHOO_REQUEST_DELAY_MS=5000    # Can be faster with proxy
```

## Next Steps

1. **Short-term**: Increase `YAHOO_REQUEST_DELAY_MS` to 20-30 seconds
2. **Medium-term**: Implement Alpha Vantage or Twelve Data as fallback
3. **Long-term**: Set up rotating proxy service for production

## Files Modified

- `src/yahoo.rs` - Enhanced headers, retry logic, query2 endpoint
- `src/analysis.rs` - Configurable delays with jitter, improved logging
- `src/config.rs` - Added `yahoo_request_delay_ms` config
- `src/main.rs` - Pass delay config to engine
- `docker-compose.yml` - Added `YAHOO_REQUEST_DELAY_MS=10000`
- `.env.example` - Documented new config option
- `Cargo.toml` - Added `rand` dependency for jitter

## Logs Analysis

Current behavior in Docker:
```
INFO auto_analyser_2::analysis: ⏱️ Waiting 10125ms before next request
INFO auto_analyser_2::analysis: 🆕 Analyzing new ticker: AAPL
WARN auto_analyser_2::yahoo: ⚠️ Rate limited on attempt 1 for AAPL
WARN auto_analyser_2::yahoo: Retry attempt 2 for AAPL after 6s delay
WARN auto_analyser_2::yahoo: ⚠️ Rate limited on attempt 2 for AAPL
WARN auto_analyser_2::yahoo: Retry attempt 3 for AAPL after 10s delay
WARN auto_analyser_2::yahoo: ⚠️ Rate limited on attempt 3 for AAPL
WARN auto_analyser_2::analysis: Failed to analyze AAPL: Rate limited by Yahoo Finance (429)
```

This shows that even with all fixes, Docker containers are **consistently rate limited** on every request.

## Conclusion

The technical implementation is correct, but **Yahoo Finance actively blocks Docker container traffic**. The only reliable solutions are:

1. Use a proxy service (most reliable)
2. Switch to alternative data APIs (most sustainable)
3. Dramatically increase delays to 30+ seconds (least efficient)
4. Run locally instead of in Docker (not production-ready)

**For your immediate use**: If you have a VPN or proxy, configure it in docker-compose.yml using the proxy environment variables.
