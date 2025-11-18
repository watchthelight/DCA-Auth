/**
 * Configuration Manager
 *
 * Central configuration management system that combines all config schemas,
 * loads from multiple sources, and provides type-safe access.
 */

import { z } from 'zod';
import chalk from 'chalk';
import { appConfigSchema } from './schemas/app.schema.js';
import { databaseConfigSchema } from './schemas/database.schema.js';
import { redisConfigSchema } from './schemas/redis.schema.js';
import { discordConfigSchema } from './schemas/discord.schema.js';
import { authConfigSchema } from './schemas/auth.schema.js';
import { apiConfigSchema } from './schemas/api.schema.js';
import { featuresConfigSchema } from './schemas/features.schema.js';
import { envLoader } from './loaders/env.loader.js';
import { logger } from '../logging/logger.js';

// Combine all schemas into a single configuration schema
const configSchema = z.object({
  app: appConfigSchema,
  database: databaseConfigSchema,
  redis: redisConfigSchema,
  discord: discordConfigSchema,
  auth: authConfigSchema,
  api: apiConfigSchema,
  features: featuresConfigSchema,
});

export type Config = z.infer<typeof configSchema>;

class ConfigManager {
  private config: Config | null = null;
  private readonly environment: string;

  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Initialize and load configuration
   */
  initialize(): Config {
    if (this.config) {
      return this.config;
    }

    try {
      // Load environment variables
      envLoader.load();

      // Build configuration object
      const rawConfig = this.buildConfig();

      // Validate configuration
      const parseResult = configSchema.safeParse(rawConfig);

      if (!parseResult.success) {
        this.handleValidationError(parseResult.error);
      }

      this.config = parseResult.data;
      this.logConfigLoaded();

      return this.config;
    } catch (error) {
      logger.error('Failed to initialize configuration:', error);
      throw error;
    }
  }

