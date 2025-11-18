/**
 * Guild Setup Command
 *
 * Configure guild settings for DCA-Auth
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { logger } from '@dca-auth/shared/logging/logger';
import type { Command } from '../../types/command.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure DCA-Auth for this server')
    .addSubcommand(subcommand =>
      subcommand
        .setName('init')
        .setDescription('Initialize guild configuration'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('logs')
        .setDescription('Set log channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel for bot logs')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('welcome')
        .setDescription('Set welcome channel')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Channel for welcome messages')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('rolesync')
        .setDescription('Toggle automatic role-based license management')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable or disable role sync')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('autoregister')
        .setDescription('Toggle automatic user registration')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable or disable auto-registration')
            .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false) as SlashCommandBuilder,

  category: 'admin',
  cooldown: 5,
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute(interaction, client) {
    if (!interaction.guild) return;

    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    try {
      // Get or create guild config
      let guildConfig = await client.prisma.guildConfig.findUnique({
        where: { guildId: interaction.guild.id },
      });

      switch (subcommand) {
        case 'init': {
          if (!guildConfig) {
            // Create new config
            guildConfig = await client.prisma.guildConfig.create({
              data: {
                guildId: interaction.guild.id,
                guildName: interaction.guild.name,
                ownerId: interaction.guild.ownerId,
                enabled: true,
                roleSync: false,
                autoRegister: false,
                requireEmail: false,
              },
            });

            const embed = new EmbedBuilder()
              .setTitle('Guild Configuration Created')
              .setDescription('DCA-Auth has been initialized for this server.')
              .setColor(0x00ff00)
              .addFields(
                { name: 'Guild ID', value: interaction.guild.id, inline: true },
                { name: 'Owner', value: `<@${interaction.guild.ownerId}>`, inline: true },
                { name: 'Status', value: 'Enabled', inline: true },
              )
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          } else {
            const embed = new EmbedBuilder()
              .setTitle('Configuration Exists')
              .setDescription('Guild configuration already exists.')
              .setColor(0xffff00)
              .addFields(
                { name: 'Status', value: guildConfig.enabled ? 'Enabled' : 'Disabled', inline: true },
                { name: 'Role Sync', value: guildConfig.roleSync ? 'On' : 'Off', inline: true },
                { name: 'Auto Register', value: guildConfig.autoRegister ? 'On' : 'Off', inline: true },
              )
              .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
          }
          break;
        }

        case 'logs': {
          if (!guildConfig) {
            await interaction.editReply({
              content: 'Please run `/setup init` first to initialize guild configuration.',
            });
            return;
          }

          const channel = interaction.options.getChannel('channel', true);

          await client.prisma.guildConfig.update({
            where: { guildId: interaction.guild.id },
            data: {
              logChannelId: channel.id,
            },
          });

          const embed = new EmbedBuilder()
            .setTitle('Log Channel Updated')
            .setDescription(`Bot logs will be sent to <#${channel.id}>`)
            .setColor(0x00ff00)
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case 'welcome': {
          if (!guildConfig) {
            await interaction.editReply({
              content: 'Please run `/setup init` first to initialize guild configuration.',
            });
            return;
          }

          const channel = interaction.options.getChannel('channel', true);

          await client.prisma.guildConfig.update({
            where: { guildId: interaction.guild.id },
            data: {
              welcomeChannelId: channel.id,
            },
          });

          const embed = new EmbedBuilder()
            .setTitle('Welcome Channel Updated')
            .setDescription(`Welcome messages will be sent to <#${channel.id}>`)
            .setColor(0x00ff00)
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case 'rolesync': {
          if (!guildConfig) {
            await interaction.editReply({
              content: 'Please run `/setup init` first to initialize guild configuration.',
            });
            return;
          }

          const enabled = interaction.options.getBoolean('enabled', true);

          await client.prisma.guildConfig.update({
            where: { guildId: interaction.guild.id },
            data: {
              roleSync: enabled,
            },
          });

          const embed = new EmbedBuilder()
            .setTitle('Role Sync Updated')
            .setDescription(
              enabled
                ? 'Automatic license management based on roles is now **enabled**.'
                : 'Automatic license management based on roles is now **disabled**.'
            )
            .setColor(enabled ? 0x00ff00 : 0xffff00)
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case 'autoregister': {
          if (!guildConfig) {
            await interaction.editReply({
              content: 'Please run `/setup init` first to initialize guild configuration.',
            });
            return;
          }

          const enabled = interaction.options.getBoolean('enabled', true);

          await client.prisma.guildConfig.update({
            where: { guildId: interaction.guild.id },
            data: {
              autoRegister: enabled,
            },
          });

          const embed = new EmbedBuilder()
            .setTitle('Auto-Registration Updated')
            .setDescription(
              enabled
                ? 'New users will be automatically registered when they join.'
                : 'Automatic user registration is now disabled.'
            )
            .setColor(enabled ? 0x00ff00 : 0xffff00)
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          break;
        }
      }

      logger.info('Guild configuration updated', {
        guildId: interaction.guild.id,
        subcommand,
        updatedBy: interaction.user.id,
      });

    } catch (error) {
      logger.error('Failed to update guild configuration', error);

      await interaction.editReply({
        content: 'Failed to update configuration. Please try again later.',
      });
    }
  },
};

export default command;