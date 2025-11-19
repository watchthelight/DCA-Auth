import { EventEmitter } from 'events';
import { WebClient } from '@slack/web-api';
import { App } from '@slack/bolt';

export class SlackIntegration extends EventEmitter {
  private client: WebClient;
  private app?: App;
  private config: any;
  private lastActivity: Date = new Date();
  private errorCount: number = 0;

  constructor(config: any) {
    super();
    this.config = config;
    this.client = new WebClient(config.token);

    if (config.signingSecret) {
      this.initializeBoltApp();
    }
  }

  private initializeBoltApp() {
    this.app = new App({
      token: this.config.token,
      signingSecret: this.config.signingSecret,
      socketMode: false
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.app) return;

    // Handle slash commands
    this.app.command('/dca-license', async ({ command, ack, respond }) => {
      await ack();

      const args = command.text.split(' ');
      const action = args[0];

      switch (action) {
        case 'check':
          await respond({
            text: 'Checking license status...',
            response_type: 'ephemeral'
          });
          break;
        case 'generate':
          await respond({
            text: 'Generating new license...',
            response_type: 'ephemeral'
          });
          break;
        default:
          await respond({
            text: 'Available commands: /dca-license check, /dca-license generate',
            response_type: 'ephemeral'
          });
      }
    });

    // Handle interactive components
    this.app.action('approve_license', async ({ body, ack, client }) => {
      await ack();
      // Handle license approval
      this.emit('action:approve_license', body);
    });

    this.app.action('reject_license', async ({ body, ack, client }) => {
      await ack();
      // Handle license rejection
      this.emit('action:reject_license', body);
    });
  }

  async sendEvent(event: any): Promise<void> {
    try {
      const message = this.formatEventMessage(event);
      const channel = this.getChannelForEvent(event);

      await this.sendMessage(message.text, channel, message.blocks);
      this.lastActivity = new Date();
    } catch (error) {
      this.errorCount++;
      this.emit('error', error);
      throw error;
    }
  }

  private formatEventMessage(event: any): { text: string; blocks?: any[] } {
    const emoji = this.getEmojiForEvent(event);
    const color = this.getColorForSeverity(event.metadata?.severity);

    const text = `${emoji} *${event.type.toUpperCase()} Event*: ${event.action}`;

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${event.type.toUpperCase()} Event`,
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Action:* ${event.action}\n*Time:* <!date^${Math.floor(event.metadata.timestamp.getTime() / 1000)}^{date_pretty} at {time}|${event.metadata.timestamp.toISOString()}>`
        }
      }
    ];

    // Add data fields
    if (event.data) {
      const fields = Object.entries(event.data)
        .slice(0, 5) // Limit to 5 fields
        .map(([key, value]) => ({
          type: 'mrkdwn',
          text: `*${key}:*\n${value}`
        }));

      if (fields.length > 0) {
        blocks.push({
          type: 'section',
          fields
        });
      }
    }

    // Add actions for certain events
    if (event.type === 'license' && event.action === 'pending_approval') {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Approve'
            },
            style: 'primary',
            action_id: 'approve_license',
            value: event.data.licenseId
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Reject'
            },
            style: 'danger',
            action_id: 'reject_license',
            value: event.data.licenseId
          }
        ]
      });
    }

    return { text, blocks };
  }

  private getEmojiForEvent(event: any): string {
    const emojiMap: Record<string, string> = {
      license: '🔑',
      user: '👤',
      activation: '✅',
      payment: '💳',
      alert: '🚨',
      audit: '📋'
    };

    return emojiMap[event.type] || '📢';
  }

  private getColorForSeverity(severity?: string): string {
    const colorMap: Record<string, string> = {
      info: '#36a64f',
      warning: '#ff9900',
      error: '#ff0000',
      critical: '#990000'
    };

    return colorMap[severity || 'info'] || '#808080';
  }

  private getChannelForEvent(event: any): string {
    if (event.metadata?.severity === 'critical' || event.metadata?.severity === 'error') {
      return this.config.channels.alerts;
    }

    if (event.type === 'audit') {
      return this.config.channels.audit;
    }

    return this.config.channels.notifications;
  }

  async sendMessage(text: string, channel?: string, blocks?: any[]): Promise<void> {
    try {
      await this.client.chat.postMessage({
        channel: channel || this.config.channels.notifications,
        text,
        blocks
      });
      this.lastActivity = new Date();
    } catch (error) {
      this.errorCount++;
      this.emit('error', error);
      throw error;
    }
  }

  async sendDirectMessage(userId: string, text: string, blocks?: any[]): Promise<void> {
    try {
      const response = await this.client.conversations.open({
        users: userId
      });

      if (response.channel?.id) {
        await this.sendMessage(text, response.channel.id, blocks);
      }
    } catch (error) {
      this.errorCount++;
      this.emit('error', error);
      throw error;
    }
  }

  async uploadFile(channels: string[], file: Buffer, filename: string, comment?: string): Promise<void> {
    try {
      await this.client.files.uploadV2({
        channels: channels.join(','),
        file,
        filename,
        initial_comment: comment
      });
      this.lastActivity = new Date();
    } catch (error) {
      this.errorCount++;
      this.emit('error', error);
      throw error;
    }
  }

  async createChannel(name: string, isPrivate: boolean = false): Promise<string> {
    try {
      const response = await this.client.conversations.create({
        name,
        is_private: isPrivate
      });

      return response.channel?.id || '';
    } catch (error) {
      this.errorCount++;
      this.emit('error', error);
      throw error;
    }
  }

  async inviteToChannel(channel: string, users: string[]): Promise<void> {
    try {
      await this.client.conversations.invite({
        channel,
        users: users.join(',')
      });
    } catch (error) {
      this.errorCount++;
      this.emit('error', error);
      throw error;
    }
  }

  async test(): Promise<any> {
    try {
      const response = await this.client.auth.test();
      return {
        team: response.team,
        user: response.user,
        team_id: response.team_id,
        user_id: response.user_id
      };
    } catch (error) {
      throw error;
    }
  }

  getStatus(): {
    enabled: boolean;
    connected: boolean;
    lastActivity: Date;
    errorCount: number;
  } {
    return {
      enabled: true,
      connected: true,
      lastActivity: this.lastActivity,
      errorCount: this.errorCount
    };
  }

  async disconnect(): Promise<void> {
    if (this.app) {
      await this.app.stop();
    }
  }
}