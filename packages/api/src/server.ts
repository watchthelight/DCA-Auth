/**
 * API Server Entry Point
 *
 * Initializes and starts the Express server
 */

import { createApp, setupGracefulShutdown, setupErrorHandlers } from './app.js';
import { config } from '@dca-auth/shared/config';
import { logger } from '@dca-auth/shared/logging/logger';
import { prisma } from '@dca-auth/shared/database/client';

async function startServer() {
  try {
    // Setup error handlers
    setupErrorHandlers();

    // Test database connection
    logger.info('Connecting to database...');
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(config.server.port, config.server.host, () => {
      logger.info(`Server started`, {
        host: config.server.host,
        port: config.server.port,
        environment: config.env,
        version: config.app.version,
      });

      logger.info(`API available at http://${config.server.host}:${config.server.port}`);
      logger.info(`Health check: http://${config.server.host}:${config.server.port}/api/health`);
    });

    // Setup graceful shutdown
    setupGracefulShutdown(server);

    // Handle server errors
    server.on('error', (error: any) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof config.server.port === 'string'
        ? 'Pipe ' + config.server.port
        : 'Port ' + config.server.port;

      switch (error.code) {
        case 'EACCES':
          logger.error(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });

  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  logger.error('Unhandled error during server startup', error);
  process.exit(1);
});