  /**
   * Build configuration object from environment variables
   */
  private buildConfig(): unknown {
    return {
      app: {
        name: envLoader.get('APP_NAME'),
        version: envLoader.get('APP_VERSION'),
        environment: this.environment,
        server: {
          host: envLoader.get('SERVER_HOST'),
          port: envLoader.getNumber('SERVER_PORT'),
          baseUrl: envLoader.get('SERVER_BASE_URL'),
          apiUrl: envLoader.get('API_URL'),
          dashboardUrl: envLoader.get('DASHBOARD_URL'),
          trustProxy: envLoader.getBoolean('SERVER_TRUST_PROXY'),
        },
        logging: {
          level: envLoader.get('LOG_LEVEL'),
          format: envLoader.get('LOG_FORMAT'),
          directory: envLoader.get('LOG_DIRECTORY'),
          maxFiles: envLoader.getNumber('LOG_MAX_FILES'),
          maxSize: envLoader.get('LOG_MAX_SIZE'),
        },
        monitoring: {
          enabled: envLoader.getBoolean('MONITORING_ENABLED', true),
          metricsPort: envLoader.getNumber('METRICS_PORT'),
          healthCheckInterval: envLoader.getNumber('HEALTH_CHECK_INTERVAL'),
          collectDefaultMetrics: envLoader.getBoolean('COLLECT_DEFAULT_METRICS', true),
        },
        shutdown: {
          gracefulTimeout: envLoader.getNumber('SHUTDOWN_GRACEFUL_TIMEOUT'),
          forceTimeout: envLoader.getNumber('SHUTDOWN_FORCE_TIMEOUT'),
        },
      },
      database: {
        url: envLoader.get('DATABASE_URL'),
        testUrl: envLoader.get('DATABASE_URL_TEST'),
        pool: {
          size: envLoader.getNumber('DATABASE_POOL_SIZE'),
          timeout: envLoader.getNumber('DATABASE_TIMEOUT'),
          idleTimeout: envLoader.getNumber('DATABASE_IDLE_TIMEOUT'),
          maxIdleConnections: envLoader.getNumber('DATABASE_MAX_IDLE'),
          connectionTimeout: envLoader.getNumber('DATABASE_CONNECTION_TIMEOUT'),
        },
        ssl: {
          enabled: envLoader.getBoolean('DATABASE_SSL'),
          rejectUnauthorized: envLoader.getBoolean('DATABASE_SSL_REJECT_UNAUTHORIZED', true),
          ca: envLoader.get('DATABASE_SSL_CA'),
          cert: envLoader.get('DATABASE_SSL_CERT'),
          key: envLoader.get('DATABASE_SSL_KEY'),
        },
        prisma: {
          logLevel: envLoader.getArray('PRISMA_LOG_LEVEL'),
          errorFormat: envLoader.get('PRISMA_ERROR_FORMAT'),
          engineType: envLoader.get('PRISMA_ENGINE_TYPE'),
        },
        migrations: {
          autoRun: envLoader.getBoolean('DATABASE_AUTO_MIGRATE'),
          directory: envLoader.get('DATABASE_MIGRATIONS_DIR'),
          tableName: envLoader.get('DATABASE_MIGRATIONS_TABLE'),
        },
        backup: {
          enabled: envLoader.getBoolean('DATABASE_BACKUP_ENABLED'),
          schedule: envLoader.get('DATABASE_BACKUP_SCHEDULE'),
          retention: envLoader.getNumber('DATABASE_BACKUP_RETENTION'),
          location: envLoader.get('DATABASE_BACKUP_LOCATION'),
        },
      },
      redis: {
        host: envLoader.get('REDIS_HOST'),
        port: envLoader.getNumber('REDIS_PORT'),
        password: envLoader.get('REDIS_PASSWORD'),
        username: envLoader.get('REDIS_USERNAME'),
        db: envLoader.getNumber('REDIS_DB'),
        connection: {
          family: envLoader.get('REDIS_FAMILY'),
          keyPrefix: envLoader.get('REDIS_KEY_PREFIX'),
          maxRetries: envLoader.getNumber('REDIS_MAX_RETRIES'),
          retryDelay: envLoader.getNumber('REDIS_RETRY_DELAY'),
          enableOfflineQueue: envLoader.getBoolean('REDIS_ENABLE_OFFLINE_QUEUE', true),
          connectTimeout: envLoader.getNumber('REDIS_CONNECT_TIMEOUT'),
          keepAlive: envLoader.getNumber('REDIS_KEEP_ALIVE'),
          noDelay: envLoader.getBoolean('REDIS_NO_DELAY', true),
        },
        cluster: {
          enabled: envLoader.getBoolean('REDIS_CLUSTER_ENABLED'),
          nodes: envLoader.getJson('REDIS_CLUSTER_NODES'),
        },
        cache: {
          defaultTTL: envLoader.getNumber('CACHE_DEFAULT_TTL'),
          sessionTTL: envLoader.getNumber('SESSION_TTL'),
          maxMemory: envLoader.get('REDIS_MAX_MEMORY'),
          evictionPolicy: envLoader.get('REDIS_EVICTION_POLICY'),
        },
        sentinel: {
          enabled: envLoader.getBoolean('REDIS_SENTINEL_ENABLED'),
          sentinels: envLoader.getJson('REDIS_SENTINELS'),
          name: envLoader.get('REDIS_SENTINEL_NAME'),
          password: envLoader.get('REDIS_SENTINEL_PASSWORD'),
        },
      },
      discord: {
        bot: {
          token: envLoader.get('DISCORD_BOT_TOKEN', ''),
          clientId: envLoader.get('DISCORD_CLIENT_ID', ''),
          publicKey: envLoader.get('DISCORD_PUBLIC_KEY'),
          guildId: envLoader.get('DISCORD_GUILD_ID'),
          prefix: envLoader.get('DISCORD_PREFIX'),
          owners: envLoader.getArray('DISCORD_OWNERS'),
          admins: envLoader.getArray('DISCORD_ADMINS'),
        },
        oauth: {
          clientSecret: envLoader.get('DISCORD_CLIENT_SECRET', ''),
          redirectUri: envLoader.get('DISCORD_REDIRECT_URI', ''),
          scopes: envLoader.getArray('DISCORD_SCOPES'),
          prompt: envLoader.get('DISCORD_PROMPT'),
        },
        api: {
          version: envLoader.getNumber('DISCORD_API_VERSION'),
          baseUrl: envLoader.get('DISCORD_API_URL'),
          cdnUrl: envLoader.get('DISCORD_CDN_URL'),
          timeout: envLoader.getNumber('DISCORD_API_TIMEOUT'),
          retries: envLoader.getNumber('DISCORD_API_RETRIES'),
        },
        gateway: {
          intents: envLoader.getArray('DISCORD_INTENTS'),
          shards: envLoader.get('DISCORD_SHARDS') === 'auto' ? 'auto' : envLoader.getNumber('DISCORD_SHARDS'),
          shardCount: envLoader.getNumber('DISCORD_SHARD_COUNT'),
          largeThreshold: envLoader.getNumber('DISCORD_LARGE_THRESHOLD'),
          compress: envLoader.getBoolean('DISCORD_COMPRESS'),
          presence: envLoader.getJson('DISCORD_PRESENCE'),
        },
        commands: {
          global: envLoader.getBoolean('DISCORD_GLOBAL_COMMANDS'),
          guilds: envLoader.getArray('DISCORD_COMMAND_GUILDS'),
          autoSync: envLoader.getBoolean('DISCORD_AUTO_SYNC_COMMANDS', true),
          ephemeral: envLoader.getBoolean('DISCORD_EPHEMERAL_RESPONSES'),
        },
        cache: {
          messages: envLoader.getNumber('DISCORD_CACHE_MESSAGES'),
          users: envLoader.getNumber('DISCORD_CACHE_USERS'),
          members: envLoader.getNumber('DISCORD_CACHE_MEMBERS'),
          channels: envLoader.getNumber('DISCORD_CACHE_CHANNELS'),
          guilds: envLoader.getNumber('DISCORD_CACHE_GUILDS'),
          roles: envLoader.getNumber('DISCORD_CACHE_ROLES'),
          emojis: envLoader.getNumber('DISCORD_CACHE_EMOJIS'),
        },
        features: {
          autoRole: envLoader.getBoolean('DISCORD_AUTO_ROLE'),
          welcomeMessage: envLoader.getBoolean('DISCORD_WELCOME_MESSAGE', true),
          logging: envLoader.getBoolean('DISCORD_LOGGING', true),
          moderation: envLoader.getBoolean('DISCORD_MODERATION', true),
          verification: envLoader.getBoolean('DISCORD_VERIFICATION', true),
          analytics: envLoader.getBoolean('DISCORD_ANALYTICS', true),
        },
      },
      auth: {
        jwt: {
          algorithm: envLoader.get('JWT_ALGORITHM'),
          accessSecret: envLoader.get('JWT_ACCESS_SECRET', ''),
          refreshSecret: envLoader.get('JWT_REFRESH_SECRET', ''),
          accessExpiry: envLoader.get('JWT_ACCESS_EXPIRY'),
          refreshExpiry: envLoader.get('JWT_REFRESH_EXPIRY'),
          issuer: envLoader.get('JWT_ISSUER'),
          audience: envLoader.get('JWT_AUDIENCE'),
        },
        session: {
          secret: envLoader.get('SESSION_SECRET', ''),
          name: envLoader.get('SESSION_NAME'),
          maxAge: envLoader.getNumber('SESSION_MAX_AGE'),
          httpOnly: envLoader.getBoolean('SESSION_HTTP_ONLY', true),
          secure: envLoader.getBoolean('SESSION_SECURE', this.environment === 'production'),
          sameSite: envLoader.get('SESSION_SAME_SITE'),
          rolling: envLoader.getBoolean('SESSION_ROLLING', true),
          resave: envLoader.getBoolean('SESSION_RESAVE'),
          saveUninitialized: envLoader.getBoolean('SESSION_SAVE_UNINITIALIZED'),
          domain: envLoader.get('SESSION_DOMAIN'),
          path: envLoader.get('SESSION_PATH'),
        },
        oauth: {
          discord: {
            enabled: envLoader.getBoolean('OAUTH_DISCORD_ENABLED', true),
            clientId: envLoader.get('DISCORD_CLIENT_ID', ''),
            clientSecret: envLoader.get('DISCORD_CLIENT_SECRET', ''),
            callbackUrl: envLoader.get('DISCORD_OAUTH_CALLBACK', ''),
            scopes: envLoader.getArray('DISCORD_SCOPES'),
          },
          google: {
            enabled: envLoader.getBoolean('OAUTH_GOOGLE_ENABLED'),
            clientId: envLoader.get('GOOGLE_CLIENT_ID'),
            clientSecret: envLoader.get('GOOGLE_CLIENT_SECRET'),
            callbackUrl: envLoader.get('GOOGLE_OAUTH_CALLBACK'),
          },
          github: {
            enabled: envLoader.getBoolean('OAUTH_GITHUB_ENABLED'),
            clientId: envLoader.get('GITHUB_CLIENT_ID'),
            clientSecret: envLoader.get('GITHUB_CLIENT_SECRET'),
            callbackUrl: envLoader.get('GITHUB_OAUTH_CALLBACK'),
          },
        },
        password: {
          minLength: envLoader.getNumber('PASSWORD_MIN_LENGTH'),
          maxLength: envLoader.getNumber('PASSWORD_MAX_LENGTH'),
          requireUppercase: envLoader.getBoolean('PASSWORD_REQUIRE_UPPERCASE', true),
          requireLowercase: envLoader.getBoolean('PASSWORD_REQUIRE_LOWERCASE', true),
          requireNumbers: envLoader.getBoolean('PASSWORD_REQUIRE_NUMBERS', true),
          requireSpecial: envLoader.getBoolean('PASSWORD_REQUIRE_SPECIAL', true),
          bcryptRounds: envLoader.getNumber('BCRYPT_ROUNDS'),
        },
        mfa: {
          enabled: envLoader.getBoolean('MFA_ENABLED'),
          issuer: envLoader.get('MFA_ISSUER'),
          window: envLoader.getNumber('MFA_WINDOW'),
          backupCodes: envLoader.getNumber('MFA_BACKUP_CODES'),
        },
        security: {
          maxLoginAttempts: envLoader.getNumber('MAX_LOGIN_ATTEMPTS'),
          lockoutDuration: envLoader.getNumber('LOCKOUT_DURATION'),
          passwordResetExpiry: envLoader.getNumber('PASSWORD_RESET_EXPIRY'),
          emailVerificationExpiry: envLoader.getNumber('EMAIL_VERIFICATION_EXPIRY'),
          requireEmailVerification: envLoader.getBoolean('REQUIRE_EMAIL_VERIFICATION', true),
          allowMultipleSessions: envLoader.getBoolean('ALLOW_MULTIPLE_SESSIONS', true),
          maxSessions: envLoader.getNumber('MAX_SESSIONS_PER_USER'),
          ipWhitelist: envLoader.getArray('IP_WHITELIST'),
          ipBlacklist: envLoader.getArray('IP_BLACKLIST'),
        },
        tokens: {
          apiKeyLength: envLoader.getNumber('API_KEY_LENGTH'),
          apiKeyPrefix: envLoader.get('API_KEY_PREFIX'),
          licenseKeyLength: envLoader.getNumber('LICENSE_KEY_LENGTH'),
          licenseKeyPrefix: envLoader.get('LICENSE_KEY_PREFIX'),
          activationCodeLength: envLoader.getNumber('ACTIVATION_CODE_LENGTH'),
        },
      },
      api: this.buildApiConfig(),
      features: this.buildFeaturesConfig(),
    };
  }

