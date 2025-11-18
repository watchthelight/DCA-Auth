/**
 * Deploy Commands Script
 *
 * Registers slash commands with Discord
 */

import { bot } from './client.js';
import { logger } from '@dca-auth/shared/logging/logger';
import { config } from '@dca-auth/shared/config';

async function deployCommands(): Promise<void> {
  try {
    logger.info('Starting command deployment...');

    // Validate configuration
    if (!config.discord.bot.token) {
      throw new Error('DISCORD_BOT_TOKEN is not configured');
    }

    if (!config.discord.bot.clientId) {
      throw new Error('DISCORD_CLIENT_ID is not configured');
    }

    // Load commands (but don't start the bot)
    await bot.loadCommands();

    // Deploy commands to Discord
    await bot.deployCommands();

    logger.info('Commands deployed successfully!');

    // Exit
    process.exit(0);

  } catch (error) {
    logger.error('Failed to deploy commands', error);
    process.exit(1);
  }
}

// Run deployment
deployCommands();