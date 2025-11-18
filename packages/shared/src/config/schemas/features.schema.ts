/**
 * Feature Flags Configuration Schema
 *
 * Defines feature toggles, A/B testing configuration,
 * and gradual rollout settings.
 */

import { z } from 'zod';

export const featuresConfigSchema = z.object({
  // Feature Flags
  flags: z.object({
    // Core Features
    newDashboard: z.boolean().default(false).describe('Enable new dashboard UI'),
    advancedAnalytics: z.boolean().default(false).describe('Enable advanced analytics'),
    betaFeatures: z.boolean().default(false).describe('Enable beta features'),
    darkMode: z.boolean().default(true).describe('Enable dark mode toggle'),

    // API Features
    graphqlApi: z.boolean().default(false).describe('Enable GraphQL API'),
    webhooks: z.boolean().default(true).describe('Enable webhook system'),
    apiV2: z.boolean().default(false).describe('Enable API v2 endpoints'),

    // License Features
    bulkLicenseGeneration: z.boolean().default(true).describe('Enable bulk license generation'),
    licenseTransfer: z.boolean().default(false).describe('Enable license transfers'),
    licenseUpgrade: z.boolean().default(false).describe('Enable license upgrades'),
    customLicenseTypes: z.boolean().default(false).describe('Enable custom license types'),

    // Discord Features
    slashCommands: z.boolean().default(true).describe('Enable slash commands'),
    contextMenus: z.boolean().default(false).describe('Enable context menu commands'),
    autoModeration: z.boolean().default(false).describe('Enable auto-moderation'),
    voiceIntegration: z.boolean().default(false).describe('Enable voice channel features'),

    // Security Features
    twoFactorAuth: z.boolean().default(false).describe('Enable 2FA'),
    ipWhitelisting: z.boolean().default(false).describe('Enable IP whitelisting'),
    auditLogging: z.boolean().default(true).describe('Enable audit logging'),
    encryptedBackups: z.boolean().default(false).describe('Enable encrypted backups'),

    // Payment Features
    stripeIntegration: z.boolean().default(false).describe('Enable Stripe payments'),
    paypalIntegration: z.boolean().default(false).describe('Enable PayPal payments'),
    cryptoPayments: z.boolean().default(false).describe('Enable cryptocurrency payments'),
    subscriptions: z.boolean().default(false).describe('Enable subscription model'),

    // Developer Features
    apiPlayground: z.boolean().default(false).describe('Enable API playground'),
    sandboxMode: z.boolean().default(false).describe('Enable sandbox environment'),
    developerPortal: z.boolean().default(false).describe('Enable developer portal'),
    customIntegrations: z.boolean().default(false).describe('Enable custom integrations'),
  }),

  // A/B Testing Configuration
  experiments: z.object({
    enabled: z.boolean().default(false).describe('Enable A/B testing'),
    experiments: z.record(z.object({
      name: z.string(),
      description: z.string(),
      variants: z.array(z.object({
        id: z.string(),
        name: z.string(),
        weight: z.coerce.number().min(0).max(100),
      })),
      targetAudience: z.object({
        percentage: z.coerce.number().min(0).max(100).default(100),
        criteria: z.record(z.any()).optional(),
      }).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      enabled: z.boolean().default(true),
    })).default({}),
  }),

  // Gradual Rollout Configuration
  rollout: z.object({
    enabled: z.boolean().default(false).describe('Enable gradual rollout'),
    features: z.record(z.object({
      percentage: z.coerce.number().min(0).max(100).describe('Rollout percentage'),
      guilds: z.array(z.string()).default([]).describe('Specific guild IDs'),
      users: z.array(z.string()).default([]).describe('Specific user IDs'),
      regions: z.array(z.string()).default([]).describe('Specific regions'),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    })).default({}),
  }),

  // Maintenance Mode
  maintenance: z.object({
    enabled: z.boolean().default(false).describe('Enable maintenance mode'),
    message: z.string().default('System is under maintenance. Please try again later.'),
    allowedIPs: z.array(z.string()).default([]).describe('IPs allowed during maintenance'),
    allowedUsers: z.array(z.string()).default([]).describe('User IDs allowed during maintenance'),
    estimatedEndTime: z.string().datetime().optional(),
  }),

  // Beta Program
  beta: z.object({
    enabled: z.boolean().default(false).describe('Enable beta program'),
    requireApplication: z.boolean().default(true).describe('Require beta application'),
    maxUsers: z.coerce.number().default(100).describe('Max beta users'),
    features: z.array(z.string()).default([]).describe('Beta-only features'),
    users: z.array(z.string()).default([]).describe('Beta user IDs'),
    guilds: z.array(z.string()).default([]).describe('Beta guild IDs'),
  }),

  // Feature Limits
  limits: z.object({
    maxLicensesPerUser: z.coerce.number().default(10),
    maxGuildsPerLicense: z.coerce.number().default(1),
    maxUsersPerLicense: z.coerce.number().default(1),
    maxApiCallsPerHour: z.coerce.number().default(1000),
    maxWebhooksPerUser: z.coerce.number().default(5),
    maxBackupsPerUser: z.coerce.number().default(3),
    maxSessionsPerUser: z.coerce.number().default(5),
  }),

  // Feature Deprecation
  deprecation: z.object({
    warnings: z.record(z.object({
      feature: z.string(),
      deprecatedAt: z.string().datetime(),
      removeAt: z.string().datetime(),
      migrationGuide: z.string().url().optional(),
      replacement: z.string().optional(),
    })).default({}),
  }),
});

export type FeaturesConfig = z.infer<typeof featuresConfigSchema>;