import { StatsD } from 'node-statsd';
import type { SIEMEvent } from '../siem.service';

export class DatadogConnector {
  private statsd: StatsD;
  private config: {
    apiKey: string;
    appKey?: string;
    site?: string;
    service?: string;
  };

  constructor(config: {
    apiKey: string;
    appKey?: string;
    site?: string;
    service?: string;
  }) {
    this.config = config;

    // Initialize StatsD client for metrics
    this.statsd = new StatsD({
      host: 'datadog-agent',
      port: 8125,
      prefix: 'dca_auth.'
    });
  }

  async send(events: SIEMEvent[]): Promise<void> {
    const https = require('https');
    const logs = events.map(event => this.transformToDatadog(event));

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(logs);

      const hostname = this.getDatadogHost();
      const options = {
        hostname,
        port: 443,
        path: '/api/v2/logs',
        method: 'POST',
        headers: {
          'DD-API-KEY': this.config.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res: any) => {
        let data = '';

        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 202 || res.statusCode === 200) {
            // Also send metrics
            this.sendMetrics(events);
            resolve();
          } else {
            reject(new Error(`Datadog returned status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  private getDatadogHost(): string {
    const site = this.config.site || 'datadoghq.com';
    return `http-intake.logs.${site}`;
  }

  private transformToDatadog(event: SIEMEvent): any {
    return {
      ddsource: 'dca-auth',
      ddtags: [
        `env:production`,
        `service:${this.config.service || 'dca-auth'}`,
        `category:${event.category}`,
        `severity:${event.severity}`,
        ...event.tags?.map(tag => `custom:${tag}`) || []
      ].join(','),
      hostname: event.source.hostname,
      service: event.source.service,
      message: JSON.stringify({
        eventType: event.eventType,
        details: event.details
      }),
      timestamp: event.timestamp.getTime(),
      attributes: {
        severity: event.severity,
        category: event.category,
        eventType: event.eventType,
        component: event.source.component,
        sourceIp: event.source.ip,
        userId: event.user?.id,
        userEmail: event.user?.email,
        userRole: event.user?.role,
        correlationId: event.metadata?.correlationId,
        sessionId: event.metadata?.sessionId,
        requestId: event.metadata?.requestId,
        organizationId: event.metadata?.organizationId,
        ...event.details
      }
    };
  }

  private sendMetrics(events: SIEMEvent[]) {
    // Send event counts as metrics
    const eventCounts: Map<string, number> = new Map();

    for (const event of events) {
      const key = `${event.category}.${event.eventType}`;
      eventCounts.set(key, (eventCounts.get(key) || 0) + 1);
    }

    for (const [key, count] of eventCounts) {
      this.statsd.gauge(`events.${key}`, count);
    }

    // Send severity distribution
    const severityCounts: Map<string, number> = new Map();
    for (const event of events) {
      severityCounts.set(event.severity, (severityCounts.get(event.severity) || 0) + 1);
    }

    for (const [severity, count] of severityCounts) {
      this.statsd.gauge(`events.severity.${severity}`, count);
    }
  }

  async query(params: {
    startTime: Date;
    endTime: Date;
    categories?: string[];
    severity?: string[];
    users?: string[];
    limit?: number;
  }): Promise<SIEMEvent[]> {
    const https = require('https');

    // Build Datadog log search query
    let query = `source:dca-auth`;

    if (params.categories?.length) {
      query += ` @category:(${params.categories.join(' OR ')})`;
    }

    if (params.severity?.length) {
      query += ` @severity:(${params.severity.join(' OR ')})`;
    }

    if (params.users?.length) {
      query += ` @userId:(${params.users.join(' OR ')})`;
    }

    return new Promise((resolve, reject) => {
      const queryParams = new URLSearchParams({
        'filter[query]': query,
        'filter[from]': params.startTime.toISOString(),
        'filter[to]': params.endTime.toISOString(),
        'page[limit]': String(params.limit || 1000)
      });

      const options = {
        hostname: `api.${this.config.site || 'datadoghq.com'}`,
        port: 443,
        path: `/api/v2/logs/events/search?${queryParams}`,
        method: 'GET',
        headers: {
          'DD-API-KEY': this.config.apiKey,
          'DD-APPLICATION-KEY': this.config.appKey || ''
        }
      };

      https.get(options, (res: any) => {
        let data = '';

        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          const response = JSON.parse(data);
          const events = response.data?.map(this.transformFromDatadog) || [];
          resolve(events);
        });
      }).on('error', reject);
    });
  }

  private transformFromDatadog(log: any): SIEMEvent {
    const attributes = log.attributes?.attributes || {};

    return {
      timestamp: new Date(log.attributes?.timestamp || log.attributes?.date),
      severity: attributes.severity || 'info',
      category: attributes.category || 'unknown',
      eventType: attributes.eventType || 'unknown',
      source: {
        service: log.attributes?.service || 'dca-auth',
        component: attributes.component || 'unknown',
        hostname: log.attributes?.hostname || 'unknown',
        ip: attributes.sourceIp
      },
      user: attributes.userId ? {
        id: attributes.userId,
        email: attributes.userEmail,
        role: attributes.userRole
      } : undefined,
      details: attributes,
      metadata: {
        correlationId: attributes.correlationId,
        sessionId: attributes.sessionId,
        requestId: attributes.requestId,
        organizationId: attributes.organizationId
      },
      tags: log.attributes?.tags || []
    };
  }

  async createAlert(rule: {
    name: string;
    condition: string;
    threshold: number;
    timeWindow: number;
    actions: Array<{ type: string; config: any }>;
  }): Promise<string> {
    const https = require('https');

    const monitor = {
      type: 'log alert',
      name: rule.name,
      message: `Alert: ${rule.name} triggered`,
      query: `logs("source:dca-auth ${rule.condition}").index("*").rollup("count").last("${rule.timeWindow}m") > ${rule.threshold}`,
      tags: ['dca-auth', 'automated'],
      priority: 3,
      options: {
        thresholds: {
          critical: rule.threshold
        },
        notify_no_data: false,
        renotify_interval: 60
      }
    };

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(monitor);

      const options = {
        hostname: `api.${this.config.site || 'datadoghq.com'}`,
        port: 443,
        path: '/api/v1/monitor',
        method: 'POST',
        headers: {
          'DD-API-KEY': this.config.apiKey,
          'DD-APPLICATION-KEY': this.config.appKey || '',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res: any) => {
        let data = '';

        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          const response = JSON.parse(data);
          resolve(response.id);
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  async disconnect(): Promise<void> {
    this.statsd.close();
  }
}