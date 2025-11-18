/**
 * Cache Utility Functions
 *
 * Provides type-safe cache operations with automatic serialization,
 * TTL management, and comprehensive error handling.
 */

import serialize from 'serialize-javascript';

import { getRedisClient } from './client.js';
import { logger } from '../logging/logger.js';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
  compress?: boolean;
}

export class Cache {
  private client = getRedisClient();
  private defaultTTL: number;
  private prefix: string;

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.ttl || 3600; // 1 hour default
    this.prefix = options.prefix || '';
  }

  /**
   * Build a cache key with optional prefix
   */
  private buildKey(key: string): string {
    return this.prefix ? `${this.prefix}:${key}` : key;
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key);
      const value = await this.client.get(fullKey);

      if (!value) {
        logger.debug(`Cache miss: ${fullKey}`);
        return null;
      }

      logger.debug(`Cache hit: ${fullKey}`);
      // Use Function constructor instead of eval for safer execution
      const deserializer = new Function('return ' + value);
      return deserializer() as T;
    } catch (error) {
      logger.error(`Cache get error for ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key);
      const serialized = serialize(value);
      const expiry = ttl !== undefined ? ttl : this.defaultTTL;

      if (expiry > 0) {
        await this.client.setex(fullKey, expiry, serialized);
      } else {
        await this.client.set(fullKey, serialized);
      }

      logger.debug(`Cache set: ${fullKey} (TTL: ${expiry}s)`);
      return true;
    } catch (error) {
      logger.error(`Cache set error for ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete one or more keys from cache
   */
  async delete(key: string | string[]): Promise<number> {
    try {
      const keys = Array.isArray(key) ? key : [key];
      const fullKeys = keys.map((k) => this.buildKey(k));

      if (fullKeys.length === 0) {
        return 0;
      }

      const result = await this.client.del(...fullKeys);
      logger.debug(`Cache delete: ${fullKeys.join(', ')} (deleted: ${result})`);
      return result;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return 0;
    }
  }

  /**
   * Check if a key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key);
      const exists = await this.client.exists(fullKey);
      return exists === 1;
    } catch (error) {
      logger.error(`Cache exists error for ${key}:`, error);
      return false;
    }
  }

  /**
   * Get TTL for a key in seconds
   */
  async ttl(key: string): Promise<number> {
    try {
      const fullKey = this.buildKey(key);
      return await this.client.ttl(fullKey);
    } catch (error) {
      logger.error(`Cache TTL error for ${key}:`, error);
      return -1;
    }
  }

  /**
   * Extend TTL for a key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.client.expire(fullKey, seconds);
      return result === 1;
    } catch (error) {
      logger.error(`Cache expire error for ${key}:`, error);
      return false;
    }
  }

  /**
   * Increment a numeric value
   */
  async increment(key: string, by: number = 1): Promise<number | null> {
    try {
      const fullKey = this.buildKey(key);
      return await this.client.incrby(fullKey, by);
    } catch (error) {
      logger.error(`Cache increment error for ${key}:`, error);
      return null;
    }
  }

  /**
   * Decrement a numeric value
   */
  async decrement(key: string, by: number = 1): Promise<number | null> {
    try {
      const fullKey = this.buildKey(key);
      return await this.client.decrby(fullKey, by);
    } catch (error) {
      logger.error(`Cache decrement error for ${key}:`, error);
      return null;
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      if (keys.length === 0) {
        return [];
      }

      const fullKeys = keys.map((k) => this.buildKey(k));
      const values = await this.client.mget(...fullKeys);

      return values.map((value, index) => {
        if (!value) {
          logger.debug(`Cache miss: ${fullKeys[index]}`);
          return null;
        }

        try {
          logger.debug(`Cache hit: ${fullKeys[index]}`);
          const deserializer = new Function('return ' + value);
          return deserializer() as T;
        } catch {
          return null;
        }
      });
    } catch (error) {
      logger.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Flush cache (clear all keys with prefix or entire DB)
   */
  async flush(): Promise<void> {
    try {
      if (this.prefix) {
        const pattern = `${this.prefix}:*`;
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
        logger.info(`Cache flushed for prefix: ${this.prefix}`);
      } else {
        await this.client.flushdb();
        logger.info('Entire cache database flushed');
      }
    } catch (error) {
      logger.error('Cache flush error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<Record<string, string | number>> {
    try {
      const info = await this.client.info('stats');
      const dbSize = await this.client.dbsize();
      return {
        dbSize,
        info,
      };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return {};
    }
  }
}

// Export pre-configured cache instances
export const generalCache = new Cache({ prefix: 'cache' });
export const sessionCache = new Cache({ prefix: 'session', ttl: 86400 });
export const rateLimitCache = new Cache({ prefix: 'ratelimit', ttl: 60 });