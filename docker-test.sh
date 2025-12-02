#!/bin/bash

# Docker Compose Test Script
# This script tests the Docker Compose setup

set -e

echo "🐳 Starting Docker Compose test..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker Desktop."
    exit 1
fi
print_status "Docker is running"

# Check if docker compose is available
if ! command -v docker compose &> /dev/null; then
    print_error "docker compose is not installed"
    exit 1
fi
print_status "docker compose is available"

# Stop any existing containers
echo ""
echo "🧹 Cleaning up existing containers..."
docker compose down -v > /dev/null 2>&1 || true
print_status "Cleaned up existing containers"

# Build the images
echo ""
echo "🔨 Building Docker images..."
if docker compose build --no-cache; then
    print_status "Images built successfully"
else
    print_error "Failed to build images"
    exit 1
fi

# Start the services
echo ""
echo "🚀 Starting services..."
if docker compose up -d; then
    print_status "Services started"
else
    print_error "Failed to start services"
    docker compose logs
    exit 1
fi

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check MongoDB
echo ""
echo "Testing MongoDB..."
if docker compose exec -T mongodb mongosh --eval "db.runCommand('ping')" > /dev/null 2>&1; then
    print_status "MongoDB is healthy"
else
    print_warning "MongoDB might not be ready yet"
fi

# Check Backend
echo ""
echo "Testing Backend API..."
MAX_RETRIES=12
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:3030/api/progress > /dev/null 2>&1; then
        print_status "Backend API is responding"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
            print_error "Backend API is not responding after 60 seconds"
            echo ""
            echo "Backend logs:"
            docker compose logs backend
            exit 1
        fi
        echo "   Waiting for backend... ($RETRY_COUNT/$MAX_RETRIES)"
        sleep 5
    fi
done

# Check Frontend
echo ""
echo "Testing Frontend..."
if curl -s http://localhost > /dev/null 2>&1; then
    print_status "Frontend is serving content"
else
    print_warning "Frontend might not be ready yet"
fi

# Show service status
echo ""
echo "📊 Service Status:"
docker compose ps

# Show logs
echo ""
echo "📝 Recent logs:"
docker compose logs --tail=20

echo ""
echo "✅ Docker Compose setup is working!"
echo ""
echo "Access the application at:"
echo "  Frontend: http://localhost"
echo "  Backend:  http://localhost:3030/api"
echo ""
echo "To view logs: docker compose logs -f"
echo "To stop:      docker compose down"
