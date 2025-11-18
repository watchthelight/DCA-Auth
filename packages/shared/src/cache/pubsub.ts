/**
 * Redis Pub/Sub Utilities
 *
 * Provides event-driven communication between services using Redis pub/sub.
 * Used for real-time updates, cache invalidation, and service coordination.
 */

import { getPublisher, getSubscriber } from './client.js';
import { logger } from '../utils/logger.js';

export type MessageHandler<T = unknown> = (message: T, channel: string) => void | Promise<void>;

export interface PubSubOptions {
  serialize?: boolean;
  logMessages?: boolean;
}

export class PubSub {
  private publisher = getPublisher();
  private subscriber = getSubscriber();
  private handlers = new Map<string, Set<MessageHandler>>();
  private options: PubSubOptions;

  constructor(options: PubSubOptions = {}) {
    this.options = {
      serialize: true,
      logMessages: false,
      ...options,
    };

    this.setupListeners();
  }

  /**
   * Set up Redis message listeners
   */
  private setupListeners(): void {
    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleMessage(channel, message);
    });

    this.subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
      this.handleMessage(channel, message, pattern);
    });

    this.subscriber.on('error', (error) => {
      logger.error('PubSub subscriber error:', error);
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(channel: string, message: string, pattern?: string): void {
    if (this.options.logMessages) {
      logger.debug(`Message received on ${channel}${pattern ? ` (pattern: ${pattern})` : ''}:`, message);
    }

    const handlers = this.handlers.get(channel) || new Set();
    const patternHandlers = pattern ? this.handlers.get(pattern) || new Set() : new Set();

    const allHandlers = new Set([...handlers, ...patternHandlers]);

    if (allHandlers.size === 0) {
      logger.warn(`No handlers for channel ${channel}`);
      return;
    }

    let parsedMessage: unknown = message;
    if (this.options.serialize) {
      try {
        parsedMessage = JSON.parse(message);
      } catch {
        // If parsing fails, use raw message
        parsedMessage = message;
      }
    }

    allHandlers.forEach((handler) => {
      try {
        const typedHandler = handler as MessageHandler;
        const result = typedHandler(parsedMessage, channel);
        if (result instanceof Promise) {
          result.catch((error) => {
            logger.error(`Async handler error for channel ${channel}:`, error);
          });
        }
      } catch (error) {
        logger.error(`Handler error for channel ${channel}:`, error);
      }
    });
  }

  /**
   * Subscribe to a channel
   */
  async subscribe<T = unknown>(channel: string, handler: MessageHandler<T>): Promise<void> {
    try {
      if (!this.handlers.has(channel)) {
        this.handlers.set(channel, new Set());
        await this.subscriber.subscribe(channel);
        logger.info(`Subscribed to channel: ${channel}`);
      }

      this.handlers.get(channel)!.add(handler as MessageHandler);
    } catch (error) {
      logger.error(`Failed to subscribe to channel ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to a pattern
   */
  async psubscribe<T = unknown>(pattern: string, handler: MessageHandler<T>): Promise<void> {
    try {
      if (!this.handlers.has(pattern)) {
        this.handlers.set(pattern, new Set());
        await this.subscriber.psubscribe(pattern);
        logger.info(`Subscribed to pattern: ${pattern}`);
      }

      this.handlers.get(pattern)!.add(handler as MessageHandler);
    } catch (error) {
      logger.error(`Failed to subscribe to pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    try {
      const handlers = this.handlers.get(channel);
      if (!handlers) {
        return;
      }

      if (handler) {
        handlers.delete(handler);
      }

      if (!handler || handlers.size === 0) {
        this.handlers.delete(channel);
        await this.subscriber.unsubscribe(channel);
        logger.info(`Unsubscribed from channel: ${channel}`);
      }
    } catch (error) {
      logger.error(`Failed to unsubscribe from channel ${channel}:`, error);
    }
  }

  /**
   * Unsubscribe from a pattern
   */
  async punsubscribe(pattern: string, handler?: MessageHandler): Promise<void> {
    try {
      const handlers = this.handlers.get(pattern);
      if (!handlers) {
        return;
      }

      if (handler) {
        handlers.delete(handler);
      }

      if (!handler || handlers.size === 0) {
        this.handlers.delete(pattern);
        await this.subscriber.punsubscribe(pattern);
        logger.info(`Unsubscribed from pattern: ${pattern}`);
      }
    } catch (error) {
      logger.error(`Failed to unsubscribe from pattern ${pattern}:`, error);
    }
  }

  /**
   * Publish a message to a channel
   */
  async publish<T = unknown>(channel: string, message: T): Promise<number> {
    try {
      const serialized = this.options.serialize
        ? JSON.stringify(message)
        : String(message);

      const receivers = await this.publisher.publish(channel, serialized);

      if (this.options.logMessages) {
        logger.debug(`Published to ${channel} (${receivers} receivers):`, serialized);
      }

      return receivers;
    } catch (error) {
      logger.error(`Failed to publish to channel ${channel}:`, error);
      return 0;
    }
  }

  /**
   * Unsubscribe from all channels and patterns
   */
  async unsubscribeAll(): Promise<void> {
    try {
      await this.subscriber.unsubscribe();
      await this.subscriber.punsubscribe();
      this.handlers.clear();
      logger.info('Unsubscribed from all channels and patterns');
    } catch (error) {
      logger.error('Failed to unsubscribe from all:', error);
    }
  }

  /**
   * Get list of subscribed channels
   */
  getSubscribedChannels(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get subscriber count for a channel
   */
  getHandlerCount(channel: string): number {
    return this.handlers.get(channel)?.size || 0;
  }
}

// Export default PubSub instance
export const pubsub = new PubSub();

// Define common event channels
export const EventChannels = {
  LICENSE_CREATED: 'license:created',
  LICENSE_ACTIVATED: 'license:activated',
  LICENSE_REVOKED: 'license:revoked',
  LICENSE_EXPIRED: 'license:expired',
  USER_ROLE_CHANGED: 'user:role:changed',
  USER_LOGGED_IN: 'user:logged:in',
  USER_LOGGED_OUT: 'user:logged:out',
  CACHE_INVALIDATE: 'cache:invalidate',
  SYSTEM_ALERT: 'system:alert',
} as const;

export type EventChannel = (typeof EventChannels)[keyof typeof EventChannels];

// Type-safe event publishing helpers
export async function publishLicenseEvent(
  event: 'created' | 'activated' | 'revoked' | 'expired',
  data: unknown
): Promise<void> {
  await pubsub.publish(`license:${event}`, data);
}

export async function publishUserEvent(
  event: 'role:changed' | 'logged:in' | 'logged:out',
  data: unknown
): Promise<void> {
  await pubsub.publish(`user:${event}`, data);
}

export async function publishCacheInvalidation(keys: string[]): Promise<void> {
  await pubsub.publish(EventChannels.CACHE_INVALIDATE, { keys });
}