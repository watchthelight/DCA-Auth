/**
 * Ready Event
 *
 * Fired when the bot successfully connects to Discord
 */

import { Events, ActivityType } from 'discord.js';
import { logger } from '@dca-auth/shared/logging/logger';
import type { Event } from '../types/event.js';

export const event: Event<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    if (!client.user) return;

    logger.info(`Bot logged in as ${client.user.tag}`);
    logger.info(`Serving ${client.guilds.cache.size} guilds`);

    // Set bot status
    client.user.setPresence({
      activities: [{
        name: 'license keys',
        type: ActivityType.Watching,
      }],
      status: 'online',
    });

    // Deploy commands if needed
    if (process.env.DEPLOY_COMMANDS === 'true') {
      try {
        await client.deployCommands();
        logger.info('Commands deployed successfully');
      } catch (error) {
        logger.error('Failed to deploy commands on ready', error);
      }
    }

    // Log system stats
    const stats = {
      guilds: client.guilds.cache.size,
      channels: client.channels.cache.size,
      users: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
    };

    logger.info('Bot ready', stats);
  },
};

export default event;