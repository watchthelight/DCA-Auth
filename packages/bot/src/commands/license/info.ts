/**
 * License Info Command
 *
 * Shows information about a license key
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { keyValidatorService } from '@dca-auth/shared/licenses';
import { logger } from '@dca-auth/shared/logging/logger';
import type { Command } from '../../types/command.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('license-info')
    .setDescription('Get information about a license key')
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('The license key or short key')
        .setRequired(true))
    .setDMPermission(true),

  category: 'license',
  cooldown: 3,

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const key = interaction.options.getString('key', true);

      // Find the license
      const license = await client.prisma.licenseKey.findFirst({
        where: {
          OR: [
            { key },
            { shortKey: key },
          ],
        },
        include: {
          owner: {
            select: {
              id: true,
              discordId: true,
              username: true,
            },
          },
          _count: {
            select: {
              activations: true,
              transfers: true,
            },
          },
        },
      });

      if (!license) {
        const embed = new EmbedBuilder()
          .setTitle('License Not Found')
          .setColor(0xff0000)
          .setDescription('The specified license key does not exist.')
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Check if user can view full details
      const isOwner = license.owner?.discordId === interaction.user.id;
      const isAdmin = interaction.memberPermissions?.has('Administrator') || false;
      const canViewFull = isOwner || isAdmin;

      // Create info embed
      const embed = new EmbedBuilder()
        .setTitle('License Information')
        .setColor(license.status === 'ACTIVE' ? 0x00ff00 : 0xff0000)
        .addFields(
          { name: 'Short Key', value: `\`${license.shortKey}\``, inline: true },
          { name: 'Type', value: license.type, inline: true },
          { name: 'Status', value: license.status, inline: true },
        )
        .setTimestamp();

      // Add full details if authorized
      if (canViewFull) {
        embed.addFields(
          {
            name: 'Activations',
            value: `${license.currentActivations}/${license.maxActivations}`,
            inline: true
          },
          {
            name: 'Total Activations',
            value: license._count.activations.toString(),
            inline: true
          },
        );

        if (license.expiresAt) {
          const isExpired = license.expiresAt < new Date();
          embed.addFields({
            name: 'Expires',
            value: isExpired
              ? `Expired <t:${Math.floor(license.expiresAt.getTime() / 1000)}:R>`
              : `<t:${Math.floor(license.expiresAt.getTime() / 1000)}:R>`,
            inline: true,
          });
        }

        if (license.owner) {
          embed.addFields({
            name: 'Owner',
            value: `<@${license.owner.discordId}>`,
            inline: true,
          });
        }

        if (license.name) {
          embed.addFields({
            name: 'Name',
            value: license.name,
            inline: false,
          });
        }

        // Add features if any
        if (license.features && Object.keys(license.features).length > 0) {
          const features = Object.entries(license.features as Record<string, any>)
            .map(([key, value]) => `• ${key}: ${value}`)
            .join('\n')
            .substring(0, 1000);

          embed.addFields({
            name: 'Features',
            value: features || 'None',
            inline: false,
          });
        }

        // Add restrictions if any
        if (license.restrictions && Object.keys(license.restrictions).length > 0) {
          const restrictions = Object.entries(license.restrictions as Record<string, any>)
            .map(([key, value]) => `• ${key}: ${value}`)
            .join('\n')
            .substring(0, 1000);

          embed.addFields({
            name: 'Restrictions',
            value: restrictions || 'None',
            inline: false,
          });
        }

        embed.addFields({
          name: 'Created',
          value: `<t:${Math.floor(license.createdAt.getTime() / 1000)}:F>`,
          inline: false,
        });

      } else {
        embed.setDescription('Limited information shown. You must be the owner to see full details.');
      }

      // Add action buttons for owner
      const components: any[] = [];
      if (isOwner && license.status === 'ACTIVE') {
        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`license_activate:${license.id}`)
              .setLabel('Activate')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(license.currentActivations >= license.maxActivations),
          );

        if (license._count.transfers > 0) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`license_transfers:${license.id}`)
              .setLabel('View Transfers')
              .setStyle(ButtonStyle.Secondary)
          );
        }

        components.push(row);
      }

      await interaction.editReply({
        embeds: [embed],
        components,
      });

    } catch (error) {
      logger.error('Failed to get license info', error);

      const embed = new EmbedBuilder()
        .setTitle('Error')
        .setColor(0xff0000)
        .setDescription('Failed to retrieve license information')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;