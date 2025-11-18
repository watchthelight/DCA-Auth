#!/bin/bash

# Database Backup Script
# Usage: ./scripts/database/backup.sh [database_name]

set -e

DATABASE_NAME="${1:-dca_auth}"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DATABASE_NAME}_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Creating backup of database: $DATABASE_NAME"
echo "Backup file: $BACKUP_FILE"

# Create backup using Docker if container is running
if docker ps | grep -q dca_auth_postgres; then
  docker exec dca_auth_postgres pg_dump -U postgres "$DATABASE_NAME" > "$BACKUP_FILE"
else
  # Use local pg_dump if available
  pg_dump -U postgres "$DATABASE_NAME" > "$BACKUP_FILE"
fi

# Compress the backup
gzip "$BACKUP_FILE"

echo "✅ Backup created successfully: ${BACKUP_FILE}.gz"
echo "Backup size: $(du -h ${BACKUP_FILE}.gz | cut -f1)"

# Optional: Keep only the last 10 backups
ls -t "${BACKUP_DIR}"/*.sql.gz | tail -n +11 | xargs -r rm

echo "✅ Cleanup completed. Keeping last 10 backups."
