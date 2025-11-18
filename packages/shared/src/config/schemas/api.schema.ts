/**
 * API Configuration Schema
 *
 * Defines API server settings, rate limiting, CORS,
 * request/response handling, and API versioning.
 */

import { z } from 'zod';

export const apiConfigSchema = z.object({
  version: z.string().default('v1').describe('API version'),
  prefix: z.string().default('/api').describe('API route prefix'),

  server: z.object({
    bodyLimit: z.string().default('10mb').describe('Max request body size'),
    parameterLimit: z.coerce.number().default(1000).describe('Max URL parameters'),
    timeout: z.coerce.number().default(30000).describe('Request timeout in ms'),
    keepAliveTimeout: z.coerce.number().default(5000).describe('Keep-alive timeout'),
    headersTimeout: z.coerce.number().default(60000).describe('Headers timeout'),
    requestTimeout: z.coerce.number().default(30000).describe('Request timeout'),
  }),

  rateLimit: z.object({
    enabled: z.boolean().default(true),
    global: z.object({
      windowMs: z.coerce.number().default(60000).describe('Time window in ms'),
      maxRequests: z.coerce.number().default(100).describe('Max requests per window'),
      message: z.string().default('Too many requests, please try again later'),
      standardHeaders: z.boolean().default(true),
      legacyHeaders: z.boolean().default(false),
      skipSuccessfulRequests: z.boolean().default(false),
      skipFailedRequests: z.boolean().default(false),
    }),
    auth: z.object({
      windowMs: z.coerce.number().default(900000).describe('15 minutes'),
      maxRequests: z.coerce.number().default(5).describe('Max auth attempts'),
    }),
    api: z.object({
      windowMs: z.coerce.number().default(60000).describe('1 minute'),
      maxRequests: z.coerce.number().default(60).describe('API calls per minute'),
    }),
    license: z.object({
      windowMs: z.coerce.number().default(3600000).describe('1 hour'),
      maxRequests: z.coerce.number().default(10).describe('License operations per hour'),
    }),
  }),

  cors: z.object({
    enabled: z.boolean().default(true),
    origins: z.array(z.string()).default(['http://localhost:3000']),
    credentials: z.boolean().default(true),
    methods: z.array(z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']))
      .default(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']),
    allowedHeaders: z.array(z.string()).default(['Content-Type', 'Authorization']),
    exposedHeaders: z.array(z.string()).default([]),
    maxAge: z.coerce.number().default(86400).describe('Preflight cache time in seconds'),
    preflightContinue: z.boolean().default(false),
    optionsSuccessStatus: z.coerce.number().default(204),
  }),

  compression: z.object({
    enabled: z.boolean().default(true),
    threshold: z.string().default('1kb'),
    level: z.coerce.number().min(-1).max(9).default(6),
    memLevel: z.coerce.number().min(1).max(9).default(8),
    filter: z.function().optional(),
  }),

  cache: z.object({
    enabled: z.boolean().default(true),
    ttl: z.coerce.number().default(300).describe('Default cache TTL in seconds'),
    checkPeriod: z.coerce.number().default(600).describe('Cache cleanup interval'),
    maxKeys: z.coerce.number().default(500).describe('Max cached keys'),
    stdTTL: z.coerce.number().default(0).describe('Standard TTL'),
    useClones: z.boolean().default(true),
  }),

  pagination: z.object({
    defaultLimit: z.coerce.number().default(20),
    maxLimit: z.coerce.number().default(100),
    defaultPage: z.coerce.number().default(1),
  }),

  validation: z.object({
    stripUnknown: z.boolean().default(true),
    abortEarly: z.boolean().default(false),
    allowUnknown: z.boolean().default(false),
    context: z.boolean().default(true),
  }),

  response: z.object({
    successStatusCode: z.coerce.number().default(200),
    createdStatusCode: z.coerce.number().default(201),
    noContentStatusCode: z.coerce.number().default(204),
    badRequestStatusCode: z.coerce.number().default(400),
    unauthorizedStatusCode: z.coerce.number().default(401),
    forbiddenStatusCode: z.coerce.number().default(403),
    notFoundStatusCode: z.coerce.number().default(404),
    conflictStatusCode: z.coerce.number().default(409),
    serverErrorStatusCode: z.coerce.number().default(500),
    prettyJson: z.boolean().default(false),
  }),

  documentation: z.object({
    enabled: z.boolean().default(true),
    path: z.string().default('/api-docs'),
    title: z.string().default('DCA-Auth API Documentation'),
    version: z.string().default('1.0.0'),
    description: z.string().default('Discord License Key Management API'),
    contact: z.object({
      name: z.string().optional(),
      url: z.string().url().optional(),
      email: z.string().email().optional(),
    }).optional(),
  }),

  webhooks: z.object({
    enabled: z.boolean().default(true),
    timeout: z.coerce.number().default(10000),
    retries: z.coerce.number().default(3),
    retryDelay: z.coerce.number().default(1000),
    signatureHeader: z.string().default('X-Webhook-Signature'),
    secret: z.string().optional(),
  }),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;