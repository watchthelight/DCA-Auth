/**
 * Discord OAuth Strategy
 *
 * Handles Discord OAuth2 authentication flow
 */

import axios from 'axios';
import { URLSearchParams } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../database/client.js';
import { logger } from '../../logging/logger.js';
import { AuthError } from '../../errors/index.js';
import { config } from '../../config/index.js';
import { authService } from '../services/auth.service.js';
import { jwtService } from '../services/jwt.service.js';
import { sessionService } from '../services/session.service.js';
import { auditService } from '../../services/audit.service.js';
import { AuditAction, UserRole, UserStatus } from '@prisma/client';
import { DiscordUserData } from '../../database/types/user.types.js';

export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  features: string[];
}

export class DiscordStrategy {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly apiEndpoint = 'https://discord.com/api/v10';
  private readonly scopes = ['identify', 'email', 'guilds'];

  constructor() {
    this.clientId = config.discord.clientId;
    this.clientSecret = config.discord.clientSecret;
    this.redirectUri = config.discord.redirectUri;
  }

  /**
   * Get authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state: state || uuidv4(),
    });

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange code for tokens
   */
  async exchangeCode(code: string): Promise<DiscordTokenResponse> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      });

      const response = await axios.post(
        `${this.apiEndpoint}/oauth2/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Failed to exchange Discord code', error);
      throw new AuthError(
        'Failed to exchange authorization code',
        'OAUTH_EXCHANGE_FAILED'
      );
    }
  }

  /**
   * Get user data from Discord
   */
  async getUser(accessToken: string): Promise<DiscordUserData> {
    try {
      const response = await axios.get(`${this.apiEndpoint}/users/@me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get Discord user', error);
      throw new AuthError('Failed to get user data', 'OAUTH_USER_FETCH_FAILED');
    }
  }

  /**
   * Get user's guilds from Discord
   */
  async getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
    try {
      const response = await axios.get(`${this.apiEndpoint}/users/@me/guilds`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get Discord guilds', error);
      // Don't throw - guilds are optional
      return [];
    }
  }

  /**
   * Authenticate or create user from Discord OAuth
   */
  async authenticate(
    code: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<{
    user: any;
    tokens: any;
    sessionId: string;
    isNewUser: boolean;
  }> {
    try {
      // Exchange code for tokens
      const discordTokens = await this.exchangeCode(code);

      // Get user data
      const discordUser = await this.getUser(discordTokens.access_token);

      // Get user's guilds
      const guilds = await this.getUserGuilds(discordTokens.access_token);

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { discordId: discordUser.id },
        include: { profile: true },
      });

      let isNewUser = false;

      if (!user) {
        // Create new user
        isNewUser = true;
        user = await prisma.user.create({
          data: {
            id: uuidv4(),
            discordId: discordUser.id,
            username: discordUser.username,
            discriminator: discordUser.discriminator,
            email: discordUser.email,
            avatarHash: discordUser.avatar,
            status: UserStatus.ACTIVE,
            roles: [UserRole.USER],
            isEmailVerified: discordUser.verified || false,
            emailVerifiedAt: discordUser.verified ? new Date() : null,
            lastLoginAt: new Date(),
            metadata: {
              source: 'discord_oauth',
              discordData: {
                locale: discordUser.locale,
                premiumType: discordUser.premium_type,
                publicFlags: discordUser.public_flags,
                flags: discordUser.flags,
                guilds: guilds.map(g => ({
                  id: g.id,
                  name: g.name,
                  owner: g.owner,
                })),
              },
            },
            profile: {
              create: {
                globalName: discordUser.global_name || discordUser.username,
                accentColor: discordUser.accent_color,
                banner: discordUser.banner,
                locale: discordUser.locale,
                premiumType: discordUser.premium_type,
              },
            },
          },
          include: { profile: true },
        });

        // Log user creation
        await auditService.log({
          userId: user.id,
          action: AuditAction.USER_CREATED,
          entityType: 'user',
          entityId: user.id,
          details: {
            source: 'discord_oauth',
            discordId: discordUser.id,
            username: discordUser.username,
          },
          ipAddress,
        });
      } else {
        // Update existing user
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            username: discordUser.username,
            discriminator: discordUser.discriminator,
            email: discordUser.email || user.email,
            avatarHash: discordUser.avatar || user.avatarHash,
            lastLoginAt: new Date(),
            metadata: {
              ...user.metadata,
              lastDiscordSync: new Date(),
              discordData: {
                locale: discordUser.locale,
                premiumType: discordUser.premium_type,
                publicFlags: discordUser.public_flags,
                flags: discordUser.flags,
                guilds: guilds.map(g => ({
                  id: g.id,
                  name: g.name,
                  owner: g.owner,
                })),
              },
            },
          },
          include: { profile: true },
        });

        // Update profile if exists
        if (user.profile) {
          await prisma.userProfile.update({
            where: { userId: user.id },
            data: {
              globalName: discordUser.global_name || user.profile.globalName,
              accentColor: discordUser.accent_color,
              banner: discordUser.banner,
              locale: discordUser.locale || user.profile.locale,
              premiumType: discordUser.premium_type,
            },
          });
        }
      }

      // Check if user is banned or suspended
      if (user.status === UserStatus.BANNED) {
        throw new AuthError('Account is banned', 'ACCOUNT_BANNED');
      }

      if (user.status === UserStatus.SUSPENDED) {
        throw new AuthError('Account is suspended', 'ACCOUNT_SUSPENDED');
      }

      // Create session
      const session = await sessionService.createSession({
        userId: user.id,
        ipAddress,
        userAgent,
        deviceName: 'Discord OAuth',
        deviceType: 'desktop',
      });

      // Generate JWT tokens
      const tokens = await jwtService.generateTokenPair(
        user.id,
        session.id,
        user.roles
      );

      // Update session with tokens
      await sessionService.updateSession(session.id, {
        refreshToken: tokens.refreshToken,
        accessTokenHash: jwtService.hashToken(tokens.accessToken),
        tokenFamily: jwtService.generateTokenFamily(),
      });

      // Store Discord tokens (encrypted in production)
      await prisma.session.update({
        where: { id: session.id },
        data: {
          deviceInfo: {
            ...session.deviceInfo,
            discordTokens: {
              accessToken: discordTokens.access_token, // Should be encrypted
              refreshToken: discordTokens.refresh_token, // Should be encrypted
              expiresAt: new Date(Date.now() + discordTokens.expires_in * 1000),
            },
          },
        },
      });

      // Log successful login
      await prisma.loginAttempt.create({
        data: {
          id: uuidv4(),
          userId: user.id,
          identifier: discordUser.id,
          identifierType: 'discord_id',
          success: true,
          authMethod: 'oauth',
          provider: 'discord',
          ipAddress,
          userAgent,
        },
      });

      // Log audit event
      await auditService.log({
        userId: user.id,
        action: AuditAction.LOGIN_SUCCESS,
        entityType: 'user',
        entityId: user.id,
        details: {
          method: 'oauth',
          provider: 'discord',
          isNewUser,
        },
        ipAddress,
        sessionId: session.id,
      });

      logger.info('Discord OAuth authentication successful', {
        userId: user.id,
        discordId: discordUser.id,
        isNewUser,
      });

      return {
        user,
        tokens,
        sessionId: session.id,
        isNewUser,
      };
    } catch (error) {
      logger.error('Discord OAuth authentication failed', error);
      throw error;
    }
  }

  /**
   * Refresh Discord access token
   */
  async refreshDiscordToken(refreshToken: string): Promise<DiscordTokenResponse> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const response = await axios.post(
        `${this.apiEndpoint}/oauth2/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Failed to refresh Discord token', error);
      throw new AuthError(
        'Failed to refresh Discord token',
        'OAUTH_REFRESH_FAILED'
      );
    }
  }

  /**
   * Revoke Discord access token
   */
  async revokeDiscordToken(token: string): Promise<void> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        token,
      });

      await axios.post(
        `${this.apiEndpoint}/oauth2/token/revoke`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
    } catch (error: any) {
      logger.error('Failed to revoke Discord token', error);
      // Don't throw - revocation is best effort
    }
  }

  /**
   * Link Discord account to existing user
   */
  async linkAccount(
    userId: string,
    code: string,
    ipAddress: string
  ): Promise<void> {
    try {
      // Exchange code for tokens
      const discordTokens = await this.exchangeCode(code);

      // Get Discord user data
      const discordUser = await this.getUser(discordTokens.access_token);

      // Check if Discord ID is already linked
      const existingUser = await prisma.user.findUnique({
        where: { discordId: discordUser.id },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new AuthError(
          'Discord account already linked to another user',
          'DISCORD_ALREADY_LINKED'
        );
      }

      // Update user with Discord data
      await prisma.user.update({
        where: { id: userId },
        data: {
          discordId: discordUser.id,
          avatarHash: discordUser.avatar,
          metadata: {
            discordLinkedAt: new Date(),
            discordData: {
              username: discordUser.username,
              discriminator: discordUser.discriminator,
              locale: discordUser.locale,
            },
          },
        },
      });

      // Log audit event
      await auditService.log({
        userId,
        action: AuditAction.USER_UPDATED,
        entityType: 'user',
        entityId: userId,
        details: {
          action: 'discord_account_linked',
          discordId: discordUser.id,
        },
        ipAddress,
      });

      logger.info('Discord account linked successfully', {
        userId,
        discordId: discordUser.id,
      });
    } catch (error) {
      logger.error('Failed to link Discord account', error, { userId });
      throw error;
    }
  }

  /**
   * Unlink Discord account from user
   */
  async unlinkAccount(userId: string, ipAddress: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.discordId) {
        throw new AuthError('No Discord account linked', 'DISCORD_NOT_LINKED');
      }

      // Check if user has a password set
      if (!user.passwordHash) {
        throw new AuthError(
          'Cannot unlink Discord without a password set',
          'PASSWORD_REQUIRED'
        );
      }

      const oldDiscordId = user.discordId;

      // Update user
      await prisma.user.update({
        where: { id: userId },
        data: {
          discordId: `unlinked_${user.discordId}_${Date.now()}`, // Preserve for audit
          avatarHash: null,
          metadata: {
            ...user.metadata,
            discordUnlinkedAt: new Date(),
            previousDiscordId: user.discordId,
          },
        },
      });

      // Log audit event
      await auditService.log({
        userId,
        action: AuditAction.USER_UPDATED,
        entityType: 'user',
        entityId: userId,
        details: {
          action: 'discord_account_unlinked',
          discordId: oldDiscordId,
        },
        ipAddress,
      });

      logger.info('Discord account unlinked successfully', {
        userId,
        discordId: oldDiscordId,
      });
    } catch (error) {
      logger.error('Failed to unlink Discord account', error, { userId });
      throw error;
    }
  }
}

// Export singleton instance
export const discordStrategy = new DiscordStrategy();