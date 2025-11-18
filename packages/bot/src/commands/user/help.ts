/**
 * Help Command
 *
 * Shows available commands and information
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { CommandCategories } from '../../types/command.js';
import type { Command } from '../../types/command.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show help and available commands')
    .addStringOption(option =>
      option
        .setName('command')
        .setDescription('Get help for a specific command')
        .setRequired(false)
        .setAutocomplete(true))
    .setDMPermission(true),

  category: 'utility',
  cooldown: 3,

  async execute(interaction, client) {
    const specificCommand = interaction.options.getString('command');

    if (specificCommand) {
      // Show help for specific command
      const command = client.commands.get(specificCommand);

      if (!command) {
        await interaction.reply({
          content: `Command \`${specificCommand}\` not found.`,
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Command: /${command.data.name}`)
        .setDescription(command.data.description)
        .setColor(0x5865f2)
        .addFields({
          name: 'Category',
          value: CommandCategories[command.category]?.name || 'Unknown',
          inline: true,
        });

      if (command.cooldown) {
        embed.addFields({
          name: 'Cooldown',
          value: `${command.cooldown} seconds`,
          inline: true,
        });
      }

      if (command.guildOnly) {
        embed.addFields({
          name: 'Guild Only',
          value: 'This command can only be used in servers',
          inline: false,
        });
      }

      if (command.dmOnly) {
        embed.addFields({
          name: 'DM Only',
          value: 'This command can only be used in DMs',
          inline: false,
        });
      }

      // Add options if any
      const options = command.data.options;
      if (options && options.length > 0) {
        const optionsList = options
          .map((opt: any) => {
            const required = opt.required ? ' *(required)*' : '';
            return `• **${opt.name}**${required}: ${opt.description}`;
          })
          .join('\n');

        embed.addFields({
          name: 'Options',
          value: optionsList.substring(0, 1024),
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // Show general help
    const embed = new EmbedBuilder()
      .setTitle('DCA-Auth Bot Help')
      .setDescription('Discord-Connected Authorization System')
      .setColor(0x5865f2)
      .addFields({
        name: 'About',
        value: 'DCA-Auth is a comprehensive license key management system with Discord integration.',
        inline: false,
      })
      .setTimestamp();

    // Group commands by category
    const categories = new Map<string, Command[]>();
    client.commands.forEach(cmd => {
      const category = cmd.category || 'utility';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(cmd);
    });

    // Add command categories
    categories.forEach((commands, category) => {
      const categoryInfo = CommandCategories[category];
      if (!categoryInfo) return;

      // Filter commands based on permissions
      const visibleCommands = commands.filter(cmd => {
        // Check if user has required permissions
        if (cmd.permissions && interaction.inGuild()) {
          const member = interaction.member;
          if (!member || typeof member.permissions === 'string') return false;
          // Simple check - in production you'd want more sophisticated permission checking
        }
        return true;
      });

      if (visibleCommands.length === 0) return;

      const commandList = visibleCommands
        .map(cmd => `\`/${cmd.data.name}\``)
        .join(', ');

      embed.addFields({
        name: `${categoryInfo.emoji} ${categoryInfo.name}`,
        value: commandList.substring(0, 1024),
        inline: false,
      });
    });

    // Add additional help information
    embed.addFields(
      {
        name: 'Quick Start',
        value:
          '• Use `/activate <key>` to activate a license\n' +
          '• Use `/profile` to view your licenses\n' +
          '• Use `/license-info <key>` to check a license',
        inline: false,
      },
      {
        name: 'Support',
        value: 'For support, contact an administrator or visit our website.',
        inline: false,
      }
    );

    // Create category selector
    const select = new StringSelectMenuBuilder()
      .setCustomId('help_category')
      .setPlaceholder('Select a category for detailed help')
      .addOptions(
        Object.entries(CommandCategories).map(([key, value]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(value.name)
            .setDescription(value.description)
            .setValue(key)
            .setEmoji(value.emoji)
        )
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(select);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  },

  async autocomplete(interaction, client) {
    const focusedValue = interaction.options.getFocused();
    const choices = Array.from(client.commands.keys());

    const filtered = choices
      .filter(choice => choice.startsWith(focusedValue))
      .slice(0, 25);

    await interaction.respond(
      filtered.map(choice => ({ name: choice, value: choice }))
    );
  },
};

export default command;