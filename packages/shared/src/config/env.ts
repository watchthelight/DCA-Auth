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
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().min(1).max(100).default(10),
  DATABASE_TIMEOUT: z.coerce.number().min(1000).default(20000),
  PRISMA_LOG_LEVEL: z.enum(['info', 'query', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment variables:', parseResult.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parseResult.data;
