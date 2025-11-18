/**
 * User Profile Command
 *
 * Shows user profile and license information
 */

import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { logger } from '@dca-auth/shared/logging/logger';
import type { Command } from '../../types/command.js';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your profile and licenses')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to view (admin only)')
        .setRequired(false))
    .setDMPermission(true),

  category: 'user',
  cooldown: 5,

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Determine target user
      const targetDiscordUser = interaction.options.getUser('user') || interaction.user;
      const isViewingOther = targetDiscordUser.id !== interaction.user.id;

      // Check permissions if viewing another user
      if (isViewingOther && !interaction.memberPermissions?.has('Administrator')) {
        await interaction.editReply({
          content: 'You can only view your own profile.',
        });
        return;
      }

      // Get user from database
      const user = await client.prisma.user.findUnique({
        where: { discordId: targetDiscordUser.id },
        include: {
          profile: true,
          ownedLicenses: {
            where: {
              status: 'ACTIVE',
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } },
              ],
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          _count: {
            select: {
              ownedLicenses: true,
              sessions: true,
              activations: true,
            },
          },
        },
      });

      if (!user) {
        const embed = new EmbedBuilder()
          .setTitle('User Not Found')
          .setColor(0xff0000)
          .setDescription('This user is not registered in the system.')
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Create profile embed
      const embed = new EmbedBuilder()
        .setTitle(`${targetDiscordUser.tag}'s Profile`)
        .setThumbnail(targetDiscordUser.displayAvatarURL())
        .setColor(0x5865f2)
        .addFields(
          { name: 'Username', value: user.username, inline: true },
          { name: 'Discord ID', value: user.discordId, inline: true },
          { name: 'Status', value: user.status, inline: true },
        )
        .setTimestamp();

      // Add roles
      if (user.roles.length > 0) {
        embed.addFields({
          name: 'Roles',
          value: user.roles.join(', '),
          inline: true,
        });
      }

      // Add statistics
      embed.addFields(
        {
          name: 'Total Licenses',
          value: user._count.ownedLicenses.toString(),
          inline: true
        },
        {
          name: 'Active Activations',
          value: user._count.activations.toString(),
          inline: true
        },
      );

      // Add account dates
      embed.addFields(
        {
          name: 'Registered',
          value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`,
          inline: true
        },
      );

      if (user.lastLoginAt) {
        embed.addFields({
          name: 'Last Login',
          value: `<t:${Math.floor(user.lastLoginAt.getTime() / 1000)}:R>`,
          inline: true
        });
      }

      // Add verification status
      const verificationStatus = [];
      if (user.isEmailVerified) verificationStatus.push('✅ Email');
      if (user.twoFactorEnabled) verificationStatus.push('🔐 2FA');
      if (user.isBanned) verificationStatus.push('⛔ Banned');

      if (verificationStatus.length > 0) {
        embed.addFields({
          name: 'Verification',
          value: verificationStatus.join('\n'),
          inline: true,
        });
      }

      // Add active licenses
      if (user.ownedLicenses.length > 0) {
        const licenseList = user.ownedLicenses
          .map(license => {
            const status = license.currentActivations >= license.maxActivations
              ? '🔴'
              : '🟢';
            const expires = license.expiresAt
              ? ` (expires <t:${Math.floor(license.expiresAt.getTime() / 1000)}:R>)`
              : '';
            return `${status} \`${license.shortKey}\` - ${license.type}${expires}`;
          })
          .join('\n');

        embed.addFields({
          name: 'Active Licenses',
          value: licenseList.substring(0, 1024),
          inline: false,
        });
      }

      // Add profile bio if exists
      if (user.profile?.bio) {
        embed.setDescription(user.profile.bio.substring(0, 200));
      }

      // Create action buttons
      const components: any[] = [];
      if (!isViewingOther) {
        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('user_licenses')
              .setLabel('View All Licenses')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('user_activations')
              .setLabel('View Activations')
              .setStyle(ButtonStyle.Secondary),
          );

        components.push(row);
      }

      await interaction.editReply({
        embeds: [embed],
        components,
      });

    } catch (error) {
      logger.error('Failed to get user profile', error);

      const embed = new EmbedBuilder()
        .setTitle('Error')
        .setColor(0xff0000)
        .setDescription('Failed to retrieve profile information')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;