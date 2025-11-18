/**
 * Event Handler
 *
 * Loads and manages Discord events
 */

import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '@dca-auth/shared/logging/logger';
import type { DCAAuthBot } from '../client.js';
import type { Event } from '../types/event.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load all events from the events directory
 */
export async function loadEvents(client: DCAAuthBot): Promise<void> {
  const eventsPath = join(__dirname, '..', 'events');

  try {
    const eventFiles = readdirSync(eventsPath).filter(file =>
      file.endsWith('.js') || file.endsWith('.ts')
    );

    for (const file of eventFiles) {
      const filePath = join(eventsPath, file);

      try {
        // Import the event
        const eventModule = await import(`file://${filePath}`);
        const event: Event = eventModule.default || eventModule.event;

        if (!event) {
          logger.warn(`Event file ${file} does not export an event`);
          continue;
        }

        // Validate event structure
        if (!event.name || !event.execute) {
          logger.warn(`Event ${file} is missing required properties`);
          continue;
        }

        // Register event
        if (event.once) {
          client.once(event.name, (...args) => event.execute(client, ...args));
        } else {
          client.on(event.name, (...args) => event.execute(client, ...args));
        }

        logger.debug(`Loaded event: ${event.name} (${event.once ? 'once' : 'on'})`);

      } catch (error) {
        logger.error(`Failed to load event ${file}`, error);
      }
    }

    logger.info('All events loaded successfully');
  } catch (error) {
    logger.error('Failed to load events directory', error);
    throw error;
  }
}