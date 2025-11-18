/**
 * Configuration Module Public Exports
 *
 * Provides access to the configuration system and all related utilities.
 */

// Main configuration
export { config, configManager } from './config.js';

// Configuration schemas
export { appConfigSchema } from './schemas/app.schema.js';
export { databaseConfigSchema } from './schemas/database.schema.js';
export { redisConfigSchema } from './schemas/redis.schema.js';
export { discordConfigSchema } from './schemas/discord.schema.js';
export { authConfigSchema } from './schemas/auth.schema.js';
export { apiConfigSchema } from './schemas/api.schema.js';
export { featuresConfigSchema } from './schemas/features.schema.js';

// Loaders
export { envLoader } from './loaders/env.loader.js';

// Types
export type {
  Config,
  AppConfig,
  DatabaseConfig,
  RedisConfig,
  DiscordConfig,
  AuthConfig,
  ApiConfig,
  FeaturesConfig,
  Environment,
  ConfigSource,
  ConfigValidationError,
  ConfigLoadResult,
} from './types.js';