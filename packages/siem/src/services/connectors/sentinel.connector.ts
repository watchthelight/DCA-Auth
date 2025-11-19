import { MonitorIngestionClient } from '@azure/monitor-ingestion';
import { DefaultAzureCredential } from '@azure/identity';
import * as crypto from 'crypto';
import type { SIEMEvent } from '../siem.service';

export class SentinelConnector {
  private client?: MonitorIngestionClient;
  private config: {
    workspaceId: string;
    workspaceKey: string;
    logType: string;
    endpoint?: string;
  };

  constructor(config: {
    workspaceId: string;
    workspaceKey: string;
    logType: string;
    endpoint?: string;
  }) {
    this.config = config;

    // Initialize Azure Monitor client if endpoint is provided
    if (config.endpoint) {
      const credential = new DefaultAzureCredential();
      this.client = new MonitorIngestionClient(config.endpoint, credential);
    }
  }

  async send(events: SIEMEvent[]): Promise<void> {
    const logs = events.map(event => this.transformToSentinel(event));

    if (this.client && this.config.endpoint) {
      // Use Azure Monitor Ingestion API
      await this.client.upload(
        'DCL-dca-auth',
        'Custom-DCAAuth_CL',
        logs
      );
    } else {
      // Use HTTP Data Collector API
      await this.sendToLogAnalytics(logs);
    }
  }

  private transformToSentinel(event: SIEMEvent): any {
    return {
      TimeGenerated: event.timestamp.toISOString(),
      Severity: event.severity,
      Category: event.category,
      EventType: event.eventType,
      SourceService: event.source.service,
      SourceComponent: event.source.component,
      SourceHostname: event.source.hostname,
      SourceIP: event.source.ip || '',
      UserId: event.user?.id || '',
      UserEmail: event.user?.email || '',
      UserRole: event.user?.role || '',
      Details: JSON.stringify(event.details),
      CorrelationId: event.metadata?.correlationId || '',
      SessionId: event.metadata?.sessionId || '',
      RequestId: event.metadata?.requestId || '',
      OrganizationId: event.metadata?.organizationId || '',
      Tags: event.tags?.join(',') || ''
    };
  }