  /**
   * Build API configuration
   */
  private buildApiConfig(): unknown {
    return {
      version: envLoader.get('API_VERSION'),
      prefix: envLoader.get('API_PREFIX'),
      server: {
        bodyLimit: envLoader.get('API_BODY_LIMIT'),
        parameterLimit: envLoader.getNumber('API_PARAMETER_LIMIT'),
        timeout: envLoader.getNumber('API_TIMEOUT'),
        keepAliveTimeout: envLoader.getNumber('API_KEEP_ALIVE_TIMEOUT'),
        headersTimeout: envLoader.getNumber('API_HEADERS_TIMEOUT'),
        requestTimeout: envLoader.getNumber('API_REQUEST_TIMEOUT'),
      },
      rateLimit: {
        enabled: envLoader.getBoolean('RATE_LIMIT_ENABLED', true),
        global: {
          windowMs: envLoader.getNumber('RATE_LIMIT_WINDOW_MS'),
          maxRequests: envLoader.getNumber('RATE_LIMIT_MAX_REQUESTS'),
          message: envLoader.get('RATE_LIMIT_MESSAGE'),
          standardHeaders: envLoader.getBoolean('RATE_LIMIT_STANDARD_HEADERS', true),
          legacyHeaders: envLoader.getBoolean('RATE_LIMIT_LEGACY_HEADERS'),
          skipSuccessfulRequests: envLoader.getBoolean('RATE_LIMIT_SKIP_SUCCESSFUL'),
          skipFailedRequests: envLoader.getBoolean('RATE_LIMIT_SKIP_FAILED'),
        },
        auth: {
          windowMs: envLoader.getNumber('AUTH_RATE_LIMIT_WINDOW'),
          maxRequests: envLoader.getNumber('AUTH_RATE_LIMIT_MAX'),
        },
        api: {
          windowMs: envLoader.getNumber('API_RATE_LIMIT_WINDOW'),
          maxRequests: envLoader.getNumber('API_RATE_LIMIT_MAX'),
        },
        license: {
          windowMs: envLoader.getNumber('LICENSE_RATE_LIMIT_WINDOW'),
          maxRequests: envLoader.getNumber('LICENSE_RATE_LIMIT_MAX'),
        },
      },
      cors: {
        enabled: envLoader.getBoolean('CORS_ENABLED', true),
        origins: envLoader.getArray('CORS_ORIGINS'),
        credentials: envLoader.getBoolean('CORS_CREDENTIALS', true),
        methods: envLoader.getArray('CORS_METHODS'),
        allowedHeaders: envLoader.getArray('CORS_ALLOWED_HEADERS'),
        exposedHeaders: envLoader.getArray('CORS_EXPOSED_HEADERS'),
        maxAge: envLoader.getNumber('CORS_MAX_AGE'),
        preflightContinue: envLoader.getBoolean('CORS_PREFLIGHT_CONTINUE'),
        optionsSuccessStatus: envLoader.getNumber('CORS_OPTIONS_STATUS'),
      },
      compression: {
        enabled: envLoader.getBoolean('COMPRESSION_ENABLED', true),
        threshold: envLoader.get('COMPRESSION_THRESHOLD'),
        level: envLoader.getNumber('COMPRESSION_LEVEL'),
        memLevel: envLoader.getNumber('COMPRESSION_MEM_LEVEL'),
      },
      cache: {
        enabled: envLoader.getBoolean('API_CACHE_ENABLED', true),
        ttl: envLoader.getNumber('API_CACHE_TTL'),
        checkPeriod: envLoader.getNumber('API_CACHE_CHECK_PERIOD'),
        maxKeys: envLoader.getNumber('API_CACHE_MAX_KEYS'),
        stdTTL: envLoader.getNumber('API_CACHE_STD_TTL'),
        useClones: envLoader.getBoolean('API_CACHE_USE_CLONES', true),
      },
      pagination: {
        defaultLimit: envLoader.getNumber('PAGINATION_DEFAULT_LIMIT'),
        maxLimit: envLoader.getNumber('PAGINATION_MAX_LIMIT'),
        defaultPage: envLoader.getNumber('PAGINATION_DEFAULT_PAGE'),
      },
      validation: {
        stripUnknown: envLoader.getBoolean('VALIDATION_STRIP_UNKNOWN', true),
        abortEarly: envLoader.getBoolean('VALIDATION_ABORT_EARLY'),
        allowUnknown: envLoader.getBoolean('VALIDATION_ALLOW_UNKNOWN'),
        context: envLoader.getBoolean('VALIDATION_CONTEXT', true),
      },
      response: {
        successStatusCode: envLoader.getNumber('RESPONSE_SUCCESS_CODE'),
        createdStatusCode: envLoader.getNumber('RESPONSE_CREATED_CODE'),
        noContentStatusCode: envLoader.getNumber('RESPONSE_NO_CONTENT_CODE'),
        badRequestStatusCode: envLoader.getNumber('RESPONSE_BAD_REQUEST_CODE'),
        unauthorizedStatusCode: envLoader.getNumber('RESPONSE_UNAUTHORIZED_CODE'),
        forbiddenStatusCode: envLoader.getNumber('RESPONSE_FORBIDDEN_CODE'),
        notFoundStatusCode: envLoader.getNumber('RESPONSE_NOT_FOUND_CODE'),
        conflictStatusCode: envLoader.getNumber('RESPONSE_CONFLICT_CODE'),
        serverErrorStatusCode: envLoader.getNumber('RESPONSE_SERVER_ERROR_CODE'),
        prettyJson: envLoader.getBoolean('RESPONSE_PRETTY_JSON'),
      },
      documentation: {
        enabled: envLoader.getBoolean('API_DOCS_ENABLED', true),
        path: envLoader.get('API_DOCS_PATH'),
        title: envLoader.get('API_DOCS_TITLE'),
        version: envLoader.get('API_DOCS_VERSION'),
        description: envLoader.get('API_DOCS_DESCRIPTION'),
        contact: {
          name: envLoader.get('API_DOCS_CONTACT_NAME'),
          url: envLoader.get('API_DOCS_CONTACT_URL'),
          email: envLoader.get('API_DOCS_CONTACT_EMAIL'),
        },
      },
      webhooks: {
        enabled: envLoader.getBoolean('WEBHOOKS_ENABLED', true),
        timeout: envLoader.getNumber('WEBHOOK_TIMEOUT'),
        retries: envLoader.getNumber('WEBHOOK_RETRIES'),
        retryDelay: envLoader.getNumber('WEBHOOK_RETRY_DELAY'),
        signatureHeader: envLoader.get('WEBHOOK_SIGNATURE_HEADER'),
        secret: envLoader.get('WEBHOOK_SECRET'),
      },
    };
  }

