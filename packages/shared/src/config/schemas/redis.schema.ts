/**
 * Redis Configuration Schema
 *
 * Defines Redis connection settings, clustering options,
 * and cache-specific configurations.
 */

import { z } from 'zod';

export const redisConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().min(1).max(65535).default(6379),
  password: z.string().optional(),
  username: z.string().optional(),
  db: z.coerce.number().min(0).max(15).default(0),

  connection: z.object({
    family: z.enum(['4', '6']).or(z.literal(4)).or(z.literal(6)).optional(),
    keyPrefix: z.string().default('dca:'),
    maxRetries: z.coerce.number().min(0).default(3),
    retryDelay: z.coerce.number().min(0).default(1000),
    enableOfflineQueue: z.boolean().default(true),
    connectTimeout: z.coerce.number().default(10000),
    keepAlive: z.coerce.number().default(0),
    noDelay: z.boolean().default(true),
  }),

  cluster: z.object({
    enabled: z.boolean().default(false),
    nodes: z.array(z.object({
      host: z.string(),
      port: z.coerce.number(),
    })).optional(),
    options: z.object({
      clusterRetryStrategy: z.function().optional(),
      enableReadyCheck: z.boolean().default(true),
      maxRedirections: z.coerce.number().default(16),
      scaleReads: z.enum(['master', 'slave', 'all']).default('master'),
    }).optional(),
  }),

  cache: z.object({
    defaultTTL: z.coerce.number().default(3600), // 1 hour
    sessionTTL: z.coerce.number().default(86400), // 24 hours
    maxMemory: z.string().default('256mb'),
    evictionPolicy: z.enum([
      'noeviction',
      'allkeys-lru',
      'allkeys-lfu',
      'volatile-lru',
      'volatile-lfu',
      'allkeys-random',
      'volatile-random',
      'volatile-ttl'
    ]).default('allkeys-lru'),
  }),

  sentinel: z.object({
    enabled: z.boolean().default(false),
    sentinels: z.array(z.object({
      host: z.string(),
      port: z.coerce.number(),
    })).optional(),
    name: z.string().optional(),
    password: z.string().optional(),
  }),
});

export type RedisConfig = z.infer<typeof redisConfigSchema>;