import { EventEmitter } from 'events';
import { SlackIntegration } from './connectors/slack.integration';
import { TeamsIntegration } from './connectors/teams.integration';
import { GitHubIntegration } from './connectors/github.integration';
import { JiraIntegration } from './connectors/jira.integration';
import { DiscordIntegration } from './connectors/discord.integration';
import { WebhookIntegration } from './connectors/webhook.integration';
import { EmailIntegration } from './connectors/email.integration';
import { ZapierIntegration } from './connectors/zapier.integration';
import { SalesforceIntegration } from './connectors/salesforce.integration';
import { HubSpotIntegration } from './connectors/hubspot.integration';

export interface IntegrationConfig {
  slack?: {
    enabled: boolean;
    token: string;
    signingSecret: string;
    channels: {
      alerts: string;
      notifications: string;
      audit: string;
    };
  };
  teams?: {
    enabled: boolean;
    tenantId: string;
    clientId: string;
    clientSecret: string;
    webhookUrl?: string;
  };
  github?: {
    enabled: boolean;
    token: string;
    organization?: string;
    repositories?: string[];
  };
  jira?: {
    enabled: boolean;
    host: string;
    username: string;
    password: string;
    projectKey: string;
  };
  discord?: {
    enabled: boolean;
    token: string;
    guildId: string;
    channels: {
      alerts: string;
      notifications: string;
    };
  };
  email?: {
    enabled: boolean;
    provider: 'sendgrid' | 'mailgun' | 'smtp';
    config: any;
  };
  webhooks?: {
    enabled: boolean;
    endpoints: Array<{
      name: string;
      url: string;
      events: string[];
      headers?: Record<string, string>;
      secret?: string;
    }>;
  };
  zapier?: {
    enabled: boolean;
    apiKey: string;
    hookUrl?: string;
  };
  salesforce?: {
    enabled: boolean;
    instanceUrl: string;
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
  };
  hubspot?: {
    enabled: boolean;
    apiKey: string;
    portalId: string;
  };
}

export interface IntegrationEvent {
  type: 'license' | 'user' | 'activation' | 'payment' | 'alert' | 'audit';
  action: string;
  data: any;
  metadata?: {
    userId?: string;
    organizationId?: string;
    timestamp: Date;
    severity?: 'info' | 'warning' | 'error' | 'critical';
  };
}

export class IntegrationsService extends EventEmitter {
  private config: IntegrationConfig;
  private integrations: Map<string, any> = new Map();
  private eventQueue: IntegrationEvent[] = [];
  private isProcessing = false;
  private metrics = {
    eventsSent: 0,
    eventsFailed: 0,
    integrationErrors: 0
  };

  constructor(config: IntegrationConfig) {
    super();
    this.config = config;
    this.initializeIntegrations();
    this.startEventProcessor();
  }

  private initializeIntegrations() {
    // Initialize Slack
    if (this.config.slack?.enabled) {
      const slack = new SlackIntegration(this.config.slack);
      this.integrations.set('slack', slack);

      slack.on('error', (error) => {
        this.handleIntegrationError('slack', error);
      });
    }

    // Initialize Microsoft Teams
    if (this.config.teams?.enabled) {
      const teams = new TeamsIntegration(this.config.teams);
      this.integrations.set('teams', teams);

      teams.on('error', (error) => {
        this.handleIntegrationError('teams', error);
      });
    }

    // Initialize GitHub
    if (this.config.github?.enabled) {
      const github = new GitHubIntegration(this.config.github);
      this.integrations.set('github', github);

      github.on('error', (error) => {
        this.handleIntegrationError('github', error);
      });
    }

    // Initialize Jira
    if (this.config.jira?.enabled) {
      const jira = new JiraIntegration(this.config.jira);
      this.integrations.set('jira', jira);

      jira.on('error', (error) => {
        this.handleIntegrationError('jira', error);
      });
    }

    // Initialize Discord
    if (this.config.discord?.enabled) {
      const discord = new DiscordIntegration(this.config.discord);
      this.integrations.set('discord', discord);

      discord.on('error', (error) => {
        this.handleIntegrationError('discord', error);
      });
    }

    // Initialize Email
    if (this.config.email?.enabled) {
      const email = new EmailIntegration(this.config.email);
      this.integrations.set('email', email);

      email.on('error', (error) => {
        this.handleIntegrationError('email', error);
      });
    }

    // Initialize Webhooks
    if (this.config.webhooks?.enabled) {
      const webhooks = new WebhookIntegration(this.config.webhooks);
      this.integrations.set('webhooks', webhooks);

      webhooks.on('error', (error) => {
        this.handleIntegrationError('webhooks', error);
      });
    }

    // Initialize Zapier
    if (this.config.zapier?.enabled) {
      const zapier = new ZapierIntegration(this.config.zapier);
      this.integrations.set('zapier', zapier);

      zapier.on('error', (error) => {
        this.handleIntegrationError('zapier', error);
      });
    }

    // Initialize Salesforce
    if (this.config.salesforce?.enabled) {
      const salesforce = new SalesforceIntegration(this.config.salesforce);
      this.integrations.set('salesforce', salesforce);

      salesforce.on('error', (error) => {
        this.handleIntegrationError('salesforce', error);
      });
    }

    // Initialize HubSpot
    if (this.config.hubspot?.enabled) {
      const hubspot = new HubSpotIntegration(this.config.hubspot);
      this.integrations.set('hubspot', hubspot);

      hubspot.on('error', (error) => {
        this.handleIntegrationError('hubspot', error);
      });
    }
  }

