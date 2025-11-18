/**
 * Activate License Command
 *
 * Activates a license key for the user
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { licenseKeyService, keyValidatorService } from '@dca-auth/shared/licenses';
import { logger } from '@dca-auth/shared/logging/logger';
import type { Command } from '../../types/command.js';
import crypto from 'crypto';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('activate')
    .setDescription('Activate a license key')
    .addStringOption(option =>
      option
        .setName('key')
        .setDescription('The license key to activate')
        .setRequired(true))
    .addStringOption(option =>
      option
        .setName('device')
        .setDescription('Device name (optional)')
        .setRequired(false))
    .setDMPermission(true),

  category: 'license',
  cooldown: 10,

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const key = interaction.options.getString('key', true);
      const deviceName = interaction.options.getString('device') || 'Discord Client';

      // Get or create user
      let user = await client.prisma.user.findUnique({
        where: { discordId: interaction.user.id },
      });

      if (!user) {
        // Auto-register user
        user = await client.prisma.user.create({
          data: {
            discordId: interaction.user.id,
            username: interaction.user.username,
            discriminator: interaction.user.discriminator,
            avatarHash: interaction.user.avatar,
            roles: ['USER'],
          },
        });
      }

      // Validate key first
      const validation = await keyValidatorService.validateKey({ key });

      if (!validation.isValid) {
        const embed = new EmbedBuilder()
          .setTitle('Activation Failed')
          .setColor(0xff0000)
          .setDescription(validation.errors?.join('\n') || 'Invalid license key')
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Generate hardware ID from Discord user ID (consistent across sessions)
      const hardwareId = crypto
        .createHash('sha256')
        .update(`discord:${interaction.user.id}`)
        .digest('hex');

      // Activate the license
      const result = await licenseKeyService.activateLicenseKey({
        key,
        userId: user.id,
        hardwareId,
        deviceName,
        ipAddress: '0.0.0.0', // Can't get real IP from Discord
        metadata: {
          platform: 'Discord',
          guildId: interaction.guildId,
          channelId: interaction.channelId,
        },
      });

      // Create success embed
      const embed = new EmbedBuilder()
        .setTitle('License Activated Successfully')
        .setColor(0x00ff00)
        .addFields(
          { name: 'License Type', value: result.licenseKey.type, inline: true },
          { name: 'Device', value: deviceName, inline: true },
          {
            name: 'Activations',
            value: `${result.licenseKey.currentActivations}/${result.licenseKey.maxActivations}`,
            inline: true
          },
        )
        .setTimestamp()
        .setFooter({ text: 'License activated' });

      if (result.licenseKey.expiresAt) {
        embed.addFields({
          name: 'Expires',
          value: `<t:${Math.floor(result.licenseKey.expiresAt.getTime() / 1000)}:R>`,
          inline: true,
        });
      }

      // Add features if any
      if (result.licenseKey.features && Object.keys(result.licenseKey.features).length > 0) {
        const features = Object.entries(result.licenseKey.features as Record<string, any>)
          .map(([key, value]) => `• ${key}: ${value}`)
          .join('\n');

        embed.addFields({
          name: 'Features',
          value: features || 'None',
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });

      logger.info('License activated via bot', {
        licenseId: result.licenseKey.id,
        userId: user.id,
        activationId: result.activation.id,
      });

    } catch (error: any) {
      logger.error('Failed to activate license', error);

      const embed = new EmbedBuilder()
        .setTitle('Activation Failed')
        .setColor(0xff0000)
        .setDescription(error.message || 'Failed to activate license key')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;