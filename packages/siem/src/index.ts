export { SIEMService, SIEMEvent, SIEMConfig } from './services/siem.service';

import { SIEMService, SIEMConfig } from './services/siem.service';

// Default configuration
const defaultConfig: SIEMConfig = {
  providers: {
    elasticsearch: {
      enabled: process.env.ELASTICSEARCH_ENABLED === 'true',
      nodes: process.env.ELASTICSEARCH_NODES?.split(',') || ['http://localhost:9200'],
      apiKey: process.env.ELASTICSEARCH_API_KEY,
      index: process.env.ELASTICSEARCH_INDEX || 'dca-auth-events'
    },
    splunk: {
      enabled: process.env.SPLUNK_ENABLED === 'true',
      host: process.env.SPLUNK_HOST || 'localhost',
      port: parseInt(process.env.SPLUNK_PORT || '8088'),
      token: process.env.SPLUNK_TOKEN || '',
      index: process.env.SPLUNK_INDEX || 'main'
    },
    qradar: {
      enabled: process.env.QRADAR_ENABLED === 'true',
      host: process.env.QRADAR_HOST || 'localhost',
      port: parseInt(process.env.QRADAR_PORT || '514'),
      token: process.env.QRADAR_TOKEN || ''
    },
    sentinel: {
      enabled: process.env.SENTINEL_ENABLED === 'true',
      workspaceId: process.env.SENTINEL_WORKSPACE_ID || '',
      workspaceKey: process.env.SENTINEL_WORKSPACE_KEY || '',
      logType: process.env.SENTINEL_LOG_TYPE || 'DCAAuth'
    },
    datadog: {
      enabled: process.env.DATADOG_ENABLED === 'true',
      apiKey: process.env.DATADOG_API_KEY || '',
      appKey: process.env.DATADOG_APP_KEY,
      site: process.env.DATADOG_SITE || 'datadoghq.com'
    },
    syslog: {
      enabled: process.env.SYSLOG_ENABLED === 'true',
      host: process.env.SYSLOG_HOST || 'localhost',
      port: parseInt(process.env.SYSLOG_PORT || '514'),
      protocol: (process.env.SYSLOG_PROTOCOL || 'udp') as 'tcp' | 'udp' | 'tls'
    }
  },
  buffer: {
    enabled: true,
    maxSize: 100,
    flushInterval: 5000
  },
  filters: {
    minSeverity: 'info'
  },
  enrichment: {
    addHostInfo: true,
    addProcessInfo: true,
    addGeoIP: false
  }
};

// Singleton instance
let siemInstance: SIEMService | null = null;

// Initialize SIEM service
export function initializeSIEM(config?: Partial<SIEMConfig>): SIEMService {
  if (!siemInstance) {
    const finalConfig = {
      ...defaultConfig,
      ...config,
      providers: {
        ...defaultConfig.providers,
        ...config?.providers
      }
    };

    siemInstance = new SIEMService(finalConfig);

    // Set up error handling
    siemInstance.on('error', (error) => {
      console.error('[SIEM] Error:', error);
    });

    siemInstance.on('connector_error', ({ connector, error }) => {
      console.error(`[SIEM] Connector ${connector} error:`, error);
    });
  }

  return siemInstance;
}

// Get SIEM instance
export function getSIEM(): SIEMService {
  if (!siemInstance) {
    return initializeSIEM();
  }
  return siemInstance;
}

// Express middleware
export function siemMiddleware() {
  return async (req: any, res: any, next: any) => {
    const siem = getSIEM();
    const startTime = Date.now();

    // Log request
    await siem.sendEvent({
      timestamp: new Date(),
      severity: 'info',
      category: 'audit',
      eventType: 'http_request',
      source: {
        service: 'dca-auth',
        component: 'api',
        hostname: req.hostname,
        ip: req.ip
      },
      user: req.user ? {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      } : undefined,
      details: {
        method: req.method,
        path: req.path,
        query: req.query,
        userAgent: req.get('user-agent')
      },
      metadata: {
        requestId: req.id,
        sessionId: req.session?.id
      },
      tags: ['http', req.method.toLowerCase()]
    });

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(...args: any[]) {
      const duration = Date.now() - startTime;

      // Log response
      siem.sendEvent({
        timestamp: new Date(),
        severity: res.statusCode >= 400 ? 'error' : 'info',
        category: 'audit',
        eventType: 'http_response',
        source: {
          service: 'dca-auth',
          component: 'api',
          hostname: req.hostname,
          ip: req.ip
        },
        user: req.user ? {
          id: req.user.id,
          email: req.user.email,
          role: req.user.role
        } : undefined,
        details: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get('user-agent')
        },
        metadata: {
          requestId: req.id,
          sessionId: req.session?.id
        },
        tags: ['http', req.method.toLowerCase(), `status_${res.statusCode}`]
      }).catch(console.error);

      return originalEnd.apply(res, args);
    };

    next();
  };
}