  private handleIntegrationError(integration: string, error: Error) {
    this.metrics.integrationErrors++;
    this.emit('integration:error', { integration, error });
    console.error(`Integration error [${integration}]:`, error);
  }

  private startEventProcessor() {
    setInterval(() => {
      if (!this.isProcessing && this.eventQueue.length > 0) {
        this.processEventQueue();
      }
    }, 1000); // Process queue every second
  }

  private async processEventQueue() {
    this.isProcessing = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;

      try {
        await this.sendEventToIntegrations(event);
        this.metrics.eventsSent++;
      } catch (error) {
        this.metrics.eventsFailed++;
        this.emit('event:failed', { event, error });
      }
    }

    this.isProcessing = false;
  }

  private async sendEventToIntegrations(event: IntegrationEvent) {
    const promises: Promise<void>[] = [];

    for (const [name, integration] of this.integrations) {
      promises.push(
        integration.sendEvent(event).catch((error: any) => {
          console.error(`Failed to send event to ${name}:`, error);
        })
      );
    }

    await Promise.all(promises);
  }

  // Public methods for sending events
  async sendEvent(event: IntegrationEvent): Promise<void> {
    // Add to queue for processing
    this.eventQueue.push(event);
    this.emit('event:queued', event);
  }

  async sendLicenseEvent(action: string, licenseData: any): Promise<void> {
    await this.sendEvent({
      type: 'license',
      action,
      data: licenseData,
      metadata: {
        timestamp: new Date(),
        severity: 'info'
      }
    });
  }

  async sendUserEvent(action: string, userData: any): Promise<void> {
    await this.sendEvent({
      type: 'user',
      action,
      data: userData,
      metadata: {
        userId: userData.id,
        timestamp: new Date(),
        severity: 'info'
      }
    });
  }

  async sendAlert(message: string, severity: 'warning' | 'error' | 'critical', details?: any): Promise<void> {
    await this.sendEvent({
      type: 'alert',
      action: 'alert',
      data: {
        message,
        details
      },
      metadata: {
        timestamp: new Date(),
        severity
      }
    });
  }

  async sendNotification(title: string, message: string, target?: string): Promise<void> {
    const notification = {
      title,
      message,
      target,
      timestamp: new Date()
    };

    // Send to specific integrations based on target
    if (target === 'slack' && this.integrations.has('slack')) {
      await this.integrations.get('slack').sendMessage(message);
    } else if (target === 'teams' && this.integrations.has('teams')) {
      await this.integrations.get('teams').sendMessage(title, message);
    } else if (target === 'discord' && this.integrations.has('discord')) {
      await this.integrations.get('discord').sendMessage(message);
    } else {
      // Send to all messaging integrations
      await this.sendEvent({
        type: 'alert',
        action: 'notification',
        data: notification,
        metadata: {
          timestamp: new Date(),
          severity: 'info'
        }
      });
    }
  }

  // Integration-specific methods
  async createJiraTicket(summary: string, description: string, issueType: string = 'Bug'): Promise<string> {
    const jira = this.integrations.get('jira');
    if (!jira) {
      throw new Error('Jira integration not enabled');
    }

    return jira.createIssue({
      summary,
      description,
      issueType
    });
  }

  async createGitHubIssue(title: string, body: string, labels?: string[]): Promise<number> {
    const github = this.integrations.get('github');
    if (!github) {
      throw new Error('GitHub integration not enabled');
    }

    return github.createIssue({
      title,
      body,
      labels
    });
  }

  async sendSlackMessage(channel: string, message: string, blocks?: any[]): Promise<void> {
    const slack = this.integrations.get('slack');
    if (!slack) {
      throw new Error('Slack integration not enabled');
    }

    await slack.sendMessage(message, channel, blocks);
  }

  async sendEmail(to: string, subject: string, body: string, html?: string): Promise<void> {
    const email = this.integrations.get('email');
    if (!email) {
      throw new Error('Email integration not enabled');
    }

    await email.send({
      to,
      subject,
      text: body,
      html: html || body
    });
  }

  async triggerWebhook(name: string, data: any): Promise<void> {
    const webhooks = this.integrations.get('webhooks');
    if (!webhooks) {
      throw new Error('Webhook integration not enabled');
    }

    await webhooks.trigger(name, data);
  }

  async syncToSalesforce(objectType: string, data: any): Promise<string> {
    const salesforce = this.integrations.get('salesforce');
    if (!salesforce) {
      throw new Error('Salesforce integration not enabled');
    }

    return salesforce.syncObject(objectType, data);
  }

  async createHubSpotContact(email: string, properties: any): Promise<string> {
    const hubspot = this.integrations.get('hubspot');
    if (!hubspot) {
      throw new Error('HubSpot integration not enabled');
    }

    return hubspot.createContact({
      email,
      ...properties
    });
  }

  // OAuth and authentication helpers
  async getOAuthUrl(integration: string, redirectUri: string): Promise<string> {
    const integrationInstance = this.integrations.get(integration);
    if (!integrationInstance) {
      throw new Error(`Integration ${integration} not found`);
    }

    if (!integrationInstance.getOAuthUrl) {
      throw new Error(`Integration ${integration} does not support OAuth`);
    }

    return integrationInstance.getOAuthUrl(redirectUri);
  }

  async handleOAuthCallback(integration: string, code: string, state?: string): Promise<any> {
    const integrationInstance = this.integrations.get(integration);
    if (!integrationInstance) {
      throw new Error(`Integration ${integration} not found`);
    }

    if (!integrationInstance.handleOAuthCallback) {
      throw new Error(`Integration ${integration} does not support OAuth`);
    }

    return integrationInstance.handleOAuthCallback(code, state);
  }

  // Test integrations
  async testIntegration(name: string): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    const integration = this.integrations.get(name);
    if (!integration) {
      return {
        success: false,
        message: `Integration ${name} not found or not enabled`
      };
    }

    try {
      const result = await integration.test();
      return {
        success: true,
        message: `Integration ${name} is working`,
        details: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Integration ${name} test failed`,
        details: error.message
      };
    }
  }

  async testAllIntegrations(): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    for (const [name, integration] of this.integrations) {
      results[name] = await this.testIntegration(name);
    }

    return results;
  }

  // Metrics and monitoring
  getMetrics() {
    return {
      ...this.metrics,
      queueSize: this.eventQueue.length,
      activeIntegrations: Array.from(this.integrations.keys()),
      isProcessing: this.isProcessing
    };
  }

  async getIntegrationStatus(name: string): Promise<{
    enabled: boolean;
    connected: boolean;
    lastActivity?: Date;
    errorCount: number;
  }> {
    const integration = this.integrations.get(name);
    if (!integration) {
      return {
        enabled: false,
        connected: false,
        errorCount: 0
      };
    }

    return integration.getStatus();
  }

  // Cleanup
  async disconnect(): Promise<void> {
    for (const [name, integration] of this.integrations) {
      if (integration.disconnect) {
        await integration.disconnect();
      }
    }

    this.emit('disconnected');
  }
}