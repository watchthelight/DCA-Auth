/**
 * Application Configuration Schema
 *
 * Defines the main application settings including server, logging,
 * monitoring, and shutdown configurations.
 */

import { z } from 'zod';

export const appConfigSchema = z.object({
  name: z.string().default('DCA-Auth'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  environment: z.enum(['development', 'test', 'staging', 'production']).default('development'),

  server: z.object({
    host: z.string().default('0.0.0.0'),
    port: z.coerce.number().min(1).max(65535).default(3000),
    baseUrl: z.string().url().default('http://localhost:3000'),
    apiUrl: z.string().url().default('http://localhost:3000/api'),
    dashboardUrl: z.string().url().default('http://localhost:3001'),
    trustProxy: z.boolean().default(false),
  }),

  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
    format: z.enum(['json', 'pretty']).default('pretty'),
    directory: z.string().default('./logs'),
    maxFiles: z.coerce.number().default(7),
    maxSize: z.string().default('10m'),
  }),

  monitoring: z.object({
    enabled: z.boolean().default(true),
    metricsPort: z.coerce.number().min(1).max(65535).default(9090),
    healthCheckInterval: z.coerce.number().default(30000),
    collectDefaultMetrics: z.boolean().default(true),
  }),

  shutdown: z.object({
    gracefulTimeout: z.coerce.number().default(10000),
    forceTimeout: z.coerce.number().default(30000),
  }),
});

export type AppConfig = z.infer<typeof appConfigSchema>;