// Audit logger helper
export class AuditLogger {
  private siem: SIEMService;

  constructor(siem?: SIEMService) {
    this.siem = siem || getSIEM();
  }

  async logUserAction(
    userId: string,
    action: string,
    resource: string,
    details?: any
  ): Promise<void> {
    await this.siem.logAuditEvent(action, resource, userId, details);
  }

  async logSecurityIncident(
    type: string,
    severity: 'warning' | 'error' | 'critical',
    details: any
  ): Promise<void> {
    await this.siem.logSecurityEvent(type, severity, details);
  }

  async logAuthentication(
    success: boolean,
    userId?: string,
    email?: string,
    method?: string,
    ip?: string
  ): Promise<void> {
    await this.siem.logAuthentication(success, userId, email, method, ip);
  }

  async logLicenseOperation(
    action: 'create' | 'activate' | 'validate' | 'revoke' | 'expire',
    licenseId: string,
    userId?: string,
    success: boolean = true,
    details?: any
  ): Promise<void> {
    await this.siem.logLicenseActivity(action, licenseId, userId, success, details);
  }

  async logDataAccess(
    userId: string,
    dataType: string,
    operation: 'read' | 'write' | 'delete',
    resourceId: string,
    sensitive: boolean = false
  ): Promise<void> {
    await this.siem.sendEvent({
      timestamp: new Date(),
      severity: sensitive ? 'warning' : 'info',
      category: 'audit',
      eventType: 'data_access',
      source: {
        service: 'dca-auth',
        component: 'data',
        hostname: require('os').hostname()
      },
      user: { id: userId },
      details: {
        dataType,
        operation,
        resourceId,
        sensitive
      },
      tags: ['data_access', operation, dataType]
    });
  }

  async logComplianceEvent(
    type: 'gdpr' | 'soc2' | 'pci' | 'hipaa',
    action: string,
    userId?: string,
    details?: any
  ): Promise<void> {
    await this.siem.sendEvent({
      timestamp: new Date(),
      severity: 'info',
      category: 'audit',
      eventType: 'compliance',
      source: {
        service: 'dca-auth',
        component: 'compliance',
        hostname: require('os').hostname()
      },
      user: userId ? { id: userId } : undefined,
      details: {
        complianceType: type,
        action,
        ...details
      },
      tags: ['compliance', type, action]
    });
  }
}

// Export audit logger instance
export const auditLogger = new AuditLogger();

// Security monitoring
export class SecurityMonitor {
  private siem: SIEMService;
  private thresholds = {
    failedLoginAttempts: 5,
    suspiciousActivities: 3,
    rateLimitExceeded: 10
  };

  constructor(siem?: SIEMService) {
    this.siem = siem || getSIEM();
  }

  async detectBruteForce(
    userId: string,
    ip: string,
    attempts: number
  ): Promise<boolean> {
    if (attempts >= this.thresholds.failedLoginAttempts) {
      await this.siem.logSecurityEvent(
        'brute_force_detected',
        'critical',
        {
          userId,
          ip,
          attempts,
          threshold: this.thresholds.failedLoginAttempts
        }
      );
      return true;
    }
    return false;
  }

  async detectAnomalousActivity(
    userId: string,
    activityType: string,
    details: any
  ): Promise<void> {
    await this.siem.logSecurityEvent(
      'anomalous_activity',
      'warning',
      {
        userId,
        activityType,
        ...details
      }
    );
  }

  async detectRateLimitViolation(
    userId: string,
    endpoint: string,
    requests: number
  ): Promise<void> {
    if (requests >= this.thresholds.rateLimitExceeded) {
      await this.siem.logSecurityEvent(
        'rate_limit_violation',
        'error',
        {
          userId,
          endpoint,
          requests,
          threshold: this.thresholds.rateLimitExceeded
        }
      );
    }
  }
}

export const securityMonitor = new SecurityMonitor();

// Cleanup on process exit
process.on('SIGINT', async () => {
  if (siemInstance) {
    await siemInstance.disconnect();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (siemInstance) {
    await siemInstance.disconnect();
  }
  process.exit(0);
});