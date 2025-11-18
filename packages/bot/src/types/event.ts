/**
 * Event Type Definitions
 *
 * Types for Discord events
 */

import { ClientEvents } from 'discord.js';
import type { DCAAuthBot } from '../client.js';

export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (client: DCAAuthBot, ...args: ClientEvents[K]) => Promise<void> | void;
}

export type EventHandler<K extends keyof ClientEvents> = (
  client: DCAAuthBot,
  ...args: ClientEvents[K]
) => Promise<void> | void;