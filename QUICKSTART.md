# 🚀 Quick Start Guide

## Choose Your Installation Method

### 🐳 **Option 1: Docker (Recommended - Easiest)**

**Prerequisites**: Docker Desktop installed

```bash
# Clone and start everything with one command
git clone <repository-url>
cd auto-analyser-2
docker-compose up -d

# Access the application
# Frontend: http://localhost
# Backend: http://localhost:3030/api
```

That's it! Skip to [Test It Out](#-test-it-out) below.

See [DOCKER.md](DOCKER.md) for detailed Docker documentation.

---

### 🛠️ **Option 2: Manual Installation**

**Prerequisites**:
- ✅ **Rust 1.70+** installed ([rustup.rs](https://rustup.rs/))
- ✅ **MongoDB** running locally or MongoDB Atlas account
- ✅ **Git** for version control

## Installation (5 minutes)

### Step 1: Setup MongoDB

**Option A: Local MongoDB (Recommended for Development)**
```bash
# macOS
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Verify MongoDB is running
mongosh --eval "db.version()"
```

**Option B: MongoDB Atlas (Cloud)**
1. Sign up at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Get your connection string (looks like: `mongodb+srv://username:password@cluster.mongodb.net/`)

### Step 2: Configure Environment

```bash
# Already created .env file - verify it exists
cat .env

# For MongoDB Atlas, update the .env file:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
```

### Step 3: Build & Run

```bash
# Build the project (already done)
cargo build --release

# Run the application
RUST_LOG=info cargo run --release
```

## 🎉 You're Running!

You should see:
```
🚀 Starting Auto Stock Analyser...
✅ Connected to MongoDB database: stock_analyzer
🌐 Server listening on http://127.0.0.1:3000
📡 WebSocket endpoint: ws://127.0.0.1:3000/ws
🔄 Analysis interval: 3600s (1h)
```

## Test It Out

### 1. Check API Health
```bash
curl http://localhost:3030/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "total_analyses": 0
}
```

### 2. View Analysis Progress
```bash
curl http://localhost:3030/api/progress
```

Expected response:
```json
{
  "total_stocks": 60,
  "analyzed": 15,
  "current_symbol": "AAPL",
  "cycle_start": "2025-11-06T...",
  "errors": 0,
  "completion_percentage": 25.0
}
```

### 3. Get All Analyzed Stocks
```bash
# Wait a few minutes for some stocks to be analyzed
curl http://localhost:3030/api/stocks | jq .
```

### 4. Filter Stocks by Criteria
```bash
# Find oversold stocks (RSI < 30)
curl -X POST http://localhost:3030/api/stocks/filter \
  -H "Content-Type: application/json" \
  -d '{"max_rsi": 30}' | jq .

# Find stocks in price range
curl -X POST http://localhost:3030/api/stocks/filter \
  -H "Content-Type: application/json" \
  -d '{"min_price": 100, "max_price": 200}' | jq .
```

### 5. Connect to WebSocket
```bash
# Using websocat (install: brew install websocat)
websocat ws://localhost:3000/ws

# Or use JavaScript in browser console:
# const ws = new WebSocket('ws://localhost:3000/ws');
# ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

## 📊 What's Happening?

The application is now:

1. **Analyzing 60 popular US stocks** every hour
2. **Calculating technical indicators**: RSI, SMA (20/50), MACD
3. **Storing results** in MongoDB for instant queries
4. **Caching data** for fast API responses
5. **Broadcasting progress** via WebSocket to all connected clients

## Understanding the Data

### RSI (Relative Strength Index)
- **< 30**: Oversold (potential buy signal)
- **30-70**: Normal range
- **> 70**: Overbought (potential sell signal)

### SMA (Simple Moving Average)
- **SMA 20**: Short-term trend (20 days)
- **SMA 50**: Long-term trend (50 days)
- Price above SMA = Bullish, below = Bearish

### MACD
- **Positive histogram**: Bullish momentum
- **Negative histogram**: Bearish momentum

## View in MongoDB

```bash
# Connect to MongoDB shell
mongosh

# Select database
use stock_analyzer

# View analyzed stocks
db.stock_analysis.find().pretty()

# Count total analyses
db.stock_analysis.countDocuments()

# Find oversold stocks
db.stock_analysis.find({ is_oversold: true }).pretty()

# Find stocks by price range
db.stock_analysis.find({ 
  price: { $gte: 100, $lte: 200 } 
}).pretty()
```

## Customization

### Change Analysis Interval
Edit `.env`:
```env
ANALYSIS_INTERVAL_SECS=1800  # 30 minutes instead of 1 hour
```

### Add More Stocks
Edit `src/analysis.rs`, line ~108, in `get_stock_symbols()`:
```rust
vec![
    "AAPL", "MSFT", "GOOGL", // ... existing symbols
    "COIN", "SQ", "SHOP",    // Add your symbols here
]
```

Then rebuild:
```bash
cargo build --release
```

### Change Cache Duration
Edit `.env`:
```env
CACHE_TTL_SECS=600  # 10 minutes instead of 5
```

## Common Issues

### "Failed to connect to MongoDB"
```bash
# Check if MongoDB is running
brew services list | grep mongodb

# Or for Atlas, verify connection string in .env
```

### "Port 3000 already in use"
```bash
# Change port in .env
SERVER_PORT=8080

# Or kill existing process
lsof -ti:3000 | xargs kill -9
```

### "Failed to fetch data for SYMBOL"
This is normal - Yahoo Finance occasionally rate limits or has missing data. The system will automatically skip failed symbols and continue.

## Next Steps

1. **✨ Build Frontend**: Create React UI to visualize the data
2. **📈 Add More Indicators**: Bollinger Bands, Volume Moving Average
3. **🔔 Setup Alerts**: Get notified when stocks hit criteria
4. **📊 Historical Analysis**: Store and analyze trends over time
5. **🚀 Deploy**: Host on AWS, Azure, or DigitalOcean

## Need Help?

- 📖 [Full Documentation](SETUP.md)
- 🔌 [API Reference](API.md)
- 💬 Open an issue on GitHub
- 📧 Check logs with `RUST_LOG=debug cargo run`

## Stop the Application

Press `Ctrl+C` in the terminal to gracefully shut down.

---

**Congratulations! Your stock analysis engine is running 24/7!** 🎉
