# Setup & Installation Guide

## Prerequisites

- **Rust** (1.70+): Install from [rustup.rs](https://rustup.rs/)
- **MongoDB** (5.0+): [Installation Guide](https://www.mongodb.com/docs/manual/installation/)
- **Git**: For cloning the repository

## Installation Steps

### 1. Clone the Repository
```bash
git clone <repository-url>
cd auto-analyser-2
```

### 2. Setup MongoDB

#### Option A: Local MongoDB
```bash
# macOS (Homebrew)
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Linux (Ubuntu/Debian)
sudo apt-get install mongodb
sudo systemctl start mongodb

# Windows
# Download installer from mongodb.com and run it
```

#### Option B: MongoDB Atlas (Cloud)
1. Create free account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster
3. Get connection string
4. Update `.env` file with Atlas connection string

### 3. Configure Environment
```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings
nano .env
```

**Configuration Options:**
```env
# MongoDB connection
MONGODB_URI=mongodb://localhost:27017
DATABASE_NAME=stock_analyzer

# Server settings
SERVER_HOST=127.0.0.1
SERVER_PORT=3000

# Analysis settings
ANALYSIS_INTERVAL_SECS=3600  # 1 hour

# Cache settings
CACHE_TTL_SECS=300  # 5 minutes
```

### 4. Build and Run

#### Development Mode
```bash
# Build the project
cargo build

# Run with logging
RUST_LOG=info cargo run
```

#### Production Mode
```bash
# Build with optimizations
cargo build --release

# Run the optimized binary
./target/release/auto_analyser_2
```

### 5. Verify Installation

Open your browser and check:
- API Root: http://localhost:3333/
- Health Check: http://localhost:3333/health
- Progress: http://localhost:3333/api/progress

## Testing the Setup

### Check MongoDB Connection
```bash
# Connect to MongoDB shell
mongosh

# List databases
show dbs

# Use the stock analyzer database
use stock_analyzer

# Check collections
show collections
```

### Test API Endpoints
```bash
# Health check
curl http://localhost:3333/health

# Get progress
curl http://localhost:3333/api/progress

# Get all stocks
curl http://localhost:3333/api/stocks

# Filter stocks
curl -X POST http://localhost:3333/api/stocks/filter \
  -H "Content-Type: application/json" \
  -d '{"min_price": 100, "max_price": 200}'
```

### Test WebSocket Connection
```javascript
// In browser console or Node.js
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onmessage = (event) => console.log(JSON.parse(event.data));
```

## Troubleshooting

### MongoDB Connection Issues
```
Error: Failed to connect to MongoDB
```
**Solution:**
- Check if MongoDB is running: `mongosh` or `brew services list`
- Verify `MONGODB_URI` in `.env` file
- Check firewall settings

### Port Already in Use
```
Error: Address already in use (os error 48)
```
**Solution:**
- Change `SERVER_PORT` in `.env` file
- Or kill process using port 3000: `lsof -ti:3000 | xargs kill -9`

### Yahoo Finance Rate Limiting
```
Error: Failed to fetch data for SYMBOL
```
**Solution:**
- The 500ms delay between requests should prevent this
- If it persists, increase delay in `src/analysis.rs`
- Wait a few minutes before retrying

### Build Errors
```
Error: could not compile `auto_analyser_2`
```
**Solution:**
- Update Rust: `rustup update`
- Clean build: `cargo clean && cargo build`
- Check Cargo.toml for dependency issues

## Performance Tuning

### Analysis Speed
Adjust in `.env`:
```env
ANALYSIS_INTERVAL_SECS=1800  # 30 minutes (faster)
```

### Cache Settings
```env
CACHE_TTL_SECS=600  # 10 minutes (longer cache)
```

### Database Optimization
```javascript
// In MongoDB shell, create additional indexes
use stock_analyzer
db.stock_analysis.createIndex({ "rsi": 1 })
db.stock_analysis.createIndex({ "price": 1 })
db.stock_analysis.createIndex({ "volume": -1 })
```

## Next Steps

1. **Frontend Development**: Build React frontend (see README.md)
2. **Add More Stocks**: Extend symbol list in `src/analysis.rs`
3. **Deploy to Production**: See deployment guide
4. **Add Authentication**: Implement API keys or JWT
5. **Monitoring**: Setup logging and metrics

## Development Tips

### Hot Reload with cargo-watch
```bash
cargo install cargo-watch
cargo watch -x run
```

### Database GUI
- **MongoDB Compass**: Official GUI tool
- **Studio 3T**: Advanced MongoDB GUI
- **Robo 3T**: Lightweight GUI

### Logging Levels
```bash
# Debug level (verbose)
RUST_LOG=debug cargo run

# Info level (default)
RUST_LOG=info cargo run

# Warning level only
RUST_LOG=warn cargo run
```

## Support

For issues or questions:
1. Check the [API Documentation](API.md)
2. Review error logs
3. Open an issue on GitHub
4. Check MongoDB and Rust documentation
