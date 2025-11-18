#!/bin/bash

# Database Restore Script
# Usage: ./scripts/database/restore.sh <backup_file> [database_name]

set -e

BACKUP_FILE="$1"
DATABASE_NAME="${2:-dca_auth}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Error: Backup file not specified"
  echo "Usage: ./scripts/database/restore.sh <backup_file> [database_name]"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Restoring database: $DATABASE_NAME"
echo "From backup: $BACKUP_FILE"
echo ""
read -p "This will overwrite the existing database. Continue? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Restore cancelled"
  exit 0
fi

# Decompress if needed
if [[ $BACKUP_FILE == *.gz ]]; then
  echo "Decompressing backup..."
  gunzip -k "$BACKUP_FILE"
  BACKUP_FILE="${BACKUP_FILE%.gz}"
fi

# Restore using Docker if container is running
if docker ps | grep -q dca_auth_postgres; then
  docker exec -i dca_auth_postgres psql -U postgres -d "$DATABASE_NAME" < "$BACKUP_FILE"
else
  # Use local psql if available
  psql -U postgres -d "$DATABASE_NAME" < "$BACKUP_FILE"
fi

echo "✅ Database restored successfully"

# Clean up decompressed file
if [[ $1 == *.gz ]]; then
  rm "$BACKUP_FILE"
fi
