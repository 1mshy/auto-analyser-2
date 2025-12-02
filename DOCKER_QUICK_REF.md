# 🐳 Docker Quick Reference

## One-Line Commands

```bash
# Start everything
docker compose up -d

# Stop everything
docker compose down

# View logs
docker compose logs -f

# Restart
docker compose restart

# Clean everything
docker compose down -v
```

## Using Makefile (Easier)

```bash
make up          # Start all services
make down        # Stop all services
make logs        # View logs
make rebuild     # Rebuild and restart
make clean       # Remove everything
make status      # Show service status
make help        # Show all commands
```

## Service URLs

- **Frontend**: http://localhost
- **Backend API**: http://localhost:3030/api
- **MongoDB**: localhost:27017
- **WebSocket**: ws://localhost:3030/ws

## Common Tasks

### View Service Status
```bash
docker compose ps
```

### View Logs for Specific Service
```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mongodb
```

### Execute Commands in Container
```bash
# Access backend shell
docker compose exec backend sh

# Access MongoDB shell
docker compose exec mongodb mongosh stock_analyzer

# View MongoDB data
docker compose exec mongodb mongosh --eval "db.stock_analysis.find().pretty()"
```

### Rebuild After Code Changes
```bash
docker compose down
docker compose build
docker compose up -d
```

### Check Resource Usage
```bash
docker stats
```

## Troubleshooting

### Backend not starting
```bash
# Check logs
docker compose logs backend

# Restart backend
docker compose restart backend
```

### Port conflicts
```bash
# Check what's using port 80
lsof -i :80

# Check what's using port 3030
lsof -i :3030

# Or change ports in docker compose.yml
```

### Reset everything
```bash
# Remove all containers, networks, and volumes
docker compose down -v

# Start fresh
docker compose up -d
```

## Development Workflow

### Start only MongoDB for local development
```bash
docker compose up -d mongodb

# Then run backend locally
cargo run

# And frontend locally
cd frontend && npm start
```

### View database
```bash
# Access MongoDB shell
docker compose exec mongodb mongosh stock_analyzer

# Run queries
db.stock_analysis.find({is_oversold: true}).pretty()
db.stock_analysis.countDocuments()
```

## Production Deployment

```bash
# Use production configuration
docker compose -f docker compose.yml -f docker compose.prod.yml up -d

# Set environment variables
export MONGO_PASSWORD=your_secure_password

# Or use .env file
cp .env.docker .env
# Edit .env with production values
```

## Cleanup Commands

```bash
# Stop and remove containers
docker compose down

# Also remove volumes (deletes all data!)
docker compose down -v

# Remove all unused Docker resources
docker system prune -a
```

## Health Checks

```bash
# Check if services are healthy
docker compose ps

# Test backend API
curl http://localhost:3030/api/progress

# Test frontend
curl http://localhost

# Test MongoDB
docker compose exec mongodb mongosh --eval "db.runCommand('ping')"
```

## Useful Docker Commands

```bash
# View all containers
docker ps -a

# View all images
docker images

# View all volumes
docker volume ls

# View all networks
docker network ls

# Remove unused volumes
docker volume prune

# Remove unused images
docker image prune -a
```

## Environment Variables

Default values in `docker compose.yml`:
- `MONGODB_URI=mongodb://mongodb:27017`
- `SERVER_PORT=3030`
- `ANALYSIS_INTERVAL_SECS=3600`
- `CACHE_TTL_SECS=300`

Override with `.env` file or environment variables.

## Testing

```bash
# Run automated test
./docker-test.sh

# Or with make
make docker-test
```

## Links

- 📖 [Full Docker Documentation](DOCKER.md)
- 🔌 [API Reference](API.md)
- 🚀 [Quick Start](QUICKSTART.md)
