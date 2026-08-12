# 🐳 Docker Setup - Complete File Structure

## All Created Files

```
auto-analyser-2/
│
├── 🐳 Docker Configuration
│   ├── Dockerfile                      # Backend (Rust) image
│   ├── docker compose.yml              # Main orchestration file
│   ├── docker compose.prod.yml         # Production overrides
│   ├── .dockerignore                   # Backend build exclusions
│   └── .env.docker                     # Environment template
│
├── 🎨 Frontend Docker
│   └── frontend/
│       ├── Dockerfile                  # Frontend (React + nginx) image
│       ├── nginx.conf                  # Nginx configuration
│       └── .dockerignore               # Frontend build exclusions
│
├── 🛠️ Automation & Tools
│   ├── Makefile                        # Convenient shortcuts
│   ├── docker-test.sh                  # Automated testing script
│   └── .github/workflows/
│       └── docker.yml                  # CI/CD workflow
│
└── 📚 Documentation
    ├── DOCKER.md                       # Complete Docker guide
    ├── DOCKER_QUICK_REF.md             # Quick reference card
    ├── DOCKER_IMPLEMENTATION.md        # Implementation summary
    ├── README.md                       # Updated with Docker section
    └── QUICKSTART.md                   # Updated with Docker option

```

## Quick Start Commands

### Option 1: Docker Compose (Easiest)
```bash
docker compose up -d
```

### Option 2: Makefile (Even Easier)
```bash
make up
```

### Option 3: Test Script (Automated)
```bash
./docker-test.sh
```

## What Gets Deployed

```
┌─────────────────────────────────────────┐
│         🐳 Docker Environment           │
├─────────────────────────────────────────┤
│                                         │
│  📦 Container: stock_analyzer_frontend  │
│     ├── Image: nginx:alpine            │
│     ├── Port: 80                       │
│     └── Serves: React build            │
│                ▼                        │
│  📦 Container: stock_analyzer_backend   │
│     ├── Image: debian:bookworm-slim    │
│     ├── Port: 3333                     │
│     └── Runs: Rust binary              │
│                ▼                        │
│  📦 Container: stock_analyzer_db        │
│     ├── Image: mongo:7.0               │
│     ├── Port: 27017                    │
│     └── Stores: Stock analysis data    │
│                                         │
└─────────────────────────────────────────┘
```

## Access Points

| Service   | URL                              | Purpose                    |
|-----------|----------------------------------|----------------------------|
| Frontend  | http://localhost                 | Web UI                     |
| Backend   | http://localhost:3333/api        | REST API                   |
| WebSocket | ws://localhost:3333/ws           | Real-time updates          |
| MongoDB   | mongodb://localhost:27017        | Database (internal)        |

## Commands Reference

### Start & Stop
```bash
docker compose up -d        # Start all services
docker compose down         # Stop all services
docker compose restart      # Restart services
```

### View & Debug
```bash
docker compose logs -f      # View all logs
docker compose ps           # Service status
docker stats                # Resource usage
```

### Management
```bash
docker compose build        # Rebuild images
docker compose down -v      # Remove everything
make help                   # Show all commands
```

## File Purposes

### Core Docker Files

| File                      | Purpose                                      |
|---------------------------|----------------------------------------------|
| `Dockerfile`              | Builds optimized Rust backend image          |
| `frontend/Dockerfile`     | Builds React app + nginx server              |
| `docker compose.yml`      | Orchestrates all 3 services                  |
| `docker compose.prod.yml` | Production configuration overrides           |

### Configuration

| File                      | Purpose                                      |
|---------------------------|----------------------------------------------|
| `.dockerignore`           | Excludes files from backend build            |
| `frontend/.dockerignore`  | Excludes files from frontend build           |
| `frontend/nginx.conf`     | Nginx web server + proxy configuration       |
| `.env.docker`             | Environment variable templates               |

### Automation

| File                      | Purpose                                      |
|---------------------------|----------------------------------------------|
| `Makefile`                | Convenient command shortcuts                 |
| `docker-test.sh`          | Automated testing and validation             |
| `.github/workflows/docker.yml` | CI/CD pipeline for GitHub Actions      |

### Documentation

| File                         | Purpose                                   |
|------------------------------|-------------------------------------------|
| `DOCKER.md`                  | Complete Docker usage guide               |
| `DOCKER_QUICK_REF.md`        | Quick reference for common commands       |
| `DOCKER_IMPLEMENTATION.md`   | Implementation details and summary        |

