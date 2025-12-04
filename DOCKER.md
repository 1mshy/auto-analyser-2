# Docker Setup Guide

This guide explains how to run the Auto Stock Analyzer application using Docker Compose.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+

## Quick Start

### 1. Build and Start All Services

```bash
docker compose up -d
```

This command will:
- Build the Rust backend from source
- Build the React frontend and configure nginx
- Start MongoDB database
- Set up networking between all services

### 2. Access the Application

- **Frontend**: http://localhost
- **Backend API**: http://localhost:3333/api
- **MongoDB**: localhost:27017

### 3. View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mongodb
```

### 4. Stop Services

```bash
# Stop but keep data
docker compose stop

# Stop and remove containers (data persists in volumes)
docker compose down

# Stop and remove everything including data
docker compose down -v
```

## Docker Commands Reference

### Build Commands

```bash
# Build all services
docker compose build

# Build specific service
docker compose build backend
docker compose build frontend

# Force rebuild without cache
docker compose build --no-cache
```

### Start/Stop Commands

```bash
# Start services in foreground
docker compose up

# Start services in background
docker compose up -d

# Restart specific service
docker compose restart backend

# Stop all services
docker compose stop

# Stop and remove containers
docker compose down
```

### Management Commands

```bash
# Check service status
docker compose ps

# View real-time logs
docker compose logs -f

# Execute command in running container
docker compose exec backend sh
docker compose exec mongodb mongosh stock_analyzer

# View resource usage
docker stats
```

## Architecture

The Docker setup includes three services:

### Backend (Rust)
- **Image**: Built from multi-stage Dockerfile
- **Port**: 3333
- **Dependencies**: MongoDB
- **Health Check**: Polls `/api/progress` endpoint

### Frontend (React + Nginx)
- **Image**: Built from Node.js, served by nginx
- **Port**: 80
- **Proxies**: API requests to backend, WebSocket connections
- **Health Check**: Polls root endpoint

### MongoDB
- **Image**: mongo:7.0
- **Port**: 27017
- **Volumes**: Persistent data storage
- **Health Check**: MongoDB ping command

## Environment Variables

Default environment variables are set in `docker compose.yml`:

```yaml
MONGODB_URI=mongodb://mongodb:27017
DATABASE_NAME=stock_analyzer
SERVER_HOST=0.0.0.0
SERVER_PORT=3333
ANALYSIS_INTERVAL_SECS=3600
CACHE_TTL_SECS=300
```

To override, create a `.env` file in the project root:

```bash
cp .env.example .env
# Edit .env with your custom values
```

## Data Persistence

MongoDB data is stored in Docker volumes:
- `mongodb_data`: Database files
- `mongodb_config`: Configuration files

These volumes persist even when containers are removed. To reset data:

```bash
docker compose down -v
```

## Networking

All services communicate via the `stock_analyzer_network` bridge network:
- Frontend → Backend: `http://backend:3333`
- Backend → MongoDB: `mongodb://mongodb:27017`
- Host → Frontend: `http://localhost:80`

## Troubleshooting

### Backend fails to start
```bash
# Check logs
docker compose logs backend

# Ensure MongoDB is healthy
docker compose ps mongodb

# Restart backend
docker compose restart backend
```

### Frontend shows connection errors
```bash
# Verify backend is running
curl http://localhost:3333/api/progress

# Check nginx logs
docker compose logs frontend
```

### MongoDB connection issues
```bash
# Check MongoDB logs
docker compose logs mongodb

# Verify MongoDB is accessible
docker compose exec mongodb mongosh --eval "db.runCommand('ping')"
```

### Port conflicts
If ports 80, 3333, or 27017 are already in use, modify `docker compose.yml`:

```yaml
ports:
  - "8080:80"      # Frontend
  - "3031:3333"    # Backend
  - "27018:27017"  # MongoDB
```

## Production Considerations

For production deployment:

1. **Use environment-specific config**:
```bash
docker compose -f docker compose.yml -f docker compose.prod.yml up -d
```

2. **Enable TLS/SSL** for nginx (add certificates to frontend service)

3. **Set resource limits**:
```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

4. **Use secrets** instead of environment variables for sensitive data

5. **Enable MongoDB authentication**:
```yaml
mongodb:
  environment:
    - MONGO_INITDB_ROOT_USERNAME=admin
    - MONGO_INITDB_ROOT_PASSWORD=secure_password
```

## Development Workflow

For active development, you may prefer running services individually:

```bash
# Start only MongoDB
docker compose up -d mongodb

# Run backend locally with hot reload
cargo run

# Run frontend locally with hot reload
cd frontend && npm start
```

## Cleaning Up

```bash
# Remove stopped containers
docker compose rm

# Remove all containers, networks, and volumes
docker compose down -v

# Remove all unused Docker resources
docker system prune -a
```

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [MongoDB Docker Hub](https://hub.docker.com/_/mongo)
