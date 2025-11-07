.PHONY: help docker-build docker-up docker-down docker-logs docker-clean docker-test docker-restart

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

docker-build: ## Build Docker images
	docker compose build

docker-up: ## Start all services in background
	docker compose up -d

docker-down: ## Stop all services
	docker compose down

docker-logs: ## Show logs from all services
	docker compose logs -f

docker-clean: ## Remove all containers, networks, and volumes
	docker compose down -v

docker-test: ## Run Docker test script
	./docker-test.sh

docker-restart: ## Restart all services
	docker compose restart

docker-rebuild: ## Rebuild and restart all services
	docker compose down
	docker compose build --no-cache
	docker compose up -d

docker-status: ## Show status of all services
	docker compose ps

# Development shortcuts
dev: ## Start services for development (MongoDB only)
	docker compose up -d mongodb

dev-logs: ## Show development logs
	docker compose logs -f mongodb

# Quick commands
up: docker-up ## Alias for docker-up
down: docker-down ## Alias for docker-down
logs: docker-logs ## Alias for docker-logs
clean: docker-clean ## Alias for docker-clean
rebuild: docker-rebuild ## Alias for docker-rebuild
