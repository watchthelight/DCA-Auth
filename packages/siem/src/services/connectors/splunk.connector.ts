import * as SplunkLogger from 'splunk-logging';
import type { SIEMEvent } from '../siem.service';

export class SplunkConnector {
  private logger: any;
  private config: {
    host: string;
    port: number;
    token: string;
    index?: string;
    source?: string;
    sourcetype?: string;
  };

  constructor(config: {
    host: string;
    port: number;
    token: string;
    index?: string;
    source?: string;
    sourcetype?: string;
  }) {
    this.config = config;

    const splunkConfig = {
      token: config.token,
      url: `https://${config.host}:${config.port}`
    };

    this.logger = new SplunkLogger.Logger(splunkConfig);

    // Configure error handling
    this.logger.error = (error: any, context: any) => {
      console.error('Splunk error:', error, context);
    };
  }

  async send(events: SIEMEvent[]): Promise<void> {
    const promises = events.map(event => this.sendSingleEvent(event));
    await Promise.all(promises);
  }

  private sendSingleEvent(event: SIEMEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      const splunkEvent = {
        message: {
          timestamp: event.timestamp.toISOString(),
          severity: event.severity,
          category: event.category,
          eventType: event.eventType,
          source: event.source,
          user: event.user,
          details: event.details,
          metadata: event.metadata,
          tags: event.tags
        },
        metadata: {
          time: event.timestamp.getTime() / 1000,
          host: event.source.hostname,
          source: this.config.source || 'dca-auth',
          sourcetype: this.config.sourcetype || '_json',
          index: this.config.index
        }
      };

      this.logger.send(splunkEvent, (err: any, resp: any, body: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async query(params: {
    startTime: Date;
    endTime: Date;
    categories?: string[];
    severity?: string[];
    users?: string[];
    limit?: number;
  }): Promise<SIEMEvent[]> {
    // Splunk REST API query implementation
    const https = require('https');
    const queryString = require('querystring');

    const searchQuery = this.buildSearchQuery(params);

    return new Promise((resolve, reject) => {
      const postData = queryString.stringify({
        search: searchQuery,
        output_mode: 'json',
        earliest_time: params.startTime.toISOString(),
        latest_time: params.endTime.toISOString(),
        max_count: params.limit || 1000
      });

      const options = {
        hostname: this.config.host,
        port: this.config.port,
        path: '/services/search/jobs/export',
        method: 'POST',
        headers: {
          'Authorization': `Splunk ${this.config.token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res: any) => {
        let data = '';

        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const results = data.split('\n')
              .filter(Boolean)
              .map(line => JSON.parse(line))
              .filter(r => r.result)
              .map(r => this.transformSplunkResult(r.result));

            resolve(results);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  private buildSearchQuery(params: {
    categories?: string[];
    severity?: string[];
    users?: string[];
  }): string {
    let query = `search index="${this.config.index || '*'}" source="${this.config.source || 'dca-auth'}"`;

    if (params.categories?.length) {
      query += ` (${params.categories.map(c => `category="${c}"`).join(' OR ')})`;
    }

    if (params.severity?.length) {
      query += ` (${params.severity.map(s => `severity="${s}"`).join(' OR ')})`;
    }

    if (params.users?.length) {
      query += ` (${params.users.map(u => `user.id="${u}"`).join(' OR ')})`;
    }

    return query;
  }

  private transformSplunkResult(result: any): SIEMEvent {
    const message = typeof result._raw === 'string' ? JSON.parse(result._raw) : result;

    return {
      timestamp: new Date(message.timestamp),
      severity: message.severity,
      category: message.category,
      eventType: message.eventType,
      source: message.source,
      user: message.user,
      details: message.details,
      metadata: message.metadata,
      tags: message.tags
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
    const queryString = require('querystring');

    return new Promise((resolve, reject) => {
      const alertConfig = {
        name: rule.name,
        search: `${rule.condition} | stats count | where count > ${rule.threshold}`,
        'alert.track': 1,
        'alert.expires': '24h',
        'dispatch.earliest_time': `-${rule.timeWindow}m`,
        'dispatch.latest_time': 'now',
        'cron_schedule': `*/${rule.timeWindow} * * * *`
      };

      // Add actions
      rule.actions.forEach((action, index) => {
        switch (action.type) {
          case 'email':
            alertConfig[`action.email`] = 1;
            alertConfig[`action.email.to`] = action.config.to;
            alertConfig[`action.email.subject`] = action.config.subject;
            break;
          case 'webhook':
            alertConfig[`action.webhook`] = 1;
            alertConfig[`action.webhook.param.url`] = action.config.url;
            break;
        }
      });

      const postData = queryString.stringify(alertConfig);

      const options = {
        hostname: this.config.host,
        port: this.config.port,
        path: '/services/saved/searches',
        method: 'POST',
        headers: {
          'Authorization': `Splunk ${this.config.token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res: any) => {
        let data = '';

        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(rule.name);
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  async disconnect(): Promise<void> {
    // Splunk logger doesn't need explicit disconnection
    this.logger.flush();
  }
}