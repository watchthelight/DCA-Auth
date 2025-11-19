import { EventEmitter } from 'events';
import { ElasticsearchClient } from './connectors/elasticsearch.connector';
import { SplunkConnector } from './connectors/splunk.connector';
import { QRadarConnector } from './connectors/qradar.connector';
import { SentinelConnector } from './connectors/sentinel.connector';
import { DatadogConnector } from './connectors/datadog.connector';
import { SyslogConnector } from './connectors/syslog.connector';

export interface SIEMEvent {
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

export interface SIEMConfig {
  providers: {
    elasticsearch?: {
      enabled: boolean;
      nodes: string[];
      apiKey?: string;
      index?: string;
      cloudId?: string;
    };
    splunk?: {
      enabled: boolean;
      host: string;
      port: number;
      token: string;
      index?: string;
      source?: string;
      sourcetype?: string;
    };
    qradar?: {
      enabled: boolean;
      host: string;
      port: number;
      token: string;
      logSourceId?: number;
    };
    sentinel?: {
      enabled: boolean;
      workspaceId: string;
      workspaceKey: string;
      logType: string;
      endpoint?: string;
    };
    datadog?: {
      enabled: boolean;
      apiKey: string;
      appKey?: string;
      site?: string;
      service?: string;
    };
    syslog?: {
      enabled: boolean;
      host: string;
      port: number;
      protocol: 'tcp' | 'udp' | 'tls';
      facility?: number;
      appName?: string;
    };
  };
  buffer?: {
    enabled: boolean;
    maxSize: number;
    flushInterval: number;
  };
  filters?: {
    minSeverity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
    includeTags?: string[];
    excludeTags?: string[];
    includeCategories?: string[];
    excludeCategories?: string[];
  };
  enrichment?: {
    addHostInfo: boolean;
    addProcessInfo: boolean;
    addGeoIP: boolean;
  };
}

export class SIEMService extends EventEmitter {
  private connectors: Map<string, any> = new Map();
  private config: SIEMConfig;
  private eventBuffer: SIEMEvent[] = [];
  private bufferTimer?: NodeJS.Timeout;
  private metrics = {
    eventsSent: 0,
    eventsDropped: 0,
    errors: 0
  };

  constructor(config: SIEMConfig) {
    super();
    this.config = config;
    this.initializeConnectors();
    this.startBufferFlush();
  }

  private initializeConnectors() {
    const { providers } = this.config;

    if (providers.elasticsearch?.enabled) {
      this.connectors.set('elasticsearch', new ElasticsearchClient(providers.elasticsearch));
    }

    if (providers.splunk?.enabled) {
      this.connectors.set('splunk', new SplunkConnector(providers.splunk));
    }

    if (providers.qradar?.enabled) {
      this.connectors.set('qradar', new QRadarConnector(providers.qradar));
    }

    if (providers.sentinel?.enabled) {
      this.connectors.set('sentinel', new SentinelConnector(providers.sentinel));
    }

    if (providers.datadog?.enabled) {
      this.connectors.set('datadog', new DatadogConnector(providers.datadog));
    }

    if (providers.syslog?.enabled) {
      this.connectors.set('syslog', new SyslogConnector(providers.syslog));
    }
  }

  async sendEvent(event: SIEMEvent): Promise<void> {
    try {
      // Apply filters
      if (!this.shouldSendEvent(event)) {
        this.metrics.eventsDropped++;
        return;
      }

      // Enrich event
      const enrichedEvent = this.enrichEvent(event);

      // Add to buffer if enabled
      if (this.config.buffer?.enabled) {
        this.eventBuffer.push(enrichedEvent);

        if (this.eventBuffer.length >= this.config.buffer.maxSize) {
          await this.flushBuffer();
        }
      } else {
        // Send immediately
        await this.sendToConnectors([enrichedEvent]);
      }

      this.metrics.eventsSent++;
    } catch (error) {
      this.metrics.errors++;
      this.emit('error', error);
    }
  }

  private shouldSendEvent(event: SIEMEvent): boolean {
    const { filters } = this.config;
    if (!filters) return true;

    // Check severity
    if (filters.minSeverity) {
      const severityLevels = ['debug', 'info', 'warning', 'error', 'critical'];
      const minLevel = severityLevels.indexOf(filters.minSeverity);
      const eventLevel = severityLevels.indexOf(event.severity);
      if (eventLevel < minLevel) return false;
    }

    // Check categories
    if (filters.includeCategories?.length) {
      if (!filters.includeCategories.includes(event.category)) return false;
    }
    if (filters.excludeCategories?.length) {
      if (filters.excludeCategories.includes(event.category)) return false;
    }

    // Check tags
    if (filters.includeTags?.length) {
      const hasTag = filters.includeTags.some(tag => event.tags?.includes(tag));
      if (!hasTag) return false;
    }
    if (filters.excludeTags?.length) {
      const hasExcludedTag = filters.excludeTags.some(tag => event.tags?.includes(tag));
      if (hasExcludedTag) return false;
    }

    return true;
  }

