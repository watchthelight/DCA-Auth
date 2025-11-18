# DCA-Auth

**Discord-Connected Authorization System** for automated license key management and role-based access control.

## What It Does

DCA-Auth is an automated license key management system that bridges Discord servers with external applications requiring authorization. It provides secure, role-based license distribution and validation through both Discord bot commands and a web-based dashboard.

## Core Functions

### License Key Management

- **Automated Key Generation**: Creates cryptographically secure license keys with customizable formats and expiration dates
- **Role-Based Distribution**: Automatically grants or revokes license keys based on Discord server role assignments
- **Key Validation**: Provides API endpoints for external applications to validate license keys in real-time
- **Activation Tracking**: Monitors device activations per license with configurable limits
- **Bulk Operations**: Supports batch generation, revocation, and expiration of license keys

### Discord Integration

- **OAuth 2.0 Authentication**: Users authenticate via Discord to access the web dashboard
- **Bot Commands**: Members can check license status, activate keys, and view expiration dates through Discord slash commands
- **Admin Commands**: Server administrators can manually issue, revoke, or extend licenses via bot commands
- **Event-Driven Automation**: Automatically detects role changes, member joins/leaves, and updates license access accordingly
- **Guild Management**: Syncs Discord server roles with license tiers and permissions

### Web Dashboard

- **User Portal**: Members view their active licenses, check device activations, and download license files
- **Key Activation Interface**: Web-based license key activation and device management
- **Usage Analytics**: Display license usage statistics, expiration warnings, and activation history
- **Profile Management**: Users manage linked Discord accounts and view audit logs

### Admin Panel

- **User Administration**: View and manage all users, manually assign/revoke licenses, and ban problematic accounts
- **License Pool Management**: Create and manage license pools with different tier levels and permissions
- **System Configuration**: Configure role-to-license mappings, expiration policies, and activation limits
- **Audit Logging**: Comprehensive logging of all license operations, user actions, and system events
- **Monitoring Dashboard**: Real-time statistics on active licenses, API usage, and system health

### Background Automation

- **Expiration Processing**: Automatically deactivates expired licenses and notifies affected users
- **Role Synchronization**: Periodically syncs Discord roles with license access across all guilds
- **Cleanup Tasks**: Removes orphaned sessions, expired tokens, and inactive device registrations
- **Notification Queue**: Sends expiration warnings, renewal reminders, and system notifications

### Security & Validation

- **JWT Session Management**: Secure token-based authentication with refresh token rotation
- **Rate Limiting**: Protects API endpoints from abuse with configurable rate limits per user and endpoint
- **Fraud Detection**: Monitors for suspicious activation patterns and device spoofing
- **Audit Trail**: Immutable logs of all license operations for compliance and dispute resolution
- **Encrypted Storage**: License keys and sensitive data encrypted at rest in the database

### API Functionality

- **License Validation Endpoint**: External applications verify license validity via REST API
- **Webhook Integration**: Receives events from payment processors, Discord, and external services
- **Device Management API**: Applications register and deregister activated devices
- **Statistics API**: Provides usage metrics and analytics data for third-party integrations
- **Admin API**: Full programmatic control over license management for automation

## How It Works

1. **User Registration**: Users authenticate via Discord OAuth, linking their Discord account to the system
2. **Role Detection**: Bot monitors Discord server roles and automatically maps them to license tiers
3. **License Issuance**: When a user receives a qualifying role, the system generates and assigns a license key
4. **Key Distribution**: User receives notification via Discord DM and can view their key in the web dashboard
5. **Activation**: User enters license key into external application, which validates via API
6. **Ongoing Validation**: External applications periodically verify license validity through API calls
7. **Automatic Revocation**: If user loses qualifying role or license expires, access is automatically revoked
8. **Audit & Compliance**: All operations logged to database for review and compliance purposes

## Technical Capabilities

- **Multi-Guild Support**: Single instance manages licenses across multiple Discord servers
- **Scalable Architecture**: Horizontal scaling with Redis caching and job queue distribution
- **Real-Time Updates**: WebSocket connections provide live dashboard updates without polling
- **Flexible Licensing Models**: Supports time-based, perpetual, trial, and subscription-style licenses
- **Configurable Activation Limits**: Control concurrent device activations per license
- **Grace Periods**: Configurable grace periods before expired licenses are fully deactivated
- **Import/Export**: Bulk import existing licenses or export for external processing
- **Metrics & Monitoring**: Prometheus metrics for system health and Grafana dashboards for visualization
