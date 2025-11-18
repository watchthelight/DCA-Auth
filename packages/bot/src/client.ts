/**
 * Discord Bot Client
 *
 * Main bot client configuration and initialization
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  REST,
  Routes,
} from 'discord.js';
import { config } from '@dca-auth/shared/config';
import { logger } from '@dca-auth/shared/logging/logger';
import { prisma } from '@dca-auth/shared/database/client';
import type { Command } from './types/command.js';
import type { Event } from './types/event.js';

export class DCAAuthBot extends Client {
  public commands: Collection<string, Command>;
  public cooldowns: Collection<string, Collection<string, number>>;
  public prisma: typeof prisma;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
      ],
      partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.Message,
        Partials.User,
      ],
    });

    this.commands = new Collection();
    this.cooldowns = new Collection();
    this.prisma = prisma;
  }

  /**
   * Load all commands from the commands directory
   */
  async loadCommands(): Promise<void> {
    try {
      const { loadCommands } = await import('./handlers/command-handler.js');
      await loadCommands(this);
      logger.info(`Loaded ${this.commands.size} commands`);
    } catch (error) {
      logger.error('Failed to load commands', error);
      throw error;
    }
  }

  /**
   * Load all events from the events directory
   */
  async loadEvents(): Promise<void> {
    try {
      const { loadEvents } = await import('./handlers/event-handler.js');
      await loadEvents(this);
      logger.info('Events loaded successfully');
    } catch (error) {
      logger.error('Failed to load events', error);
      throw error;
    }
  }

  /**
   * Register slash commands with Discord
   */
  async deployCommands(): Promise<void> {
    try {
      const rest = new REST({ version: '10' }).setToken(config.discord.bot.token);

      const commands = Array.from(this.commands.values()).map(cmd => cmd.data.toJSON());

      logger.info(`Deploying ${commands.length} slash commands...`);

      if (config.app.environment === 'production') {
        // Deploy commands globally in production
        await rest.put(
          Routes.applicationCommands(config.discord.bot.clientId),
          { body: commands }
        );
        logger.info('Commands deployed globally');
      } else {
        // Deploy commands to test guild in development
        if (!config.discord.bot.guildId) {
          logger.warn('DISCORD_GUILD_ID not set, skipping command deployment');
          return;
        }

        await rest.put(
          Routes.applicationGuildCommands(config.discord.bot.clientId, config.discord.bot.guildId),
          { body: commands }
        );
        logger.info(`Commands deployed to test guild ${config.discord.bot.guildId}`);
      }
    } catch (error) {
      logger.error('Failed to deploy commands', error);
      throw error;
    }
  }

  /**
   * Connect to database
   */
  async connectDatabase(): Promise<void> {
    try {
      await this.prisma.$connect();
      logger.info('Database connected');
    } catch (error) {
      logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    try {
      // Connect to database first
      await this.connectDatabase();

      // Load commands and events
      await this.loadCommands();
      await this.loadEvents();

      // Login to Discord
      await this.login(config.discord.bot.token);
    } catch (error) {
      logger.error('Failed to start bot', error);
      throw error;
    }
  }

  /**
   * Shutdown the bot gracefully
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down bot...');

      // Disconnect from Discord
      this.destroy();

      // Close database connection
      await this.prisma.$disconnect();

      logger.info('Bot shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown', error);
      throw error;
    }
  }
}

// Create singleton instance
export const bot = new DCAAuthBot();