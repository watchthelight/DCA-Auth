/**
 * DCA-Auth Shared Types and Utilities
 *
 * This package contains shared TypeScript types, constants, and utility functions
 * that are used across all DCA-Auth packages (API, Bot, Frontend).
 */

// Database exports
export { prisma } from './database/client.js';
export {
  checkDatabaseHealth,
  isDatabaseConnected,
  measureDatabaseLatency,
} from './database/health.js';
export type { HealthCheckResult } from './database/health.js';

// Cache exports
export {
  getRedisClient,
  connectRedis,
  disconnectRedis,
  isRedisConnected,
} from './cache/client.js';
export { Cache, generalCache, sessionCache, rateLimitCache } from './cache/cache.js';
export type { CacheOptions } from './cache/cache.js';
export { SessionManager, sessionManager } from './cache/session.js';
export type { SessionData, SessionInfo } from './cache/session.js';
export {
  RateLimiter,
  apiRateLimiter,
  authRateLimiter,
  keyGenRateLimiter,
  strictRateLimiter,
} from './cache/rateLimiter.js';
export type { RateLimitOptions, RateLimitResult } from './cache/rateLimiter.js';
export {
  PubSub,
  pubsub,
  EventChannels,
  publishLicenseEvent,
  publishUserEvent,
  publishCacheInvalidation,
} from './cache/pubsub.js';
export type { MessageHandler, PubSubOptions, EventChannel } from './cache/pubsub.js';
export { RedisHealth, redisHealth, checkRedisHealth } from './cache/health.js';
export type { RedisHealthResult } from './cache/health.js';

// Configuration exports
export { env } from './config/env.js';
export type { Env } from './config/env.js';
export { redisConfig } from './config/redis.js';
export type { RedisConfig } from './config/redis.js';

// Utils exports
export { logger } from './utils/logger.js';

// Placeholder types (will be expanded in later prompts)
export type LicenseKey = {
  id: string;
  key: string;
  userId: string;
  expiresAt: Date | null;
};