  /**
   * Build features configuration
   */
  private buildFeaturesConfig(): unknown {
    return {
      flags: {
        newDashboard: envLoader.getBoolean('FEATURE_NEW_DASHBOARD'),
        advancedAnalytics: envLoader.getBoolean('FEATURE_ADVANCED_ANALYTICS'),
        betaFeatures: envLoader.getBoolean('FEATURE_BETA'),
        darkMode: envLoader.getBoolean('FEATURE_DARK_MODE', true),
        graphqlApi: envLoader.getBoolean('FEATURE_GRAPHQL_API'),
        webhooks: envLoader.getBoolean('FEATURE_WEBHOOKS', true),
        apiV2: envLoader.getBoolean('FEATURE_API_V2'),
        bulkLicenseGeneration: envLoader.getBoolean('FEATURE_BULK_LICENSE', true),
        licenseTransfer: envLoader.getBoolean('FEATURE_LICENSE_TRANSFER'),
        licenseUpgrade: envLoader.getBoolean('FEATURE_LICENSE_UPGRADE'),
        customLicenseTypes: envLoader.getBoolean('FEATURE_CUSTOM_LICENSE_TYPES'),
        slashCommands: envLoader.getBoolean('FEATURE_SLASH_COMMANDS', true),
        contextMenus: envLoader.getBoolean('FEATURE_CONTEXT_MENUS'),
        autoModeration: envLoader.getBoolean('FEATURE_AUTO_MODERATION'),
        voiceIntegration: envLoader.getBoolean('FEATURE_VOICE_INTEGRATION'),
        twoFactorAuth: envLoader.getBoolean('FEATURE_TWO_FACTOR_AUTH'),
        ipWhitelisting: envLoader.getBoolean('FEATURE_IP_WHITELISTING'),
        auditLogging: envLoader.getBoolean('FEATURE_AUDIT_LOGGING', true),
        encryptedBackups: envLoader.getBoolean('FEATURE_ENCRYPTED_BACKUPS'),
        stripeIntegration: envLoader.getBoolean('FEATURE_STRIPE'),
        paypalIntegration: envLoader.getBoolean('FEATURE_PAYPAL'),
        cryptoPayments: envLoader.getBoolean('FEATURE_CRYPTO_PAYMENTS'),
        subscriptions: envLoader.getBoolean('FEATURE_SUBSCRIPTIONS'),
        apiPlayground: envLoader.getBoolean('FEATURE_API_PLAYGROUND'),
        sandboxMode: envLoader.getBoolean('FEATURE_SANDBOX'),
        developerPortal: envLoader.getBoolean('FEATURE_DEVELOPER_PORTAL'),
        customIntegrations: envLoader.getBoolean('FEATURE_CUSTOM_INTEGRATIONS'),
      },
      experiments: {
        enabled: envLoader.getBoolean('EXPERIMENTS_ENABLED'),
        experiments: envLoader.getJson('EXPERIMENTS_CONFIG', {}),
      },
      rollout: {
        enabled: envLoader.getBoolean('ROLLOUT_ENABLED'),
        features: envLoader.getJson('ROLLOUT_FEATURES', {}),
      },
      maintenance: {
        enabled: envLoader.getBoolean('MAINTENANCE_MODE'),
        message: envLoader.get('MAINTENANCE_MESSAGE'),
        allowedIPs: envLoader.getArray('MAINTENANCE_ALLOWED_IPS'),
        allowedUsers: envLoader.getArray('MAINTENANCE_ALLOWED_USERS'),
        estimatedEndTime: envLoader.get('MAINTENANCE_END_TIME'),
      },
      beta: {
        enabled: envLoader.getBoolean('BETA_ENABLED'),
        requireApplication: envLoader.getBoolean('BETA_REQUIRE_APPLICATION', true),
        maxUsers: envLoader.getNumber('BETA_MAX_USERS'),
        features: envLoader.getArray('BETA_FEATURES'),
        users: envLoader.getArray('BETA_USERS'),
        guilds: envLoader.getArray('BETA_GUILDS'),
      },
      limits: {
        maxLicensesPerUser: envLoader.getNumber('LIMIT_LICENSES_PER_USER'),
        maxGuildsPerLicense: envLoader.getNumber('LIMIT_GUILDS_PER_LICENSE'),
        maxUsersPerLicense: envLoader.getNumber('LIMIT_USERS_PER_LICENSE'),
        maxApiCallsPerHour: envLoader.getNumber('LIMIT_API_CALLS_PER_HOUR'),
        maxWebhooksPerUser: envLoader.getNumber('LIMIT_WEBHOOKS_PER_USER'),
        maxBackupsPerUser: envLoader.getNumber('LIMIT_BACKUPS_PER_USER'),
        maxSessionsPerUser: envLoader.getNumber('LIMIT_SESSIONS_PER_USER'),
      },
      deprecation: {
        warnings: envLoader.getJson('DEPRECATION_WARNINGS', {}),
      },
    };
  }

