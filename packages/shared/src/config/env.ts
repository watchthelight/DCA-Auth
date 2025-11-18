/**
 * Environment Variable Validation
 *
 * Uses Zod to validate and type-check environment variables at runtime.
 * This ensures the application fails fast if configuration is missing or invalid.
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: '../../.env' });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database Configuration
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().min(1).max(100).default(10),
  DATABASE_TIMEOUT: z.coerce.number().min(1000).default(20000),
  PRISMA_LOG_LEVEL: z.enum(['info', 'query', 'warn', 'error']).default('info'),

  // Redis Configuration
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().min(0).default(0),
  REDIS_KEY_PREFIX: z.string().default('dca:dev:'),
  REDIS_MAX_RETRIES: z.coerce.number().default(3),
  REDIS_RETRY_DELAY: z.coerce.number().default(1000),
  REDIS_ENABLE_OFFLINE_QUEUE: z.coerce.boolean().default(true),
  CACHE_DEFAULT_TTL: z.coerce.number().default(3600),
  SESSION_TTL: z.coerce.number().default(86400),
});

export type Env = z.infer<typeof envSchema>;

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('Invalid environment variables:', parseResult.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parseResult.data;
