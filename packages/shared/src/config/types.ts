/**
 * Configuration TypeScript Type Definitions
 *
 * Re-exports all configuration types for convenient imports.
 */

export type { AppConfig } from './schemas/app.schema.js';
export type { DatabaseConfig } from './schemas/database.schema.js';
export type { RedisConfig } from './schemas/redis.schema.js';
export type { DiscordConfig } from './schemas/discord.schema.js';
export type { AuthConfig } from './schemas/auth.schema.js';
export type { ApiConfig } from './schemas/api.schema.js';
export type { FeaturesConfig } from './schemas/features.schema.js';
export type { Config } from './config.js';

import type { Config } from './config.js';

// Environment types
export type Environment = 'development' | 'test' | 'staging' | 'production';

// Common configuration interfaces
export interface ConfigSource {
  type: 'env' | 'file' | 'remote' | 'default';
  path?: string;
  priority: number;
}

export interface ConfigValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ConfigLoadResult {
  success: boolean;
  config?: Config;
  errors?: ConfigValidationError[];
  sources?: ConfigSource[];
}