  /**
   * Handle validation errors
   */
  private handleValidationError(error: z.ZodError): never {
    const errors = error.flatten();
    const errorMessages: string[] = [];

    // Format field errors
    for (const [path, messages] of Object.entries(errors.fieldErrors)) {
      if (Array.isArray(messages) && messages.length > 0) {
        errorMessages.push(`  ${chalk.yellow(path)}: ${messages.join(', ')}`);
      }
    }

    // Format form errors
    if (errors.formErrors.length > 0) {
      errorMessages.push(`  ${chalk.yellow('General')}: ${errors.formErrors.join(', ')}`);
    }

    const errorMessage = [
      chalk.red.bold('Configuration validation failed:'),
      ...errorMessages,
      '',
      chalk.gray('Please check your environment variables and configuration files.'),
    ].join('\n');

    console.error(errorMessage);
    process.exit(1);
  }

  /**
   * Log successful configuration load
   */
  private logConfigLoaded(): void {
    logger.info('Configuration loaded successfully', {
      environment: this.environment,
      app: {
        name: this.config?.app.name,
        version: this.config?.app.version,
      },
      loadedFiles: envLoader.getLoadedFiles(),
    });
  }

  /**
   * Get a specific configuration section
   */
  get<K extends keyof Config>(key: K): Config[K] {
    if (!this.config) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
    return this.config[key];
  }

