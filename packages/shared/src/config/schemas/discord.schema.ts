/**
 * Discord Configuration Schema
 *
 * Defines Discord bot settings, OAuth configuration,
 * and API integration options.
 */

import { z } from 'zod';

export const discordConfigSchema = z.object({
  bot: z.object({
    token: z.string().min(1).describe('Discord bot token'),
    clientId: z.string().min(1).describe('Discord application client ID'),
    publicKey: z.string().optional().describe('Discord application public key'),
    guildId: z.string().optional().describe('Development guild ID for testing'),
    prefix: z.string().default('!').describe('Command prefix for text commands'),
    owners: z.array(z.string()).default([]).describe('Bot owner Discord IDs'),
    admins: z.array(z.string()).default([]).describe('Bot admin Discord IDs'),
  }),

  oauth: z.object({
    clientSecret: z.string().min(1).describe('Discord OAuth client secret'),
    redirectUri: z.string().url().describe('OAuth redirect URI'),
    scopes: z.array(z.enum([
      'identify',
      'email',
      'guilds',
      'guilds.join',
      'guilds.members.read',
      'gdm.join',
      'bot',
      'webhook.incoming'
    ])).default(['identify', 'guilds', 'email']),
    prompt: z.enum(['none', 'consent']).default('none'),
  }),

  api: z.object({
    version: z.coerce.number().default(10),
    baseUrl: z.string().url().default('https://discord.com/api'),
    cdnUrl: z.string().url().default('https://cdn.discordapp.com'),
    timeout: z.coerce.number().default(15000),
    retries: z.coerce.number().default(3),
  }),

  gateway: z.object({
    intents: z.array(z.enum([
      'GUILDS',
      'GUILD_MEMBERS',
      'GUILD_MODERATION',
      'GUILD_EMOJIS_AND_STICKERS',
      'GUILD_INTEGRATIONS',
      'GUILD_WEBHOOKS',
      'GUILD_INVITES',
      'GUILD_VOICE_STATES',
      'GUILD_PRESENCES',
      'GUILD_MESSAGES',
      'GUILD_MESSAGE_REACTIONS',
      'GUILD_MESSAGE_TYPING',
      'DIRECT_MESSAGES',
      'DIRECT_MESSAGE_REACTIONS',
      'DIRECT_MESSAGE_TYPING',
      'MESSAGE_CONTENT',
      'GUILD_SCHEDULED_EVENTS',
      'AUTO_MODERATION_CONFIGURATION',
      'AUTO_MODERATION_EXECUTION'
    ])).default(['GUILDS', 'GUILD_MEMBERS', 'GUILD_MESSAGES']),
    shards: z.union([z.literal('auto'), z.coerce.number()]).default('auto'),
    shardCount: z.coerce.number().optional(),
    largeThreshold: z.coerce.number().default(50),
    compress: z.boolean().default(false),
    presence: z.object({
      status: z.enum(['online', 'idle', 'dnd', 'invisible']).default('online'),
      activities: z.array(z.object({
        name: z.string(),
        type: z.enum(['PLAYING', 'STREAMING', 'LISTENING', 'WATCHING', 'COMPETING']),
        url: z.string().url().optional(),
      })).default([]),
    }).optional(),
  }),

  commands: z.object({
    global: z.boolean().default(false).describe('Register commands globally'),
    guilds: z.array(z.string()).default([]).describe('Guild IDs for guild commands'),
    autoSync: z.boolean().default(true).describe('Auto-sync slash commands on startup'),
    ephemeral: z.boolean().default(false).describe('Make responses ephemeral by default'),
  }),

  cache: z.object({
    messages: z.coerce.number().default(200),
    users: z.coerce.number().default(1000),
    members: z.coerce.number().default(1000),
    channels: z.coerce.number().default(500),
    guilds: z.coerce.number().default(100),
    roles: z.coerce.number().default(500),
    emojis: z.coerce.number().default(100),
  }),

  features: z.object({
    autoRole: z.boolean().default(false),
    welcomeMessage: z.boolean().default(true),
    logging: z.boolean().default(true),
    moderation: z.boolean().default(true),
    verification: z.boolean().default(true),
    analytics: z.boolean().default(true),
  }),
});

export type DiscordConfig = z.infer<typeof discordConfigSchema>;