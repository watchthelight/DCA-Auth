/**
 * Interaction Create Event
 *
 * Handles all Discord interactions (commands, buttons, modals, etc.)
 */

import {
  Events,
  CommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  Collection,
  PermissionsBitField,
} from 'discord.js';
import { logger } from '@dca-auth/shared/logging/logger';
import { auditService } from '@dca-auth/shared/services/audit.service';
import { AuditAction } from '@prisma/client';
import type { Event } from '../types/event.js';
import type { Command } from '../types/command.js';

export const event: Event<Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    try {
      // Handle slash commands
      if (interaction.isChatInputCommand()) {
        await handleCommand(client, interaction);
      }

      // Handle autocomplete
      else if (interaction.isAutocomplete()) {
        await handleAutocomplete(client, interaction);
      }

      // Handle button interactions
      else if (interaction.isButton()) {
        await handleButton(client, interaction);
      }

      // Handle select menu interactions
      else if (interaction.isStringSelectMenu()) {
        await handleSelectMenu(client, interaction);
      }

      // Handle modal submissions
      else if (interaction.isModalSubmit()) {
        await handleModalSubmit(client, interaction);
      }

    } catch (error) {
      logger.error('Error handling interaction', {
        error,
        type: interaction.type,
        user: interaction.user.tag,
      });

      // Send error response if possible
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          ephemeral: true,
        }).catch(() => {});
      }
    }
  },
};

/**
 * Handle slash command interactions
 */
async function handleCommand(client: any, interaction: CommandInteraction): Promise<void> {
  const command = client.commands.get(interaction.commandName) as Command | undefined;

  if (!command) {
    logger.warn(`Unknown command: ${interaction.commandName}`);
    await interaction.reply({
      content: 'Unknown command.',
      ephemeral: true,
    });
    return;
  }

  // Check if command is guild-only
  if (command.guildOnly && !interaction.inGuild()) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  // Check if command is DM-only
  if (command.dmOnly && interaction.inGuild()) {
    await interaction.reply({
      content: 'This command can only be used in DMs.',
      ephemeral: true,
    });
    return;
  }

  // Check permissions
  if (command.permissions && interaction.inGuild()) {
    const member = interaction.member;
    if (!member || typeof member.permissions === 'string') {
      await interaction.reply({
        content: 'Unable to verify permissions.',
        ephemeral: true,
      });
      return;
    }

    const memberPerms = member.permissions as PermissionsBitField;
    const hasPermission = command.permissions.every(perm => memberPerms.has(perm));

    if (!hasPermission) {
      await interaction.reply({
        content: 'You do not have permission to use this command.',
        ephemeral: true,
      });
      return;
    }
  }

  // Handle cooldowns
  if (command.cooldown) {
    const cooldowns = client.cooldowns;
    if (!cooldowns.has(command.data.name)) {
      cooldowns.set(command.data.name, new Collection());
    }

    const now = Date.now();
    const timestamps = cooldowns.get(command.data.name)!;
    const cooldownAmount = (command.cooldown || 3) * 1000;

    if (timestamps.has(interaction.user.id)) {
      const expirationTime = timestamps.get(interaction.user.id)! + cooldownAmount;

      if (now < expirationTime) {
        const timeLeft = (expirationTime - now) / 1000;
        await interaction.reply({
          content: `Please wait ${timeLeft.toFixed(1)} more seconds before using this command again.`,
          ephemeral: true,
        });
        return;
      }
    }

    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
  }

  try {
    // Log command usage
    logger.info('Command executed', {
      command: interaction.commandName,
      user: interaction.user.tag,
      userId: interaction.user.id,
      guild: interaction.guild?.name || 'DM',
      guildId: interaction.guild?.id || null,
    });

    // Execute the command
    await command.execute(interaction, client);

    // Audit log for certain commands
    if (command.category === 'admin' || command.category === 'license') {
      const user = await client.prisma.user.findUnique({
        where: { discordId: interaction.user.id },
      });

      if (user) {
        await auditService.log({
          userId: user.id,
          action: AuditAction.COMMAND_EXECUTED,
          entityType: 'command',
          entityId: interaction.commandName,
          details: {
            command: interaction.commandName,
            options: interaction.options.data,
            guild: interaction.guild?.name,
            guildId: interaction.guild?.id,
          },
        });
      }
    }

  } catch (error) {
    logger.error('Command execution failed', {
      error,
      command: interaction.commandName,
      user: interaction.user.tag,
    });

    const errorMessage = 'There was an error executing this command.';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: errorMessage,
        ephemeral: true,
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: errorMessage,
        ephemeral: true,
      }).catch(() => {});
    }
  }
}

/**
 * Handle autocomplete interactions
 */
async function handleAutocomplete(client: any, interaction: AutocompleteInteraction): Promise<void> {
  const command = client.commands.get(interaction.commandName) as Command | undefined;

  if (!command || !command.autocomplete) {
    return;
  }

  try {
    await command.autocomplete(interaction, client);
  } catch (error) {
    logger.error('Autocomplete failed', {
      error,
      command: interaction.commandName,
      user: interaction.user.tag,
    });
  }
}

/**
 * Handle button interactions
 */
async function handleButton(client: any, interaction: ButtonInteraction): Promise<void> {
  const [action, ...params] = interaction.customId.split(':');

  // Handle different button actions
  switch (action) {
    case 'license_activate':
      // Handle license activation button
      await interaction.reply({
        content: 'Processing license activation...',
        ephemeral: true,
      });
      break;

    case 'license_info':
      // Handle license info button
      await interaction.reply({
        content: 'Fetching license information...',
        ephemeral: true,
      });
      break;

    default:
      await interaction.reply({
        content: 'Unknown button action.',
        ephemeral: true,
      });
  }
}

/**
 * Handle select menu interactions
 */
async function handleSelectMenu(client: any, interaction: StringSelectMenuInteraction): Promise<void> {
  const [action, ...params] = interaction.customId.split(':');

  // Handle different select menu actions
  switch (action) {
    case 'help_category':
      // Handle help category selection
      const category = interaction.values[0];
      await interaction.update({
        content: `Showing help for category: ${category}`,
      });
      break;

    default:
      await interaction.reply({
        content: 'Unknown selection.',
        ephemeral: true,
      });
  }
}

/**
 * Handle modal submit interactions
 */
async function handleModalSubmit(client: any, interaction: ModalSubmitInteraction): Promise<void> {
  const [action, ...params] = interaction.customId.split(':');

  // Handle different modal submissions
  switch (action) {
    case 'license_create':
      // Handle license creation modal
      await interaction.reply({
        content: 'Creating license key...',
        ephemeral: true,
      });
      break;

    default:
      await interaction.reply({
        content: 'Unknown modal submission.',
        ephemeral: true,
      });
  }
}

export default event;