import * as https from 'https';
import type { SIEMEvent } from '../siem.service';

export class QRadarConnector {
  private config: {
    host: string;
    port: number;
    token: string;
    logSourceId?: number;
  };

  constructor(config: {
    host: string;
    port: number;
    token: string;
    logSourceId?: number;
  }) {
    this.config = config;
  }

  async send(events: SIEMEvent[]): Promise<void> {
    const leefEvents = events.map(event => this.convertToLEEF(event));

    for (const leefEvent of leefEvents) {
      await this.sendToQRadar(leefEvent);
    }
  }

  private convertToLEEF(event: SIEMEvent): string {
    const leefVersion = '2.0';
    const vendor = 'DCA-Auth';
    const product = 'License Management';
    const version = '1.0';
    const eventId = event.eventType;

    // LEEF header
    let leef = `LEEF:${leefVersion}|${vendor}|${product}|${version}|${eventId}|`;

    // Add event attributes
    const attributes: string[] = [];

    attributes.push(`devTime=${event.timestamp.getTime()}`);
    attributes.push(`severity=${this.mapSeverity(event.severity)}`);
    attributes.push(`cat=${event.category}`);
    attributes.push(`srcHostName=${event.source.hostname}`);
    attributes.push(`service=${event.source.service}`);
    attributes.push(`component=${event.source.component}`);

    if (event.source.ip) {
      attributes.push(`src=${event.source.ip}`);
    }

    if (event.user?.id) {
      attributes.push(`usrName=${event.user.id}`);
    }

    if (event.user?.email) {
      attributes.push(`email=${event.user.email}`);
    }

    // Add custom details
    for (const [key, value] of Object.entries(event.details)) {
      if (typeof value === 'string' || typeof value === 'number') {
        attributes.push(`${key}=${value}`);
      }
    }

    // Add metadata
    if (event.metadata) {
      for (const [key, value] of Object.entries(event.metadata)) {
        attributes.push(`meta_${key}=${value}`);
      }
    }

    // Join attributes with tab separator
    leef += attributes.join('\t');

    return leef;
  }

  private mapSeverity(severity: string): number {
    switch (severity) {
      case 'debug': return 1;
      case 'info': return 3;
      case 'warning': return 5;
      case 'error': return 7;
      case 'critical': return 10;
      default: return 3;
    }
  }

  private async sendToQRadar(leefEvent: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const data = Buffer.from(leefEvent);

      const options = {
        hostname: this.config.host,
        port: this.config.port,
        path: '/api/siem/logstash',
        method: 'POST',
        headers: {
          'SEC': this.config.token,
          'Content-Type': 'text/plain',
          'Content-Length': data.length
        },
        rejectUnauthorized: false // For self-signed certificates
      };

      const req = https.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            resolve();
          } else {
            reject(new Error(`QRadar returned status ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
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
    const aql = this.buildAQLQuery(params);

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ query_expression: aql });

      const options = {
        hostname: this.config.host,
        port: this.config.port,
        path: '/api/ariel/searches',
        method: 'POST',
        headers: {
          'SEC': this.config.token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        rejectUnauthorized: false
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', async () => {
          try {
            const response = JSON.parse(data);
            const searchId = response.search_id;

            // Wait for search to complete
            const results = await this.getSearchResults(searchId);
            const events = results.map(this.transformQRadarResult);
            resolve(events);
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

  private buildAQLQuery(params: {
    startTime: Date;
    endTime: Date;
    categories?: string[];
    severity?: string[];
    users?: string[];
    limit?: number;
  }): string {
    const startTime = params.startTime.getTime();
    const endTime = params.endTime.getTime();

    let query = `SELECT * FROM events WHERE devicetime BETWEEN ${startTime} AND ${endTime}`;

    if (params.categories?.length) {
      query += ` AND category IN (${params.categories.map(c => `'${c}'`).join(',')})`;
    }

    if (params.severity?.length) {
      const severities = params.severity.map(s => this.mapSeverity(s));
      query += ` AND severity IN (${severities.join(',')})`;
    }

    if (params.users?.length) {
      query += ` AND username IN (${params.users.map(u => `'${u}'`).join(',')})`;
    }

    query += ` LIMIT ${params.limit || 1000}`;

    return query;
  }

  private async getSearchResults(searchId: string): Promise<any[]> {
    // Poll for search completion and get results
    return new Promise((resolve, reject) => {
      const checkStatus = () => {
        const options = {
          hostname: this.config.host,
          port: this.config.port,
          path: `/api/ariel/searches/${searchId}`,
          method: 'GET',
          headers: {
            'SEC': this.config.token
          },
          rejectUnauthorized: false
        };

        https.get(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            const status = JSON.parse(data);

            if (status.status === 'COMPLETED') {
              // Get results
              this.fetchResults(searchId).then(resolve).catch(reject);
            } else if (status.status === 'ERROR' || status.status === 'CANCELED') {
              reject(new Error(`Search ${status.status}`));
            } else {
              // Continue polling
              setTimeout(checkStatus, 1000);
            }
          });
        }).on('error', reject);
      };

      checkStatus();
    });
  }

  private fetchResults(searchId: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.config.host,
        port: this.config.port,
        path: `/api/ariel/searches/${searchId}/results`,
        method: 'GET',
        headers: {
          'SEC': this.config.token,
          'Accept': 'application/json'
        },
        rejectUnauthorized: false
      };

      https.get(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const results = JSON.parse(data);
            resolve(results.events || []);
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', reject);
    });
  }

  private transformQRadarResult(result: any): SIEMEvent {
    return {
      timestamp: new Date(result.devicetime || result.starttime),
      severity: this.mapQRadarSeverity(result.severity),
      category: result.category || 'unknown',
      eventType: result.eventname || 'unknown',
      source: {
        service: 'dca-auth',
        component: result.component || 'unknown',
        hostname: result.hostname || result.sourceaddress,
        ip: result.sourceaddress
      },
      user: {
        id: result.username,
        email: result.email
      },
      details: result,
      metadata: {
        correlationId: result.correlationid,
        sessionId: result.sessionid
      },
      tags: []
    };
  }

  private mapQRadarSeverity(severity: number): 'debug' | 'info' | 'warning' | 'error' | 'critical' {
    if (severity <= 2) return 'debug';
    if (severity <= 4) return 'info';
    if (severity <= 6) return 'warning';
    if (severity <= 8) return 'error';
    return 'critical';
  }

  async createAlert(rule: {
    name: string;
    condition: string;
    threshold: number;
    timeWindow: number;
    actions: Array<{ type: string; config: any }>;
  }): Promise<string> {
    const ruleData = {
      name: rule.name,
      enabled: true,
      type: 'EVENT',
      test_definitions: [
        {
          text: rule.condition,
          magnitude: rule.threshold,
          timeframe: rule.timeWindow * 60 // Convert to seconds
        }
      ],
      responses: rule.actions.map(action => {
        switch (action.type) {
          case 'email':
            return {
              type: 'email',
              email: action.config.to,
              subject: action.config.subject
            };
          case 'webhook':
            return {
              type: 'webhook',
              url: action.config.url
            };
          default:
            return null;
        }
      }).filter(Boolean)
    };

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(ruleData);

      const options = {
        hostname: this.config.host,
        port: this.config.port,
        path: '/api/analytics/rules',
        method: 'POST',
        headers: {
          'SEC': this.config.token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        rejectUnauthorized: false
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
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
    // No persistent connection to close
  }
}