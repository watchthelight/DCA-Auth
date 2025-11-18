# DCA-Auth Deployment Guide

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Docker Deployment](#docker-deployment)
- [Manual Deployment](#manual-deployment)
- [Configuration](#configuration)
- [SSL/TLS Setup](#ssltls-setup)
- [Database Migration](#database-migration)
- [Monitoring](#monitoring)
- [Backup and Recovery](#backup-and-recovery)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- **CPU**: Minimum 2 cores, recommended 4 cores
- **RAM**: Minimum 4GB, recommended 8GB
- **Storage**: Minimum 20GB free space
- **Network**: Open ports 80, 443, 3000, 3001

### Software Requirements
- Docker 20.10+
- Docker Compose 2.0+
- Node.js 20+ (for manual deployment)
- PostgreSQL 16+
- Redis 7+
- Nginx 1.20+
- Git 2.30+

## Environment Setup

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/dca-auth.git
cd dca-auth
```

### 2. Create Environment File
```bash
cp .env.example .env
nano .env
```

### 3. Generate Secrets
```bash
# Generate secure random strings
openssl rand -hex 32  # For JWT_ACCESS_SECRET
openssl rand -hex 32  # For JWT_REFRESH_SECRET
openssl rand -hex 32  # For NEXTAUTH_SECRET
openssl rand -hex 32  # For SESSION_SECRET
```

### 4. Configure Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Copy the Client ID and Client Secret
4. Add OAuth2 redirect URI: `https://dashboard.yourdomain.com/api/auth/callback/discord`
5. Create a bot and copy the bot token

## Docker Deployment

### Quick Start
```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Deployment
```bash
# Use production compose file
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Scale services
docker-compose up -d --scale api=3

# Update services with zero downtime
docker-compose up -d --no-deps --build api
```

### Individual Service Commands
```bash
# Rebuild specific service
docker-compose build api

# Restart specific service
docker-compose restart bot

# View service logs
docker-compose logs -f dashboard

# Execute commands in container
docker-compose exec api sh
```

## Manual Deployment

### 1. Install Dependencies
```bash
# Install pnpm
npm install -g pnpm

# Install project dependencies
pnpm install
```

### 2. Build Applications
```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @dca-auth/api build
```

### 3. Database Setup
```bash
# Run migrations
cd packages/shared
npx prisma migrate deploy

# Seed database (optional)
npx prisma db seed
```

### 4. Start Services
```bash
# Start API server
cd packages/api
pnpm start

# Start Discord bot
cd packages/bot
pnpm start

# Start dashboard
cd packages/dashboard
pnpm start
```

### 5. Process Management (PM2)
```bash
# Install PM2
npm install -g pm2

# Start services with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup
```

## Configuration

### Essential Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/dca_auth

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=yourpassword

# Discord
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token

# Security
JWT_ACCESS_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
NEXTAUTH_SECRET=your_nextauth_secret

# URLs
API_BASE_URL=https://api.yourdomain.com
DASHBOARD_URL=https://dashboard.yourdomain.com
```

### Feature Flags
```env
FEATURE_DISCORD_AUTH=true
FEATURE_EMAIL_VERIFICATION=true
FEATURE_TWO_FACTOR_AUTH=true
FEATURE_LICENSE_TRANSFER=true
```

## SSL/TLS Setup

### Using Let's Encrypt
```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com -d dashboard.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Using Custom Certificates
```bash
# Place certificates in nginx/ssl/
cp /path/to/cert.pem nginx/ssl/fullchain.pem
cp /path/to/key.pem nginx/ssl/privkey.pem

# Restart Nginx
docker-compose restart nginx
```

## Database Migration

### Run Migrations
```bash
# Development
npx prisma migrate dev

# Production
npx prisma migrate deploy

# Reset database (CAUTION: Data loss!)
npx prisma migrate reset
```

### Backup Before Migration
```bash
# Create backup
./scripts/backup.sh

# Run migration
docker-compose exec api npx prisma migrate deploy

# Verify migration
docker-compose exec api npx prisma migrate status
```

## Monitoring

### Access Monitoring Tools
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3002
  - Default login: admin/admin
- Health Check: http://localhost:3001/api/health

### Configure Alerts
Edit `monitoring/alerts.yml` to customize alert rules.

### View Metrics
```bash
# API metrics
curl http://localhost:3001/metrics

# System metrics
curl http://localhost:9100/metrics
```

## Backup and Recovery

### Automated Backups
```bash
# Configure cron job
crontab -e

# Add daily backup at 2 AM
0 2 * * * /opt/dca-auth/scripts/backup.sh
```

### Manual Backup
```bash
./scripts/backup.sh
```

### Restore from Backup
```bash
# Stop services
docker-compose down

# Restore database
gunzip < backups/db_full_20240101_020000.sql.gz | \
  docker-compose exec -T postgres psql -U postgres

# Restore volumes
docker run --rm \
  -v dca-auth_postgres_data:/data \
  -v ./backups:/backup \
  alpine tar xzf /backup/postgres_volume_20240101_020000.tar.gz -C /data

# Start services
docker-compose up -d
```

## Troubleshooting

### Common Issues

#### Database Connection Failed
```bash
# Check PostgreSQL status
docker-compose ps postgres
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U postgres -c "SELECT 1"
```

#### Discord Bot Not Connecting
```bash
# Check bot logs
docker-compose logs bot

# Verify token
echo $DISCORD_BOT_TOKEN

# Test bot permissions
# Ensure bot has necessary intents enabled in Discord portal
```

#### High Memory Usage
```bash
# Check memory usage
docker stats

# Limit container memory
docker-compose up -d --memory="1g" api
```

#### SSL Certificate Issues
```bash
# Test SSL
openssl s_client -connect yourdomain.com:443

# Renew certificate
sudo certbot renew --force-renewal
```

### Debug Mode
```bash
# Enable debug logging
export LOG_LEVEL=debug
export NODE_ENV=development

# Restart services
docker-compose restart
```

### Health Checks
```bash
# Check all services
./scripts/health-check.sh

# Manual health checks
curl http://localhost:3001/api/health
curl http://localhost:3000/api/health/ready
```

## Performance Tuning

### PostgreSQL Optimization
```sql
-- Edit postgresql.conf
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
```

### Redis Optimization
```conf
# Edit redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

### Node.js Optimization
```bash
# Set Node.js memory limit
NODE_OPTIONS="--max-old-space-size=2048"

# Enable cluster mode
PM2_INSTANCES=4
```

## Security Hardening

### Firewall Configuration
```bash
# UFW setup
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Fail2ban Setup
```bash
# Install fail2ban
sudo apt-get install fail2ban

# Configure for DCA-Auth
sudo cp fail2ban/jail.local /etc/fail2ban/
sudo systemctl restart fail2ban
```

### Security Headers
Already configured in Nginx. Verify at https://securityheaders.com

## Scaling

### Horizontal Scaling
```bash
# Scale API instances
docker-compose up -d --scale api=3

# Add load balancer configuration
# Edit nginx/sites/default.conf upstream section
```

### Database Replication
```bash
# Configure PostgreSQL streaming replication
# See PostgreSQL documentation for detailed setup
```

### Redis Cluster
```bash
# Configure Redis cluster mode
# See Redis documentation for cluster setup
```

## Maintenance

### Regular Tasks
- **Daily**: Check logs, monitor metrics
- **Weekly**: Review security alerts, update dependencies
- **Monthly**: Performance review, capacity planning
- **Quarterly**: Security audit, disaster recovery test

### Update Procedure
```bash
# Pull latest changes
git pull origin main

# Rebuild and deploy
./scripts/deploy.sh production
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/yourusername/dca-auth/issues
- Documentation: https://docs.yourdomain.com
- Discord Server: https://discord.gg/yourinvite

## License

Copyright (c) 2024 DCA-Auth. All rights reserved.