  private async sendToLogAnalytics(logs: any[]): Promise<void> {
    const https = require('https');
    const body = JSON.stringify(logs);
    const contentLength = Buffer.byteLength(body);

    const method = 'POST';
    const contentType = 'application/json';
    const resource = '/api/logs';
    const rfc1123date = new Date().toUTCString();
    const signature = this.buildSignature(
      method,
      contentLength,
      contentType,
      rfc1123date,
      resource
    );

    return new Promise((resolve, reject) => {
      const options = {
        hostname: `${this.config.workspaceId}.ods.opinsights.azure.com`,
        port: 443,
        path: `${resource}?api-version=2016-04-01`,
        method: method,
        headers: {
          'Content-Type': contentType,
          'Authorization': signature,
          'Log-Type': this.config.logType,
          'x-ms-date': rfc1123date,
          'time-generated-field': 'TimeGenerated'
        }
      };

      const req = https.request(options, (res: any) => {
        let data = '';

        res.on('data', (chunk: any) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 202) {
            resolve();
          } else {
            reject(new Error(`Sentinel returned status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  private buildSignature(
    method: string,
    contentLength: number,
    contentType: string,
    date: string,
    resource: string
  ): string {
    const xHeaders = `x-ms-date:${date}`;
    const stringToHash = `${method}\n${contentLength}\n${contentType}\n${xHeaders}\n${resource}`;

    const bytesToHash = Buffer.from(stringToHash, 'utf8');
    const keyBytes = Buffer.from(this.config.workspaceKey, 'base64');
    const hash = crypto.createHmac('sha256', keyBytes).update(bytesToHash).digest('base64');

    return `SharedKey ${this.config.workspaceId}:${hash}`;
  }

  async query(params: {
    startTime: Date;
    endTime: Date;
    categories?: string[];
    severity?: string[];
    users?: string[];
    limit?: number;
  }): Promise<SIEMEvent[]> {
    // Build KQL query
    let kql = `${this.config.logType}_CL
    | where TimeGenerated between (datetime('${params.startTime.toISOString()}') .. datetime('${params.endTime.toISOString()}'))`;

    if (params.categories?.length) {
      kql += `\n| where Category in (${params.categories.map(c => `'${c}'`).join(',')})`;
    }

    if (params.severity?.length) {
      kql += `\n| where Severity in (${params.severity.map(s => `'${s}'`).join(',')})`;
    }

    if (params.users?.length) {
      kql += `\n| where UserId in (${params.users.map(u => `'${u}'`).join(',')})`;
    }

    kql += `\n| take ${params.limit || 1000}
    | order by TimeGenerated desc`;

    // Execute query via Azure Monitor API
    const results = await this.executeKQLQuery(kql);
    return results.map(this.transformFromSentinel);
  }

  private async executeKQLQuery(query: string): Promise<any[]> {
    const https = require('https');

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ query });

      const options = {
        hostname: 'api.loganalytics.io',
        port: 443,
        path: `/v1/workspaces/${this.config.workspaceId}/query`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await this.getAccessToken()}`,
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
          resolve(response.tables?.[0]?.rows || []);
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  private async getAccessToken(): Promise<string> {
    const credential = new DefaultAzureCredential();
    const token = await credential.getToken('https://api.loganalytics.io/.default');
    return token.token;
  }

  private transformFromSentinel(row: any): SIEMEvent {
    return {
      timestamp: new Date(row.TimeGenerated),
      severity: row.Severity,
      category: row.Category,
      eventType: row.EventType,
      source: {
        service: row.SourceService,
        component: row.SourceComponent,
        hostname: row.SourceHostname,
        ip: row.SourceIP || undefined
      },
      user: row.UserId ? {
        id: row.UserId,
        email: row.UserEmail || undefined,
        role: row.UserRole || undefined
      } : undefined,
      details: row.Details ? JSON.parse(row.Details) : {},
      metadata: {
        correlationId: row.CorrelationId || undefined,
        sessionId: row.SessionId || undefined,
        requestId: row.RequestId || undefined,
        organizationId: row.OrganizationId || undefined
      },
      tags: row.Tags ? row.Tags.split(',') : []
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

    const alertRule = {
      location: 'eastus',
      properties: {
        displayName: rule.name,
        description: `DCA-Auth Alert: ${rule.name}`,
        severity: 2,
        enabled: true,
        query: `${this.config.logType}_CL | where ${rule.condition} | summarize count() by bin(TimeGenerated, ${rule.timeWindow}m)`,
        queryFrequency: `PT${rule.timeWindow}M`,
        queryPeriod: `PT${rule.timeWindow}M`,
        triggerOperator: 'GreaterThan',
        triggerThreshold: rule.threshold,
        tactics: ['InitialAccess', 'Persistence'],
        techniques: [],
        suppressionDuration: 'PT1H',
        suppressionEnabled: false,
        eventGroupingSettings: {
          aggregationKind: 'SingleAlert'
        },
        alertDetailsOverride: {
          alertDisplayNameFormat: `{{AlertName}} - {{TimeGenerated}}`
        }
      }
    };

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(alertRule);
      const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
      const resourceGroup = process.env.AZURE_RESOURCE_GROUP;
      const workspaceName = process.env.AZURE_WORKSPACE_NAME;

      const options = {
        hostname: 'management.azure.com',
        port: 443,
        path: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${workspaceName}/providers/Microsoft.SecurityInsights/alertRules/${rule.name.replace(/\s+/g, '-')}?api-version=2022-10-01-preview`,
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${await this.getManagementToken()}`,
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
          resolve(response.id || rule.name);
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  private async getManagementToken(): Promise<string> {
    const credential = new DefaultAzureCredential();
    const token = await credential.getToken('https://management.azure.com/.default');
    return token.token;
  }

  async disconnect(): Promise<void> {
    // No persistent connection to close
  }
}