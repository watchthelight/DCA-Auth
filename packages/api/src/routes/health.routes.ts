/**
 * Health Check Routes
 *
 * System health monitoring and diagnostics endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@dca-auth/shared/database/client';
import { logger } from '@dca-auth/shared/logging/logger';
import { config } from '@dca-auth/shared/config';
import os from 'os';

const router = Router();

/**
 * GET /api/health
 * Basic health check
 */
router.get('/', async (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: config.app.name,
    version: config.app.version,
  });
});

/**
 * GET /api/health/live
 * Liveness probe for Kubernetes
 */
router.get('/live', (req: Request, res: Response) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/ready
 * Readiness probe - checks if all dependencies are available
 */
router.get('/ready', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const checks: any = {
      database: false,
      timestamp: new Date().toISOString(),
    };

    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch (error) {
      logger.error('Database health check failed', error);
      checks.database = false;
    }

    // Check Redis connection if applicable
    // try {
    //   await redis.ping();
    //   checks.redis = true;
    // } catch (error) {
    //   checks.redis = false;
    // }

    // Determine overall status
    const isReady = checks.database; // && checks.redis;

    if (!isReady) {
      return res.status(503).json({
        status: 'not_ready',
        checks,
      });
    }

    res.json({
      status: 'ready',
      checks,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/health/detailed
 * Detailed health check with system metrics
 */
router.get('/detailed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const healthData: any = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: {
        name: config.app.name,
        version: config.app.version,
        environment: config.env,
        nodeVersion: process.version,
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
          percentage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2) + '%',
        },
        uptime: {
          system: os.uptime(),
          process: process.uptime(),
        },
        loadAverage: os.loadavg(),
      },
      process: {
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
      dependencies: {
        database: false,
      },
    };

    // Check database
    try {
      const startTime = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;
      healthData.dependencies.database = {
        status: 'connected',
        responseTime: `${responseTime}ms`,
      };
    } catch (error) {
      healthData.dependencies.database = {
        status: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      healthData.status = 'degraded';
    }

    // Get database stats if connected
    if (healthData.dependencies.database.status === 'connected') {
      try {
        const [userCount, sessionCount, licenseCount] = await Promise.all([
          prisma.user.count(),
          prisma.session.count({ where: { status: 'ACTIVE' } }),
          prisma.licenseKey.count({ where: { status: 'ACTIVE' } }),
        ]);

        healthData.application = {
          users: userCount,
          activeSessions: sessionCount,
          activeLicenses: licenseCount,
        };
      } catch (error) {
        logger.warn('Failed to get application stats', error);
      }
    }

    // Determine overall health status
    const statusCode = healthData.status === 'healthy' ? 200 : 503;

    res.status(statusCode).json(healthData);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/health/metrics
 * Prometheus-compatible metrics endpoint
 */
router.get('/metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics: string[] = [];

    // System metrics
    const memUsage = process.memoryUsage();
    metrics.push(`# HELP process_memory_heap_used_bytes Process heap memory usage`);
    metrics.push(`# TYPE process_memory_heap_used_bytes gauge`);
    metrics.push(`process_memory_heap_used_bytes ${memUsage.heapUsed}`);

    metrics.push(`# HELP process_memory_heap_total_bytes Process total heap memory`);
    metrics.push(`# TYPE process_memory_heap_total_bytes gauge`);
    metrics.push(`process_memory_heap_total_bytes ${memUsage.heapTotal}`);

    metrics.push(`# HELP process_memory_rss_bytes Process RSS memory`);
    metrics.push(`# TYPE process_memory_rss_bytes gauge`);
    metrics.push(`process_memory_rss_bytes ${memUsage.rss}`);

    // Process uptime
    metrics.push(`# HELP process_uptime_seconds Process uptime in seconds`);
    metrics.push(`# TYPE process_uptime_seconds counter`);
    metrics.push(`process_uptime_seconds ${process.uptime()}`);

    // Node.js version info
    metrics.push(`# HELP nodejs_version_info Node.js version`);
    metrics.push(`# TYPE nodejs_version_info gauge`);
    metrics.push(`nodejs_version_info{version="${process.version}"} 1`);

    // Application metrics
    try {
      const [userCount, sessionCount, licenseCount, activationCount] = await Promise.all([
        prisma.user.count(),
        prisma.session.count({ where: { status: 'ACTIVE' } }),
        prisma.licenseKey.count({ where: { status: 'ACTIVE' } }),
        prisma.licenseActivation.count({ where: { status: 'ACTIVE' } }),
      ]);

      metrics.push(`# HELP app_users_total Total number of users`);
      metrics.push(`# TYPE app_users_total gauge`);
      metrics.push(`app_users_total ${userCount}`);

      metrics.push(`# HELP app_sessions_active Active sessions`);
      metrics.push(`# TYPE app_sessions_active gauge`);
      metrics.push(`app_sessions_active ${sessionCount}`);

      metrics.push(`# HELP app_licenses_active Active licenses`);
      metrics.push(`# TYPE app_licenses_active gauge`);
      metrics.push(`app_licenses_active ${licenseCount}`);

      metrics.push(`# HELP app_activations_active Active license activations`);
      metrics.push(`# TYPE app_activations_active gauge`);
      metrics.push(`app_activations_active ${activationCount}`);
    } catch (error) {
      logger.warn('Failed to get application metrics', error);
    }

    // Database connection status
    let dbStatus = 0;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 1;
    } catch (error) {
      dbStatus = 0;
    }

    metrics.push(`# HELP database_connected Database connection status`);
    metrics.push(`# TYPE database_connected gauge`);
    metrics.push(`database_connected ${dbStatus}`);

    res.set('Content-Type', 'text/plain');
    res.send(metrics.join('\n'));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/health/ping
 * Ping endpoint for monitoring tools
 */
router.post('/ping', (req: Request, res: Response) => {
  const response = {
    pong: true,
    timestamp: new Date().toISOString(),
    echo: req.body,
  };

  res.json(response);
});

/**
 * GET /api/health/version
 * Get version information
 */
router.get('/version', (req: Request, res: Response) => {
  res.json({
    service: config.app.name,
    version: config.app.version,
    environment: config.env,
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    commit: process.env.GIT_COMMIT || 'unknown',
    buildDate: process.env.BUILD_DATE || 'unknown',
  });
});

/**
 * GET /api/health/dependencies
 * Check status of all external dependencies
 */
router.get('/dependencies', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dependencies: any = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: [],
    };

    // Check Database
    const dbCheck = {
      name: 'PostgreSQL Database',
      status: 'unhealthy',
      responseTime: 0,
      details: {} as any,
    };

    try {
      const startTime = Date.now();
      const result = await prisma.$queryRaw`SELECT version()` as any[];
      dbCheck.responseTime = Date.now() - startTime;
      dbCheck.status = 'healthy';
      dbCheck.details.version = result[0]?.version || 'unknown';
    } catch (error) {
      dbCheck.status = 'unhealthy';
      dbCheck.details.error = error instanceof Error ? error.message : 'Connection failed';
      dependencies.status = 'degraded';
    }
    dependencies.checks.push(dbCheck);

    // Check Discord API (if configured)
    if (config.discord.clientId) {
      const discordCheck = {
        name: 'Discord API',
        status: 'unknown',
        details: {
          clientId: config.discord.clientId,
        },
      };

      // In production, you might want to make a test API call
      // For now, we'll just check if credentials are configured
      if (config.discord.clientSecret) {
        discordCheck.status = 'configured';
      } else {
        discordCheck.status = 'not_configured';
        dependencies.status = 'degraded';
      }
      dependencies.checks.push(discordCheck);
    }

    // Check Redis (if configured)
    // const redisCheck = {
    //   name: 'Redis Cache',
    //   status: 'unhealthy',
    //   responseTime: 0,
    //   details: {} as any,
    // };
    // try {
    //   const startTime = Date.now();
    //   await redis.ping();
    //   redisCheck.responseTime = Date.now() - startTime;
    //   redisCheck.status = 'healthy';
    // } catch (error) {
    //   redisCheck.status = 'unhealthy';
    //   redisCheck.details.error = 'Connection failed';
    //   dependencies.status = 'degraded';
    // }
    // dependencies.checks.push(redisCheck);

    const statusCode = dependencies.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(dependencies);
  } catch (error) {
    next(error);
  }
});

export default router;