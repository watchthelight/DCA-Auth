/**
 * Authentication Configuration Schema
 *
 * Defines JWT settings, session configuration, OAuth providers,
 * and security policies.
 */

import { z } from 'zod';

export const authConfigSchema = z.object({
  jwt: z.object({
    algorithm: z.enum(['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512']).default('HS256'),
    accessSecret: z.string().min(32).describe('JWT access token secret'),
    refreshSecret: z.string().min(32).describe('JWT refresh token secret'),
    accessExpiry: z.string().default('15m').describe('Access token expiry time'),
    refreshExpiry: z.string().default('7d').describe('Refresh token expiry time'),
    issuer: z.string().default('dca-auth').describe('JWT issuer'),
    audience: z.string().default('dca-auth-users').describe('JWT audience'),
  }),

  session: z.object({
    secret: z.string().min(32).describe('Session secret for cookie signing'),
    name: z.string().default('dca.sid').describe('Session cookie name'),
    maxAge: z.coerce.number().default(86400000).describe('Session max age in ms (24h)'),
    httpOnly: z.boolean().default(true),
    secure: z.boolean().default(false).describe('Set to true in production'),
    sameSite: z.enum(['strict', 'lax', 'none']).default('lax'),
    rolling: z.boolean().default(true).describe('Reset expiry on activity'),
    resave: z.boolean().default(false),
    saveUninitialized: z.boolean().default(false),
    domain: z.string().optional().describe('Cookie domain'),
    path: z.string().default('/').describe('Cookie path'),
  }),

  oauth: z.object({
    discord: z.object({
      enabled: z.boolean().default(true),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
      callbackUrl: z.string().url(),
      scopes: z.array(z.string()).default(['identify', 'guilds', 'email']),
    }),
    google: z.object({
      enabled: z.boolean().default(false),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      callbackUrl: z.string().url().optional(),
    }),
    github: z.object({
      enabled: z.boolean().default(false),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      callbackUrl: z.string().url().optional(),
    }),
  }),

  password: z.object({
    minLength: z.coerce.number().default(8),
    maxLength: z.coerce.number().default(128),
    requireUppercase: z.boolean().default(true),
    requireLowercase: z.boolean().default(true),
    requireNumbers: z.boolean().default(true),
    requireSpecial: z.boolean().default(true),
    bcryptRounds: z.coerce.number().min(10).max(15).default(12),
  }),

  mfa: z.object({
    enabled: z.boolean().default(false),
    issuer: z.string().default('DCA-Auth'),
    window: z.coerce.number().default(1).describe('TOTP validation window'),
    backupCodes: z.coerce.number().default(10).describe('Number of backup codes'),
  }),

  security: z.object({
    maxLoginAttempts: z.coerce.number().default(5),
    lockoutDuration: z.coerce.number().default(900000).describe('Lockout duration in ms (15m)'),
    passwordResetExpiry: z.coerce.number().default(3600000).describe('Reset token expiry in ms (1h)'),
    emailVerificationExpiry: z.coerce.number().default(86400000).describe('Email verification expiry in ms (24h)'),
    requireEmailVerification: z.boolean().default(true),
    allowMultipleSessions: z.boolean().default(true),
    maxSessions: z.coerce.number().default(5).describe('Max concurrent sessions per user'),
    ipWhitelist: z.array(z.string()).default([]).describe('Allowed IP addresses'),
    ipBlacklist: z.array(z.string()).default([]).describe('Blocked IP addresses'),
  }),

  tokens: z.object({
    apiKeyLength: z.coerce.number().default(32),
    apiKeyPrefix: z.string().default('dca_'),
    licenseKeyLength: z.coerce.number().default(24),
    licenseKeyPrefix: z.string().default('DCA-'),
    activationCodeLength: z.coerce.number().default(6),
  }),
});

export type AuthConfig = z.infer<typeof authConfigSchema>;