  /**
   * Get the full configuration
   */
  getAll(): Config {
    if (!this.config) {
      throw new Error('Configuration not initialized. Call initialize() first.');
    }
    return { ...this.config };
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.environment === 'production';
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.environment === 'development';
  }

  /**
   * Check if running in test
   */
  isTest(): boolean {
    return this.environment === 'test';
  }

  /**
   * Get current environment
   */
  getEnvironment(): string {
    return this.environment;
  }

  /**
   * Check if a feature flag is enabled
   */
  isFeatureEnabled(feature: keyof Config['features']['flags']): boolean {
    return this.config?.features.flags[feature] ?? false;
  }

  /**
   * Get sensitive config (redacted)
   */
  getSafeConfig(): Record<string, unknown> {
    const safeConfig = JSON.parse(JSON.stringify(this.config));

    // Redact sensitive values
    const redactPaths = [
      'database.url',
      'redis.password',
      'discord.bot.token',
      'discord.oauth.clientSecret',
      'auth.jwt.accessSecret',
      'auth.jwt.refreshSecret',
      'auth.session.secret',
    ];

    for (const path of redactPaths) {
      const parts = path.split('.');
      let obj = safeConfig;
      for (let i = 0; i < parts.length - 1; i++) {
        if (obj[parts[i]]) {
          obj = obj[parts[i]];
        }
      }
      if (obj[parts[parts.length - 1]]) {
        obj[parts[parts.length - 1]] = '***REDACTED***';
      }
    }

    return safeConfig;
  }
}

// Export singleton instance
export const configManager = new ConfigManager();

// Initialize and export config
export const config = configManager.initialize();