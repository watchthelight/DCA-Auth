/**
 * Rate Limiting Utilities
 *
 * Implements sliding window rate limiting using Redis sorted sets
 * for accurate and efficient request rate control.
 */

import { getRedisClient } from './client.js';
import { logger } from '../logging/logger.js';

export interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds
  maxRequests?: number; // Maximum requests in window
  keyPrefix?: string; // Prefix for rate limit keys
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // Milliseconds until next allowed request
}

export class RateLimiter {
  private client = getRedisClient();
  private windowMs: number;
  private maxRequests: number;
  private keyPrefix: string;

  constructor(options: RateLimitOptions = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.maxRequests = options.maxRequests || 60; // 60 requests default
    this.keyPrefix = options.keyPrefix || 'ratelimit';
  }

  /**
   * Build rate limit key
   */
  private buildKey(identifier: string): string {
    return `${this.keyPrefix}:${identifier}`;
  }

  /**
   * Check if request is allowed based on rate limit
   */
  async checkLimit(identifier: string, cost: number = 1): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const key = this.buildKey(identifier);

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.client.pipeline();

      // Remove old entries outside the window
      pipeline.zremrangebyscore(key, '-inf', windowStart);

      // Count current requests in window
      pipeline.zcard(key);

      // Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);

      // Set expiry on key
      pipeline.expire(key, Math.ceil(this.windowMs / 1000));

      // Execute pipeline
      const results = await pipeline.exec();

      if (!results) {
        throw new Error('Pipeline execution failed');
      }

      // Get count before adding new request
      const count = (results[1]?.[1] as number) || 0;
      const newCount = count + cost;

      const allowed = newCount <= this.maxRequests;
      const remaining = Math.max(0, this.maxRequests - newCount);

      // Calculate reset time (end of current window)
      const resetAt = new Date(now + this.windowMs);

      // Calculate retry after if rate limited
      let retryAfter: number | undefined;
      if (!allowed) {
        // Find the oldest request in the window that would need to expire
        const oldestKey = await this.client.zrange(key, 0, 0, 'WITHSCORES');
        if (oldestKey && oldestKey.length >= 2) {
          const oldestTime = parseFloat(oldestKey[1]);
          retryAfter = Math.ceil(oldestTime + this.windowMs - now);
        }

        logger.warn(
          `Rate limit exceeded for ${identifier}: ${newCount}/${this.maxRequests}`
        );
      }

      return {
        allowed,
        limit: this.maxRequests,
        remaining,
        resetAt,
        retryAfter,
      };
    } catch (error) {
      logger.error('Rate limit check error:', error);
      // Fail open in case of Redis errors (allow request)
      return {
        allowed: true,
        limit: this.maxRequests,
        remaining: this.maxRequests,
        resetAt: new Date(now + this.windowMs),
      };
    }
  }

  /**
   * Reset rate limit for identifier
   */
  async reset(identifier: string): Promise<void> {
    const key = this.buildKey(identifier);

    try {
      await this.client.del(key);
      logger.debug(`Rate limit reset for ${identifier}`);
    } catch (error) {
      logger.error('Rate limit reset error:', error);
    }
  }

  /**
   * Get current usage for identifier
   */
  async getUsage(identifier: string): Promise<{
    current: number;
    limit: number;
    resetAt: Date;
  }> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const key = this.buildKey(identifier);

    try {
      // Remove old entries and count current
      const pipeline = this.client.pipeline();
      pipeline.zremrangebyscore(key, '-inf', windowStart);
      pipeline.zcard(key);

      const results = await pipeline.exec();
      const current = (results?.[1]?.[1] as number) || 0;

      return {
        current,
        limit: this.maxRequests,
        resetAt: new Date(now + this.windowMs),
      };
    } catch (error) {
      logger.error('Rate limit usage check error:', error);
      return {
        current: 0,
        limit: this.maxRequests,
        resetAt: new Date(now + this.windowMs),
      };
    }
  }

  /**
   * Block identifier for a specific duration
   */
  async block(identifier: string, durationMs: number): Promise<void> {
    const key = `${this.keyPrefix}:blocked:${identifier}`;
    const ttl = Math.ceil(durationMs / 1000);

    try {
      await this.client.setex(key, ttl, '1');
      logger.info(`Blocked ${identifier} for ${ttl} seconds`);
    } catch (error) {
      logger.error('Rate limit block error:', error);
    }
  }

  /**
   * Check if identifier is blocked
   */
  async isBlocked(identifier: string): Promise<boolean> {
    const key = `${this.keyPrefix}:blocked:${identifier}`;

    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Rate limit block check error:', error);
      return false;
    }
  }

  /**
   * Unblock identifier
   */
  async unblock(identifier: string): Promise<void> {
    const key = `${this.keyPrefix}:blocked:${identifier}`;

    try {
      await this.client.del(key);
      logger.info(`Unblocked ${identifier}`);
    } catch (error) {
      logger.error('Rate limit unblock error:', error);
    }
  }
}

// Export pre-configured rate limiters for different use cases
export const apiRateLimiter = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 60, // 60 requests per minute
  keyPrefix: 'ratelimit:api',
});

export const authRateLimiter = new RateLimiter({
  windowMs: 900000, // 15 minutes
  maxRequests: 5, // 5 attempts per 15 minutes
  keyPrefix: 'ratelimit:auth',
});

export const keyGenRateLimiter = new RateLimiter({
  windowMs: 3600000, // 1 hour
  maxRequests: 10, // 10 keys per hour
  keyPrefix: 'ratelimit:keygen',
});

export const strictRateLimiter = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10, // 10 requests per minute
  keyPrefix: 'ratelimit:strict',
});