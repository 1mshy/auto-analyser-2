# API Documentation

## Base URL
```
http://localhost:3000
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
WS ws://localhost:3000/ws
```

**Message Format:**
The server sends progress updates every 2 seconds:

```json
{
  "total_stocks": 60,
  "analyzed": 45,
  "current_symbol": "MSFT",
  "cycle_start": "2025-11-06T10:00:00Z",
  "errors": 2
}
```

**JavaScript Example:**
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onmessage = (event) => {
  const progress = JSON.parse(event.data);
  console.log(`Progress: ${progress.analyzed}/${progress.total_stocks}`);
  console.log(`Current: ${progress.current_symbol}`);
};
```

---

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
