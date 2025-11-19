# @dca-auth/siem

Enterprise SIEM (Security Information and Event Management) integration for DCA-Auth. Supports multiple SIEM platforms for comprehensive security monitoring and compliance.

## Supported SIEM Platforms

- **Elasticsearch/ELK Stack** - Full-text search and analytics
- **Splunk** - Enterprise security and observability
- **IBM QRadar** - Advanced threat detection
- **Azure Sentinel** - Cloud-native SIEM
- **Datadog** - Cloud monitoring and security
- **Syslog** - Universal logging protocol (RFC 5424, CEF, LEEF)

## Installation

```bash
npm install @dca-auth/siem
```

## Configuration

```typescript
import { initializeSIEM } from '@dca-auth/siem';

const siem = initializeSIEM({
  providers: {
    elasticsearch: {
      enabled: true,
      nodes: ['https://elastic.example.com:9200'],
      apiKey: 'your-api-key',
      index: 'dca-auth-events'
    },
    splunk: {
      enabled: true,
      host: 'splunk.example.com',
      port: 8088,
      token: 'your-hec-token'
    },
    sentinel: {
      enabled: true,
      workspaceId: 'your-workspace-id',
      workspaceKey: 'your-workspace-key',
      logType: 'DCAAuth'
    }
  },
  buffer: {
    enabled: true,
    maxSize: 100,
    flushInterval: 5000
  },
  filters: {
    minSeverity: 'info',
    excludeCategories: ['debug']
  }
});
```

## Usage

### Basic Event Logging

```typescript
import { getSIEM } from '@dca-auth/siem';

const siem = getSIEM();

// Log custom event
await siem.sendEvent({
  timestamp: new Date(),
  severity: 'info',
  category: 'authentication',
  eventType: 'login_success',
  source: {
    service: 'dca-auth',
    component: 'auth',
    hostname: 'server1.example.com'
  },
  user: {
    id: 'user123',
    email: 'user@example.com'
  },
  details: {
    method: 'oauth',
    provider: 'discord'
  }
});
```

### Audit Logger

```typescript
import { auditLogger } from '@dca-auth/siem';

// Log user actions
await auditLogger.logUserAction(
  'user123',
  'license_create',
  'license_456',
  { product: 'premium', duration: 365 }
);

// Log authentication
await auditLogger.logAuthentication(
  true, // success
  'user123',
  'user@example.com',
  'password',
  '192.168.1.1'
);

// Log license operations
await auditLogger.logLicenseOperation(
  'activate',
  'license_456',
  'user123',
  true,
  { machineId: 'abc123' }
);

// Log compliance events
await auditLogger.logComplianceEvent(
  'gdpr',
  'data_export_requested',
  'user123',
  { format: 'json' }
);
```

### Security Monitoring

```typescript
import { securityMonitor } from '@dca-auth/siem';

// Detect brute force attacks
const isBruteForce = await securityMonitor.detectBruteForce(
  'user123',
  '192.168.1.1',
  5 // number of failed attempts
);

// Log anomalous activity
await securityMonitor.detectAnomalousActivity(
  'user123',
  'unusual_location',
  {
    currentLocation: 'US',
    previousLocation: 'UK',
    timeDiff: 3600
  }
);

// Detect rate limit violations
await securityMonitor.detectRateLimitViolation(
  'user123',
  '/api/licenses',
  15 // requests count
);
```

### Express Middleware

```typescript
import express from 'express';
import { siemMiddleware } from '@dca-auth/siem';

const app = express();

// Automatically log all HTTP requests/responses
app.use(siemMiddleware());

app.get('/api/licenses', (req, res) => {
  // Your route handler
  res.json({ licenses: [] });
});
```

### Query Events

```typescript
const events = await siem.query({
  startTime: new Date(Date.now() - 86400000), // Last 24 hours
  endTime: new Date(),
  categories: ['authentication', 'license'],
  severity: ['error', 'critical'],
  limit: 100
});
```

### Create Alerts

```typescript
const alertId = await siem.createAlert({
  name: 'High Failed Login Rate',
  condition: 'category:authentication AND eventType:login_failure',
  threshold: 10,
  timeWindow: 5, // 5 minutes
  actions: [
    {
      type: 'email',
      config: {
        to: 'security@example.com',
        subject: 'Security Alert: High Failed Login Rate'
      }
    },
    {
      type: 'webhook',
      config: {
        url: 'https://hooks.slack.com/services/xxx'
      }
    }
  ]
});
```

## Event Structure

```typescript
interface SIEMEvent {
  timestamp: Date;
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  category: 'authentication' | 'authorization' | 'license' | 'security' | 'system' | 'audit';
  eventType: string;
  source: {
    service: string;
    component: string;
    hostname: string;
    ip?: string;
  };
  user?: {
    id?: string;
    email?: string;
    role?: string;
  };
  details: Record<string, any>;
  metadata?: {
    correlationId?: string;
    sessionId?: string;
    requestId?: string;
    organizationId?: string;
  };
  tags?: string[];
}
```

## Environment Variables

```bash
# Elasticsearch
ELASTICSEARCH_ENABLED=true
ELASTICSEARCH_NODES=http://localhost:9200
ELASTICSEARCH_API_KEY=your-api-key
ELASTICSEARCH_INDEX=dca-auth-events

# Splunk
SPLUNK_ENABLED=true
SPLUNK_HOST=localhost
SPLUNK_PORT=8088
SPLUNK_TOKEN=your-hec-token
SPLUNK_INDEX=main

# QRadar
QRADAR_ENABLED=true
QRADAR_HOST=localhost
QRADAR_PORT=514
QRADAR_TOKEN=your-token

# Azure Sentinel
SENTINEL_ENABLED=true
SENTINEL_WORKSPACE_ID=your-workspace-id
SENTINEL_WORKSPACE_KEY=your-workspace-key
SENTINEL_LOG_TYPE=DCAAuth

# Datadog
DATADOG_ENABLED=true
DATADOG_API_KEY=your-api-key
DATADOG_APP_KEY=your-app-key
DATADOG_SITE=datadoghq.com

# Syslog
SYSLOG_ENABLED=true
SYSLOG_HOST=localhost
SYSLOG_PORT=514
SYSLOG_PROTOCOL=udp
```

## Compliance Support

- **GDPR** - Data access logging, consent tracking, data export/deletion events
- **SOC2** - Security event monitoring, access control logging, audit trails
- **PCI DSS** - Payment card data access logging, security controls
- **HIPAA** - PHI access logging, authorization tracking

## Performance Considerations

- Events are batched for optimal performance
- Configurable buffer size and flush intervals
- Automatic retry with exponential backoff
- Connection pooling for high throughput
- Asynchronous sending to prevent blocking

## Security

- Encrypted connections (TLS/SSL)
- API key authentication
- IP whitelisting support
- Data masking for sensitive fields
- Audit trail integrity verification

## License

MIT