  private enrichEvent(event: SIEMEvent): SIEMEvent {
    const enriched = { ...event };

    if (this.config.enrichment?.addHostInfo) {
      enriched.source = {
        ...enriched.source,
        hostname: enriched.source.hostname || require('os').hostname()
      };
    }

    if (this.config.enrichment?.addProcessInfo) {
      enriched.details = {
        ...enriched.details,
        process: {
          pid: process.pid,
          platform: process.platform,
          nodeVersion: process.version
        }
      };
    }

    return enriched;
  }

  private async sendToConnectors(events: SIEMEvent[]): Promise<void> {
    const promises = [];

    for (const [name, connector] of this.connectors) {
      promises.push(
        connector.send(events).catch((error: any) => {
          console.error(`Failed to send to ${name}:`, error);
          this.emit('connector_error', { connector: name, error });
        })
      );
    }

    await Promise.all(promises);
  }

  private async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    await this.sendToConnectors(events);
  }

  private startBufferFlush() {
    if (!this.config.buffer?.enabled) return;

    this.bufferTimer = setInterval(
      () => this.flushBuffer(),
      this.config.buffer.flushInterval
    );
  }

  // Security Event Helpers
  async logAuthentication(
    success: boolean,
    userId?: string,
    email?: string,
    method?: string,
    ip?: string
  ): Promise<void> {
    await this.sendEvent({
      timestamp: new Date(),
      severity: success ? 'info' : 'warning',
      category: 'authentication',
      eventType: success ? 'auth_success' : 'auth_failure',
      source: {
        service: 'dca-auth',
        component: 'auth',
        hostname: require('os').hostname(),
        ip
      },
      user: { id: userId, email },
      details: {
        method,
        success,
        timestamp: new Date().toISOString()
      },
      tags: ['authentication', method || 'unknown']
    });
  }

  async logLicenseActivity(
    action: 'create' | 'activate' | 'validate' | 'revoke' | 'expire',
    licenseId: string,
    userId?: string,
    success: boolean = true,
    details?: any
  ): Promise<void> {
    await this.sendEvent({
      timestamp: new Date(),
      severity: success ? 'info' : 'error',
      category: 'license',
      eventType: `license_${action}`,
      source: {
        service: 'dca-auth',
        component: 'license',
        hostname: require('os').hostname()
      },
      user: { id: userId },
      details: {
        licenseId,
        action,
        success,
        ...details
      },
      tags: ['license', action]
    });
  }

  async logSecurityEvent(
    eventType: string,
    severity: 'warning' | 'error' | 'critical',
    details: any
  ): Promise<void> {
    await this.sendEvent({
      timestamp: new Date(),
      severity,
      category: 'security',
      eventType,
      source: {
        service: 'dca-auth',
        component: 'security',
        hostname: require('os').hostname()
      },
      details,
      tags: ['security', eventType]
    });
  }

  async logAuditEvent(
    action: string,
    resource: string,
    userId: string,
    details: any
  ): Promise<void> {
    await this.sendEvent({
      timestamp: new Date(),
      severity: 'info',
      category: 'audit',
      eventType: 'audit_log',
      source: {
        service: 'dca-auth',
        component: 'audit',
        hostname: require('os').hostname()
      },
      user: { id: userId },
      details: {
        action,
        resource,
        ...details
      },
      tags: ['audit', action]
    });
  }

  // Query Methods
  async query(params: {
    startTime: Date;
    endTime: Date;
    categories?: string[];
    severity?: string[];
    users?: string[];
    limit?: number;
  }): Promise<SIEMEvent[]> {
    // This would query from the primary SIEM
    const primaryConnector = this.connectors.get('elasticsearch') ||
                           this.connectors.get('splunk');

    if (!primaryConnector || !primaryConnector.query) {
      throw new Error('No queryable SIEM connector available');
    }

    return primaryConnector.query(params);
  }

  // Alert Management
  async createAlert(rule: {
    name: string;
    condition: string;
    threshold: number;
    timeWindow: number;
    actions: Array<{ type: string; config: any }>;
  }): Promise<string> {
    const primaryConnector = this.connectors.get('elasticsearch') ||
                           this.connectors.get('splunk');

    if (!primaryConnector || !primaryConnector.createAlert) {
      throw new Error('Alert creation not supported');
    }

    return primaryConnector.createAlert(rule);
  }

  // Metrics
  getMetrics() {
    return {
      ...this.metrics,
      bufferSize: this.eventBuffer.length,
      connectors: Array.from(this.connectors.keys())
    };
  }

  // Cleanup
  async disconnect(): Promise<void> {
    if (this.bufferTimer) {
      clearInterval(this.bufferTimer);
    }

    await this.flushBuffer();

    for (const connector of this.connectors.values()) {
      if (connector.disconnect) {
        await connector.disconnect();
      }
    }
  }
}