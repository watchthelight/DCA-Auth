/**
 * Command Handler
 *
 * Loads and manages Discord slash commands
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '@dca-auth/shared/logging/logger';
import type { DCAAuthBot } from '../client.js';
import type { Command } from '../types/command.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load all commands from the commands directory
 */
export async function loadCommands(client: DCAAuthBot): Promise<void> {
  const commandsPath = join(__dirname, '..', 'commands');

  try {
    // Read all category folders
    const categories = readdirSync(commandsPath);

    for (const category of categories) {
      const categoryPath = join(commandsPath, category);

      // Skip if not a directory
      const stat = await import('fs').then(fs =>
        fs.promises.stat(categoryPath)
      );
      if (!stat.isDirectory()) continue;

      // Read all command files in the category
      const commandFiles = readdirSync(categoryPath).filter(file =>
        file.endsWith('.js') || file.endsWith('.ts')
      );

      for (const file of commandFiles) {
        const filePath = join(categoryPath, file);

        try {
          // Import the command
          const commandModule = await import(`file://${filePath}`);
          const command: Command = commandModule.default || commandModule.command;

          if (!command) {
            logger.warn(`Command file ${file} does not export a command`);
            continue;
          }

          // Validate command structure
          if (!command.data || !command.execute) {
            logger.warn(`Command ${file} is missing required properties`);
            continue;
          }

          // Add to collection
          client.commands.set(command.data.name, command);
          logger.debug(`Loaded command: ${command.data.name}`);

        } catch (error) {
          logger.error(`Failed to load command ${file}`, error);
        }
      }
    }

    logger.info(`Successfully loaded ${client.commands.size} commands`);
  } catch (error) {
    logger.error('Failed to load commands directory', error);
    throw error;
  }
}