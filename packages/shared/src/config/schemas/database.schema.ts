/**
 * Database Configuration Schema
 *
 * Defines PostgreSQL connection settings, pooling configuration,
 * and Prisma-specific options.
 */

import { z } from 'zod';

export const databaseConfigSchema = z.object({
  url: z.string().url().or(z.string().startsWith('postgresql://')),
  testUrl: z.string().url().or(z.string().startsWith('postgresql://')).optional(),

  pool: z.object({
    size: z.coerce.number().min(1).max(100).default(10),
    timeout: z.coerce.number().min(0).default(20000),
    idleTimeout: z.coerce.number().min(0).default(30000),
    maxIdleConnections: z.coerce.number().min(0).default(10),
    connectionTimeout: z.coerce.number().min(0).default(5000),
  }),

  ssl: z.object({
    enabled: z.boolean().default(false),
    rejectUnauthorized: z.boolean().default(true),
    ca: z.string().optional(),
    cert: z.string().optional(),
    key: z.string().optional(),
  }),

  prisma: z.object({
    logLevel: z.enum(['query', 'info', 'warn', 'error']).array().default(['error', 'warn']),
    errorFormat: z.enum(['pretty', 'colorless', 'minimal']).default('pretty'),
    engineType: z.enum(['library', 'binary']).default('library'),
  }),

  migrations: z.object({
    autoRun: z.boolean().default(false),
    directory: z.string().default('./prisma/migrations'),
    tableName: z.string().default('_prisma_migrations'),
  }),

  backup: z.object({
    enabled: z.boolean().default(false),
    schedule: z.string().default('0 2 * * *'), // 2 AM daily
    retention: z.coerce.number().default(7), // Keep backups for 7 days
    location: z.string().default('./backups'),
  }),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;