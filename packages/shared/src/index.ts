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
export {
  config,
  configManager,
  appConfigSchema,
  databaseConfigSchema,
  redisConfigSchema as redisSchemaValidation,
  discordConfigSchema,
  authConfigSchema,
  apiConfigSchema,
  featuresConfigSchema,
  envLoader,
} from './config/index.js';
export type {
  Config,
  AppConfig,
  DatabaseConfig,
  RedisConfig as RedisConfigType,
  DiscordConfig,
  AuthConfig,
  ApiConfig,
  FeaturesConfig,
  Environment,
} from './config/index.js';

// Logging exports
export {
  logger,
  error,
  warn,
  info,
  http,
  debug,
  audit,
  securityAudit,
  performance,
  AuditEventType,
  correlationMiddleware,
  getCorrelationId,
  setCorrelationContext,
  devRequestLogger,
  prodRequestLogger,
  errorLogger,
} from './logging/index.js';
export type { CorrelationContext, RequestLoggerOptions } from './logging/index.js';

// Error exports
export {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  BadGatewayError,
  TimeoutError,
  BusinessError,
  IntegrationError,
  DatabaseError,
  ConfigurationError,
  isOperationalError,
  isTrustedError,
  normalizeError,
  errorHandler,
  asyncHandler,
  createHttpError,
  setupGlobalErrorHandlers,
} from './errors/index.js';

// Placeholder types (will be expanded in later prompts)
export type LicenseKey = {
  id: string;
  key: string;
  userId: string;
  expiresAt: Date | null;
};