## Multi-Stage Builds

### Backend Build Process
```
Stage 1: Builder (rust:1.75)
├── Copy source code
├── Run cargo build --release
└── Output: /app/target/release/auto_analyser_2

Stage 2: Runtime (debian:bookworm-slim)
├── Copy binary from Stage 1
├── Install runtime deps only
└── Result: ~50MB image
```

### Frontend Build Process
```
Stage 1: Builder (node:22-alpine)
├── Copy source code
├── npm ci && npm run build
└── Output: /app/build/*

Stage 2: Server (nginx:alpine)
├── Copy build files from Stage 1
├── Copy nginx.conf
└── Result: ~25MB image
```

## Environment Variables

Set in `docker compose.yml` or override with `.env` file:

```env
# Database
MONGODB_URI=mongodb://mongodb:27017
DATABASE_NAME=stock_analyzer

# Server
SERVER_HOST=0.0.0.0
SERVER_PORT=3333

# Analysis
ANALYSIS_INTERVAL_SECS=3600
CACHE_TTL_SECS=300

# Logging
RUST_LOG=info
```

## Health Checks

All services include health checks:

- **MongoDB**: Pings database every 10s
- **Backend**: Polls `/api/progress` every 30s
- **Frontend**: Checks nginx every 30s

Services auto-restart on failure.

## Data Persistence

MongoDB data stored in Docker volumes:
```
docker volume ls
DRIVER    VOLUME NAME
local     auto-analyser-2_mongodb_data
local     auto-analyser-2_mongodb_config
```

Data persists across container restarts.

## Network Topology

```
Internet
   │
   ▼
┌──────────────────────────────────────┐
│  Host Machine                        │
│  ├── Port 80 → Frontend Container   │
│  ├── Port 3333 → Backend Container   │
│  └── Port 27017 → MongoDB Container  │
└──────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────┐
│  Docker Bridge Network               │
│  (stock_analyzer_network)            │
│                                      │
│  Frontend ←→ Backend ←→ MongoDB      │
└──────────────────────────────────────┘
```

## CI/CD Integration

GitHub Actions workflow (`.github/workflows/docker.yml`):

1. ✅ Checkout code
2. ✅ Setup Docker Buildx
3. ✅ Build backend image
4. ✅ Build frontend image
5. ✅ Start services with docker compose
6. ✅ Test health endpoints
7. ✅ Cleanup

Runs on every push and PR to main/develop branches.

## Resource Requirements

### Minimum
- CPU: 2 cores
- RAM: 2GB
- Disk: 2GB

### Recommended
- CPU: 4 cores
- RAM: 4GB
- Disk: 5GB

### Production Limits (docker compose.prod.yml)
- Backend: 2 CPU, 2GB RAM
- Frontend: 1 CPU, 512MB RAM
- MongoDB: 2 CPU, 4GB RAM

## Testing Checklist

```bash
# 1. Build images
docker compose build

# 2. Start services
docker compose up -d

# 3. Check status
docker compose ps

# 4. Test endpoints
curl http://localhost:3333/api/progress
curl http://localhost

# 5. View logs
docker compose logs

# 6. Check health
docker compose exec backend curl -f http://localhost:3333/api/progress
docker compose exec mongodb mongosh --eval "db.runCommand('ping')"

# 7. Cleanup
docker compose down -v
```

Or simply run: `./docker-test.sh`

## Troubleshooting Quick Guide

| Issue                  | Command                               |
|------------------------|---------------------------------------|
| View logs              | `docker compose logs -f <service>`    |
| Restart service        | `docker compose restart <service>`    |
| Rebuild image          | `docker compose build --no-cache`     |
| Reset everything       | `docker compose down -v`              |
| Check ports            | `lsof -i :80,3333,27017`             |
| Test endpoint          | `curl http://localhost:3333/api/progress` |

## Next Steps

1. **Try it**: `docker compose up -d`
2. **Access**: http://localhost
3. **Monitor**: `docker compose logs -f`
4. **Deploy**: Use `docker compose.prod.yml` for production

## Documentation Links

- 📖 [Full Docker Guide](DOCKER.md)
- 🚀 [Quick Reference](DOCKER_QUICK_REF.md)
- 📝 [Implementation Details](DOCKER_IMPLEMENTATION.md)
- 🎯 [Quick Start](QUICKSTART.md)

---

**Status**: ✅ Complete and tested  
**Version**: 1.0.0  
**Date**: November 6, 2025
