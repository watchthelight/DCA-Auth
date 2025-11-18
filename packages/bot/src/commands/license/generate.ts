/**
 * Generate License Command
 *
 * Creates a new license key
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { licenseKeyService } from '@dca-auth/shared/licenses';
import { LicenseKeyType } from '@prisma/client';
import { logger } from '@dca-auth/shared/logging/logger';
import type { Command } from '../../types/command.js';
import ms from 'ms';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('generate')
    .setDescription('Generate a new license key')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('License type')
        .setRequired(true)
        .addChoices(
          { name: 'Trial', value: LicenseKeyType.TRIAL },
          { name: 'Standard', value: LicenseKeyType.STANDARD },
          { name: 'Premium', value: LicenseKeyType.PREMIUM },
          { name: 'Enterprise', value: LicenseKeyType.ENTERPRISE },
          { name: 'Subscription', value: LicenseKeyType.SUBSCRIPTION },
          { name: 'Lifetime', value: LicenseKeyType.LIFETIME },
        ))
    .addUserOption(option =>
      option
        .setName('owner')
        .setDescription('License owner')
        .setRequired(false))
    .addIntegerOption(option =>
      option
        .setName('activations')
        .setDescription('Maximum activations allowed')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(100))
    .addStringOption(option =>
      option
        .setName('expires')
        .setDescription('Expiration time (e.g., 30d, 1y, never)')
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('License name/description')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false) as SlashCommandBuilder,

  category: 'license',
  cooldown: 5,
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Get options
      const type = interaction.options.getString('type', true) as LicenseKeyType;
      const owner = interaction.options.getUser('owner');
      const maxActivations = interaction.options.getInteger('activations') || 1;
      const expiresStr = interaction.options.getString('expires');
      const name = interaction.options.getString('name');

      // Get or create user for creator
      let creator = await client.prisma.user.findUnique({
        where: { discordId: interaction.user.id },
      });

      if (!creator) {
        // Auto-register user
        creator = await client.prisma.user.create({
          data: {
            discordId: interaction.user.id,
            username: interaction.user.username,
            discriminator: interaction.user.discriminator,
            avatarHash: interaction.user.avatar,
            roles: ['USER'],
          },
        });
      }

      // Get owner if specified
      let ownerId = undefined;
      if (owner) {
        let ownerUser = await client.prisma.user.findUnique({
          where: { discordId: owner.id },
        });

        if (!ownerUser) {
          // Auto-register owner
          ownerUser = await client.prisma.user.create({
            data: {
              discordId: owner.id,
              username: owner.username,
              discriminator: owner.discriminator,
              avatarHash: owner.avatar,
              roles: ['USER'],
            },
          });
        }

        ownerId = ownerUser.id;
      }

      // Calculate expiration
      let expiresAt = undefined;
      if (expiresStr && expiresStr !== 'never') {
        try {
          const duration = ms(expiresStr);
          if (duration) {
            expiresAt = new Date(Date.now() + duration);
          }
        } catch (error) {
          await interaction.editReply({
            content: 'Invalid expiration format. Use formats like: 30d, 1y, 6m',
          });
          return;
        }
      }

      // Create license key
      const license = await licenseKeyService.createLicenseKey(
        {
          type,
          ownerId,
          name: name || `${type} License`,
          maxActivations,
          expiresAt,
          metadata: {
            createdViaBot: true,
            guildId: interaction.guildId,
            guildName: interaction.guild?.name,
            creatorId: interaction.user.id,
          },
        },
        creator.id
      );

      // Create response embed
      const embed = new EmbedBuilder()
        .setTitle('License Key Generated')
        .setColor(0x00ff00)
        .addFields(
          { name: 'License Key', value: `\`${license.key}\``, inline: false },
          { name: 'Short Key', value: `\`${license.shortKey}\``, inline: true },
          { name: 'Type', value: license.type, inline: true },
          { name: 'Max Activations', value: license.maxActivations.toString(), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `Generated by ${interaction.user.tag}` });

      if (license.expiresAt) {
        embed.addFields({
          name: 'Expires',
          value: `<t:${Math.floor(license.expiresAt.getTime() / 1000)}:R>`,
          inline: true,
        });
      }

      if (owner) {
        embed.addFields({
          name: 'Owner',
          value: `${owner.tag}`,
          inline: true,
        });

        // Try to DM the owner
        try {
          const ownerEmbed = new EmbedBuilder()
            .setTitle('License Key Assigned')
            .setDescription(`You've been assigned a new license key!`)
            .setColor(0x00ff00)
            .addFields(
              { name: 'License Key', value: `\`${license.key}\``, inline: false },
              { name: 'Type', value: license.type, inline: true },
              { name: 'Max Activations', value: license.maxActivations.toString(), inline: true },
            )
            .setTimestamp();

          if (license.expiresAt) {
            ownerEmbed.addFields({
              name: 'Expires',
              value: `<t:${Math.floor(license.expiresAt.getTime() / 1000)}:R>`,
              inline: true,
            });
          }

          await owner.send({ embeds: [ownerEmbed] });
          embed.setDescription('License key generated and sent to owner via DM');
        } catch (error) {
          embed.setDescription('License key generated (failed to DM owner)');
        }
      }

      await interaction.editReply({ embeds: [embed] });

      logger.info('License key generated via bot', {
        licenseId: license.id,
        type: license.type,
        creatorId: interaction.user.id,
        guildId: interaction.guildId,
      });

    } catch (error) {
      logger.error('Failed to generate license key', error);

      await interaction.editReply({
        content: 'Failed to generate license key. Please try again later.',
      });
    }
  },
};

export default command;