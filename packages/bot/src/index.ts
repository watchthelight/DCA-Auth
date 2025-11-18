/**
 * DCA-Auth Discord Bot Entry Point
 *
 * Main entry point for the Discord bot service
 */

import { bot } from './client.js';
import { logger } from '@dca-auth/shared/logging/logger';
import { config } from '@dca-auth/shared/config';

/**
 * Main bot startup
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting DCA-Auth Discord Bot', {
      version: config.app.version,
      environment: config.app.environment,
    });

    // Validate required configuration
    if (!config.discord.bot.token) {
      throw new Error('DISCORD_BOT_TOKEN is not configured');
    }

    if (!config.discord.bot.clientId) {
      throw new Error('DISCORD_CLIENT_ID is not configured');
    }

    // Start the bot
    await bot.start();

    logger.info('Bot started successfully');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await bot.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await bot.shutdown();
      process.exit(0);
    });

    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception', error);
      await bot.shutdown();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      await bot.shutdown();
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start bot', error);
    process.exit(1);
  }
}

// Start the bot
main().catch(error => {
  logger.error('Fatal error during startup', error);
  process.exit(1);
});
