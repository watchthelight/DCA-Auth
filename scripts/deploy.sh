#!/bin/bash
# DCA-Auth Deployment Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-production}
DEPLOY_PATH="/opt/dca-auth"
BACKUP_PATH="/opt/dca-auth-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo -e "${GREEN}DCA-Auth Deployment Script${NC}"
echo "Environment: $ENVIRONMENT"
echo "Timestamp: $TIMESTAMP"
echo "----------------------------------------"

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker is not installed${NC}"
        exit 1
    fi

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}Docker Compose is not installed${NC}"
        exit 1
    fi

    # Check Git
    if ! command -v git &> /dev/null; then
        echo -e "${RED}Git is not installed${NC}"
        exit 1
    fi

    echo -e "${GREEN}Prerequisites check passed${NC}"
}

# Function to backup existing deployment
backup_deployment() {
    echo -e "${YELLOW}Creating backup...${NC}"

    if [ -d "$DEPLOY_PATH" ]; then
        mkdir -p "$BACKUP_PATH"

        # Backup database
        docker-compose -f "$DEPLOY_PATH/docker-compose.yml" exec -T postgres \
            pg_dump -U postgres dca_auth > "$BACKUP_PATH/db_backup_$TIMESTAMP.sql"

        # Backup environment files
        cp "$DEPLOY_PATH/.env" "$BACKUP_PATH/.env.$TIMESTAMP" 2>/dev/null || true

        # Backup volumes
        docker run --rm \
            -v dca-auth_postgres_data:/data \
            -v "$BACKUP_PATH:/backup" \
            alpine tar czf "/backup/postgres_data_$TIMESTAMP.tar.gz" -C /data .

        echo -e "${GREEN}Backup created at $BACKUP_PATH${NC}"
    fi
}

# Function to pull latest code
pull_latest() {
    echo -e "${YELLOW}Pulling latest code...${NC}"

    cd "$DEPLOY_PATH"
    git fetch origin
    git checkout main
    git pull origin main

    echo -e "${GREEN}Code updated${NC}"
}

# Function to build Docker images
build_images() {
    echo -e "${YELLOW}Building Docker images...${NC}"

    cd "$DEPLOY_PATH"

    # Build images based on environment
    if [ "$ENVIRONMENT" == "production" ]; then
        docker-compose -f docker-compose.yml build --no-cache
    else
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml build
    fi

    echo -e "${GREEN}Docker images built${NC}"
}

# Function to run database migrations
run_migrations() {
    echo -e "${YELLOW}Running database migrations...${NC}"

    cd "$DEPLOY_PATH"

    # Run Prisma migrations
    docker-compose run --rm api npx prisma migrate deploy

    echo -e "${GREEN}Database migrations completed${NC}"
}

# Function to deploy services
deploy_services() {
    echo -e "${YELLOW}Deploying services...${NC}"

    cd "$DEPLOY_PATH"

    # Stop existing services
    docker-compose down

    # Start services based on environment
    if [ "$ENVIRONMENT" == "production" ]; then
        docker-compose -f docker-compose.yml up -d
    else
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
    fi

    # Wait for services to be healthy
    echo "Waiting for services to be healthy..."
    sleep 10

    # Check service health
    docker-compose ps

    echo -e "${GREEN}Services deployed${NC}"
}

# Function to run health checks
health_check() {
    echo -e "${YELLOW}Running health checks...${NC}"

    # Check API health
    if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}API is healthy${NC}"
    else
        echo -e "${RED}API health check failed${NC}"
        exit 1
    fi

    # Check Dashboard health
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        echo -e "${GREEN}Dashboard is healthy${NC}"
    else
        echo -e "${RED}Dashboard health check failed${NC}"
        exit 1
    fi

    echo -e "${GREEN}All health checks passed${NC}"
}

# Function to clean up old resources
cleanup() {
    echo -e "${YELLOW}Cleaning up old resources...${NC}"

    # Remove unused Docker images
    docker image prune -f

    # Remove old backups (keep last 30 days)
    find "$BACKUP_PATH" -type f -mtime +30 -delete

    echo -e "${GREEN}Cleanup completed${NC}"
}

# Main deployment flow
main() {
    echo -e "${GREEN}Starting deployment...${NC}"

    check_prerequisites
    backup_deployment
    pull_latest
    build_images
    run_migrations
    deploy_services
    health_check
    cleanup

    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Deployment completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Services Status:"
    docker-compose ps
    echo ""
    echo "Access URLs:"
    echo "- Dashboard: http://localhost:3000"
    echo "- API: http://localhost:3001"
    echo "- Prometheus: http://localhost:9090"
    echo "- Grafana: http://localhost:3002"
}

# Run main function
main