/**
 * Redis Configuration
 *
 * Centralizes Redis configuration with validation and defaults.
 */

import { env } from './env.js';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  maxRetries: number;
  retryDelay: number;
  enableOfflineQueue: boolean;
  defaultTTL: number;
  sessionTTL: number;
}

export const redisConfig: RedisConfig = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  db: env.REDIS_DB,
  keyPrefix: env.REDIS_KEY_PREFIX,
  maxRetries: env.REDIS_MAX_RETRIES,
  retryDelay: env.REDIS_RETRY_DELAY,
  enableOfflineQueue: env.REDIS_ENABLE_OFFLINE_QUEUE,
  defaultTTL: env.CACHE_DEFAULT_TTL,
  sessionTTL: env.SESSION_TTL,
};