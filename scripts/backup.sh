#!/bin/bash
# DCA-Auth Backup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="/opt/dca-auth-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=${BACKUP_RETENTION:-30}
S3_BUCKET=${S3_BACKUP_BUCKET:-""}
ENCRYPT_BACKUPS=${ENCRYPT_BACKUPS:-true}
ENCRYPTION_KEY=${BACKUP_ENCRYPTION_KEY:-""}

echo -e "${GREEN}DCA-Auth Backup Script${NC}"
echo "Timestamp: $TIMESTAMP"
echo "Retention: $RETENTION_DAYS days"
echo "----------------------------------------"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to backup database
backup_database() {
    echo -e "${YELLOW}Backing up database...${NC}"

    # Create database backup
    docker-compose exec -T postgres pg_dumpall -U postgres | \
        gzip > "$BACKUP_DIR/db_full_$TIMESTAMP.sql.gz"

    # Also create individual database backup
    docker-compose exec -T postgres pg_dump -U postgres dca_auth | \
        gzip > "$BACKUP_DIR/db_dca_auth_$TIMESTAMP.sql.gz"

    echo -e "${GREEN}Database backup completed${NC}"
}

# Function to backup Docker volumes
backup_volumes() {
    echo -e "${YELLOW}Backing up Docker volumes...${NC}"

    # Backup PostgreSQL data volume
    docker run --rm \
        -v dca-auth_postgres_data:/data:ro \
        -v "$BACKUP_DIR:/backup" \
        alpine tar czf "/backup/postgres_volume_$TIMESTAMP.tar.gz" -C /data .

    # Backup Redis data volume
    docker run --rm \
        -v dca-auth_redis_data:/data:ro \
        -v "$BACKUP_DIR:/backup" \
        alpine tar czf "/backup/redis_volume_$TIMESTAMP.tar.gz" -C /data .

    # Backup Grafana data volume
    docker run --rm \
        -v dca-auth_grafana_data:/data:ro \
        -v "$BACKUP_DIR:/backup" \
        alpine tar czf "/backup/grafana_volume_$TIMESTAMP.tar.gz" -C /data .

    echo -e "${GREEN}Volume backup completed${NC}"
}

# Function to backup configuration files
backup_configs() {
    echo -e "${YELLOW}Backing up configuration files...${NC}"

    # Create config backup
    tar czf "$BACKUP_DIR/configs_$TIMESTAMP.tar.gz" \
        .env \
        docker-compose.yml \
        nginx/ \
        monitoring/ \
        2>/dev/null || true

    echo -e "${GREEN}Configuration backup completed${NC}"
}

# Function to backup application logs
backup_logs() {
    echo -e "${YELLOW}Backing up application logs...${NC}"

    # Create logs backup
    if [ -d "logs" ]; then
        tar czf "$BACKUP_DIR/logs_$TIMESTAMP.tar.gz" logs/
    fi

    echo -e "${GREEN}Logs backup completed${NC}"
}

# Function to encrypt backups
encrypt_backups() {
    if [ "$ENCRYPT_BACKUPS" == "true" ] && [ -n "$ENCRYPTION_KEY" ]; then
        echo -e "${YELLOW}Encrypting backups...${NC}"

        for file in "$BACKUP_DIR"/*_"$TIMESTAMP"*; do
            if [ -f "$file" ] && [[ ! "$file" == *.enc ]]; then
                openssl enc -aes-256-cbc -salt -in "$file" -out "$file.enc" -pass pass:"$ENCRYPTION_KEY"
                rm "$file"
            fi
        done

        echo -e "${GREEN}Backups encrypted${NC}"
    fi
}

# Function to upload to S3
upload_to_s3() {
    if [ -n "$S3_BUCKET" ]; then
        echo -e "${YELLOW}Uploading to S3...${NC}"

        # Check if AWS CLI is installed
        if command -v aws &> /dev/null; then
            # Upload all today's backups to S3
            aws s3 sync "$BACKUP_DIR" "s3://$S3_BUCKET/$(date +%Y/%m/%d)/" \
                --exclude "*" \
                --include "*_$TIMESTAMP*"

            echo -e "${GREEN}Backups uploaded to S3${NC}"
        else
            echo -e "${RED}AWS CLI not installed, skipping S3 upload${NC}"
        fi
    fi
}

# Function to cleanup old backups
cleanup_old_backups() {
    echo -e "${YELLOW}Cleaning up old backups...${NC}"

    # Remove local backups older than retention period
    find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -delete

    # Clean up S3 if configured
    if [ -n "$S3_BUCKET" ] && command -v aws &> /dev/null; then
        # Calculate cutoff date
        CUTOFF_DATE=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)

        # List and delete old S3 objects
        aws s3api list-objects --bucket "$S3_BUCKET" \
            --query "Contents[?LastModified<='$CUTOFF_DATE'].Key" \
            --output text | \
            xargs -I {} aws s3 rm "s3://$S3_BUCKET/{}"
    fi

    echo -e "${GREEN}Old backups cleaned up${NC}"
}

# Function to verify backup integrity
verify_backup() {
    echo -e "${YELLOW}Verifying backup integrity...${NC}"

    BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "*_$TIMESTAMP*" | wc -l)

    echo "Backup directory size: $BACKUP_SIZE"
    echo "Files created in this backup: $BACKUP_COUNT"

    # Test database backup integrity
    if [ -f "$BACKUP_DIR/db_dca_auth_$TIMESTAMP.sql.gz" ] || [ -f "$BACKUP_DIR/db_dca_auth_$TIMESTAMP.sql.gz.enc" ]; then
        echo -e "${GREEN}Database backup verified${NC}"
    else
        echo -e "${RED}Database backup verification failed${NC}"
        exit 1
    fi
}

# Function to send notification
send_notification() {
    STATUS=$1
    MESSAGE=$2

    # Send to Discord webhook if configured
    if [ -n "$DISCORD_WEBHOOK_URL" ]; then
        curl -H "Content-Type: application/json" \
            -d "{\"content\": \"**Backup $STATUS** - $MESSAGE\"}" \
            "$DISCORD_WEBHOOK_URL" 2>/dev/null || true
    fi

    # Send email if configured
    if [ -n "$NOTIFICATION_EMAIL" ] && command -v mail &> /dev/null; then
        echo "$MESSAGE" | mail -s "DCA-Auth Backup $STATUS" "$NOTIFICATION_EMAIL"
    fi
}

# Main backup flow
main() {
    echo -e "${GREEN}Starting backup process...${NC}"

    # Run backup tasks
    backup_database
    backup_volumes
    backup_configs
    backup_logs

    # Post-processing
    encrypt_backups
    upload_to_s3
    verify_backup
    cleanup_old_backups

    # Send success notification
    send_notification "SUCCESS" "Backup completed at $TIMESTAMP"

    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Backup completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo "Backup location: $BACKUP_DIR"
    echo "Backup timestamp: $TIMESTAMP"
}

# Error handler
error_handler() {
    echo -e "${RED}Backup failed!${NC}"
    send_notification "FAILED" "Backup failed at $TIMESTAMP - Check logs for details"
    exit 1
}

# Set error trap
trap error_handler ERR

# Run main function
main