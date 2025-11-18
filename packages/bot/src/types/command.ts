/**
 * Command Type Definitions
 *
 * Types for Discord slash commands
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  AutocompleteInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import type { DCAAuthBot } from '../client.js';

export interface Command {
  data: SlashCommandBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
  category: 'license' | 'user' | 'admin' | 'utility';
  cooldown?: number; // Cooldown in seconds
  guildOnly?: boolean;
  dmOnly?: boolean;
  permissions?: bigint[];
  execute: (interaction: CommandInteraction, client: DCAAuthBot) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, client: DCAAuthBot) => Promise<void>;
}

export interface CommandCategory {
  name: string;
  description: string;
  emoji: string;
}

export const CommandCategories: Record<string, CommandCategory> = {
  license: {
    name: 'License Management',
    description: 'Commands for managing license keys',
    emoji: '🔑',
  },
  user: {
    name: 'User Management',
    description: 'Commands for user account management',
    emoji: '👤',
  },
  admin: {
    name: 'Administration',
    description: 'Administrative commands',
    emoji: '⚙️',
  },
  utility: {
    name: 'Utility',
    description: 'Utility and help commands',
    emoji: '🔧',
  },
};