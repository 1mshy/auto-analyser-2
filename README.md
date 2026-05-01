# 🚀 Auto Stock Analyser

A high-performance, production-ready stock market analysis platform combining a **MongoDB database**, **Rust backend** with **React frontend**. Features 24/7 continuous analysis, real-time WebSocket updates, intelligent caching, and persistent data storage with mongodb.

## ✨ Key Features

### 🔥 **Performance & Reliability**
- **High-Speed Analysis**: Rust-powered backend for maximum performance
- **Intelligent Caching**: Multi-layer caching with Moka for sub-second response times
- **Rate Limiting**: Built-in API rate limiting to prevent throttling
- **Error Resilience**: Comprehensive error handling and recovery

### 📊 **Advanced Analytics**
- **Technical Indicators**: RSI, SMA (20/50), MACD with real-time calculation
- **Smart Filtering**: Advanced filters by market cap, price, volume, RSI, sectors
- **Opportunity Detection**: Automated identification of oversold/overbought stocks
- **US/CAD Coverage**: US NASDAQ screener as the primary universe with configurable Canadian Yahoo tickers (`CANADIAN_SYMBOLS`) added alongside it
- **Historical Analysis**: Full historical data processing and trend analysis

### 🌐 **Modern Frontend**
- **Real-time Updates**: WebSocket connections for live data streaming
- **Error Boundaries**: Graceful error handling and recovery
- **Responsive Design**: Mobile-first design with Chakra ui and Tailwind CSS
- **Interactive Charts**: RSI distribution and trend visualization

## 🔄 New Continuous Analysis Feature

**The server now runs 24/7, continuously analyzing all stocks!**

- ⚡ **24/7 Operation**: Server continuously scans and analyzes all available stocks
- 🔄 **Automatic Cycles**: Completes full market analysis every hour
- 🌐 **Multiple Frontends**: Multiple clients can connect and view live progress
- 📡 **WebSocket Updates**: Real-time progress updates via WebSocket connections
- 🎯 **Live Filtering**: Apply filters to view subsets of continuously updated results
- 📊 **Persistent Results**: Analysis results are stored and filtered server-side

## 🐳 Quick Start with Docker

The easiest way to run the entire application stack:

```bash
# Start all services (backend, frontend, MongoDB)
docker compose up -d

# Access the application
# Frontend: http://localhost
# Backend API: http://localhost:3333/api
# WebSocket: ws://localhost:3333/ws

# View logs
docker compose logs -f

# Stop services
docker compose down
```

See [DOCKER.md](DOCKER.md) for detailed Docker documentation.

### Using Makefile (Even Easier)

```bash
make up          # Start all services
make down        # Stop all services  
make logs        # View logs
make rebuild     # Rebuild and restart
make status      # Show service status
make help        # Show all commands
```

See [DOCKER_QUICK_REF.md](DOCKER_QUICK_REF.md) for more Docker commands.

## 📦 Manual Installation
