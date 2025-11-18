import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';
import { RedisService } from '../../services/redis.service';
import { HttpService } from '@nestjs/axios';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';

export enum WebhookEvent {
  LICENSE_CREATED = 'license.created',
  LICENSE_ACTIVATED = 'license.activated',
  LICENSE_DEACTIVATED = 'license.deactivated',
  LICENSE_EXPIRED = 'license.expired',
  LICENSE_REVOKED = 'license.revoked',
  USER_REGISTERED = 'user.registered',
  USER_LOGIN = 'user.login',
  USER_ROLE_CHANGED = 'user.role_changed',
  ACTIVATION_LIMIT_REACHED = 'activation.limit_reached',
  SUSPICIOUS_ACTIVITY = 'security.suspicious_activity',
}

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: any;
  metadata?: Record<string, any>;
}

interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  headers?: Record<string, string>;
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
  };
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly webhookConfigs: Map<string, WebhookConfig> = new Map();
  private readonly retryQueue: Map<string, any> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly httpService: HttpService,
  ) {
    this.loadWebhooks();
    this.startRetryProcessor();
  }

  private async loadWebhooks() {
    try {
      const webhooks = await this.prisma.webhook.findMany({
        where: { active: true },
      });

      for (const webhook of webhooks) {
        this.webhookConfigs.set(webhook.id, {
          id: webhook.id,
          url: webhook.url,
          secret: webhook.secret,
          events: webhook.events as WebhookEvent[],
          active: webhook.active,
          headers: webhook.headers as Record<string, string>,
          retryPolicy: {
            maxAttempts: webhook.maxRetries || 3,
            backoffMs: webhook.retryDelayMs || 1000,
          },
        });
      }

      this.logger.log(`Loaded ${this.webhookConfigs.size} active webhooks`);
    } catch (error) {
      this.logger.error('Failed to load webhooks', error);
    }
  }

  async emit(event: WebhookEvent, data: any, metadata?: Record<string, any>) {
    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
      metadata,
    };

    // Get all webhooks subscribed to this event
    const subscribedWebhooks = Array.from(this.webhookConfigs.values()).filter(
      webhook => webhook.active && webhook.events.includes(event),
    );

    // Send webhooks asynchronously
    await Promise.allSettled(
      subscribedWebhooks.map(webhook => this.sendWebhook(webhook, payload)),
    );
  }

  private async sendWebhook(
    webhook: WebhookConfig,
    payload: WebhookPayload,
    attempt: number = 1,
  ): Promise<void> {
    try {
      // Generate signature
      const signature = this.generateSignature(payload, webhook.secret);

      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': payload.event,
        'X-Webhook-Timestamp': payload.timestamp,
        'X-Webhook-ID': crypto.randomUUID(),
        'X-Webhook-Attempt': attempt.toString(),
        ...webhook.headers,
      };

      // Send webhook
      const response = await firstValueFrom(
        this.httpService.post(webhook.url, payload, {
          headers,
          timeout: 10000, // 10 seconds timeout
        }),
      );

      // Log success
      await this.logWebhookDelivery(webhook.id, payload, response.status, attempt);

      // Update metrics
      await this.redis.incr(`webhook:success:${webhook.id}`);
    } catch (error) {
      this.logger.error(
        `Webhook delivery failed for ${webhook.id} (attempt ${attempt})`,
        error.message,
      );

      // Log failure
      await this.logWebhookDelivery(
        webhook.id,
        payload,
        error.response?.status || 0,
        attempt,
        error.message,
      );

      // Update metrics
      await this.redis.incr(`webhook:failure:${webhook.id}`);

      // Retry if needed
      if (attempt < webhook.retryPolicy.maxAttempts) {
        await this.scheduleRetry(webhook, payload, attempt + 1);
      } else {
        // Max retries reached, send to DLQ
        await this.sendToDeadLetterQueue(webhook, payload, error.message);
      }
    }
  }

  private async scheduleRetry(
    webhook: WebhookConfig,
    payload: WebhookPayload,
    nextAttempt: number,
  ) {
    const delay = webhook.retryPolicy.backoffMs * Math.pow(2, nextAttempt - 1);
    const retryKey = `retry:${webhook.id}:${Date.now()}`;

    // Store in retry queue
    this.retryQueue.set(retryKey, {
      webhook,
      payload,
      nextAttempt,
      scheduledAt: Date.now() + delay,
    });

    // Also persist to Redis for durability
    await this.redis.setex(
      retryKey,
      3600, // 1 hour TTL
      JSON.stringify({
        webhookId: webhook.id,
        payload,
        nextAttempt,
        scheduledAt: Date.now() + delay,
      }),
    );
  }

  private startRetryProcessor() {
    setInterval(async () => {
      const now = Date.now();

      for (const [key, retry] of this.retryQueue.entries()) {
        if (retry.scheduledAt <= now) {
          this.retryQueue.delete(key);
          await this.sendWebhook(retry.webhook, retry.payload, retry.nextAttempt);
        }
      }
    }, 1000); // Check every second
  }

  private generateSignature(payload: WebhookPayload, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  static verifySignature(
    payload: any,
    signature: string,
    secret: string,
  ): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  private async logWebhookDelivery(
    webhookId: string,
    payload: WebhookPayload,
    statusCode: number,
    attempt: number,
    error?: string,
  ) {
    try {
      await this.prisma.webhookDelivery.create({
        data: {
          webhookId,
          event: payload.event,
          payload: payload as any,
          statusCode,
          attempt,
          success: statusCode >= 200 && statusCode < 300,
          error,
          deliveredAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.error('Failed to log webhook delivery', err);
    }
  }

  private async sendToDeadLetterQueue(
    webhook: WebhookConfig,
    payload: WebhookPayload,
    error: string,
  ) {
    try {
      await this.prisma.webhookDLQ.create({
        data: {
          webhookId: webhook.id,
          event: payload.event,
          payload: payload as any,
          error,
          maxAttemptsReached: true,
          createdAt: new Date(),
        },
      });

      this.logger.warn(
        `Webhook ${webhook.id} sent to DLQ after max retries for event ${payload.event}`,
      );
    } catch (err) {
      this.logger.error('Failed to send to DLQ', err);
    }
  }

  async registerWebhook(
    url: string,
    events: WebhookEvent[],
    secret?: string,
  ): Promise<string> {
    const webhook = await this.prisma.webhook.create({
      data: {
        url,
        events,
        secret: secret || crypto.randomBytes(32).toString('hex'),
        active: true,
        maxRetries: 3,
        retryDelayMs: 1000,
      },
    });

    // Add to active configs
    this.webhookConfigs.set(webhook.id, {
      id: webhook.id,
      url: webhook.url,
      secret: webhook.secret,
      events: webhook.events as WebhookEvent[],
      active: true,
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: 1000,
      },
    });

    return webhook.id;
  }

  async unregisterWebhook(webhookId: string): Promise<void> {
    await this.prisma.webhook.update({
      where: { id: webhookId },
      data: { active: false },
    });

    this.webhookConfigs.delete(webhookId);
  }

  async getWebhookStats(webhookId: string): Promise<any> {
    const [success, failure, deliveries] = await Promise.all([
      this.redis.get(`webhook:success:${webhookId}`),
      this.redis.get(`webhook:failure:${webhookId}`),
      this.prisma.webhookDelivery.findMany({
        where: { webhookId },
        orderBy: { deliveredAt: 'desc' },
        take: 100,
      }),
    ]);

    return {
      totalSuccess: parseInt(success || '0'),
      totalFailure: parseInt(failure || '0'),
      recentDeliveries: deliveries,
      successRate:
        success && failure
          ? (parseInt(success) / (parseInt(success) + parseInt(failure))) * 100
          : 0,
    };
  }
}