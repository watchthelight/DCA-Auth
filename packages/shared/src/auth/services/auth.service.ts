/**
 * Authentication Service
 *
 * Handles user authentication, registration, and session management
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../database/client.js';
import { logger } from '../../logging/logger.js';
import { AuthError, ValidationError, NotFoundError } from '../../errors/index.js';
import { PasswordUtils } from '../utils/password.utils.js';
import { jwtService, TokenPair } from './jwt.service.js';
import { sessionService } from './session.service.js';
import {
  CreateUserInput,
  UserWithRelations,
  UserAuthInput,
  UserRegistrationInput
} from '../../database/types/user.types.js';
import {
  AuditAction,
  UserRole,
  UserStatus,
  SessionStatus
} from '@prisma/client';
import { auditService } from '../../services/audit.service.js';

export interface LoginResult {
  user: UserWithRelations;
  tokens: TokenPair;
  sessionId: string;
}

export interface RegisterResult {
  user: UserWithRelations;
  tokens?: TokenPair;
  sessionId?: string;
  requiresEmailVerification: boolean;
}

export class AuthenticationService {
  /**
   * Register a new user
   */
  async register(input: UserRegistrationInput, ipAddress: string): Promise<RegisterResult> {
    try {
      // Validate input
      if (!input.acceptedTerms) {
        throw new ValidationError('Terms must be accepted', [
          { field: 'acceptedTerms', message: 'You must accept the terms and conditions' }
        ]);
      }

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { discordId: input.discordId },
            { email: input.email },
            { username: input.username },
          ],
        },
      });

      if (existingUser) {
        if (existingUser.discordId === input.discordId) {
          throw new ValidationError('User already exists', [
            { field: 'discordId', message: 'Discord account already registered' }
          ]);
        }
        if (existingUser.email === input.email) {
          throw new ValidationError('User already exists', [
            { field: 'email', message: 'Email already registered' }
          ]);
        }
        if (existingUser.username === input.username) {
          throw new ValidationError('User already exists', [
            { field: 'username', message: 'Username already taken' }
          ]);
        }
      }

      // Hash password if provided
      let passwordHash: string | undefined;
      if (input.password) {
        passwordHash = await PasswordUtils.hash(input.password);
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          id: uuidv4(),
          discordId: input.discordId,
          username: input.username,
          discriminator: input.discriminator,
          email: input.email,
          avatarHash: input.avatarHash,
          status: UserStatus.ACTIVE,
          roles: input.roles || [UserRole.USER],
          passwordHash,
          metadata: {
            ...input.metadata,
            registeredAt: new Date(),
            registrationIp: ipAddress,
            marketingConsent: input.marketingConsent,
          },
        },
        include: {
          profile: true,
        },
      });

      // Log audit event
      await auditService.log({
        userId: user.id,
        action: AuditAction.USER_CREATED,
        entityType: 'user',
        entityId: user.id,
        details: {
          username: user.username,
          email: user.email,
          discordId: user.discordId,
        },
        ipAddress,
      });

      // Send verification email if email provided
      const requiresEmailVerification = !!user.email && !user.isEmailVerified;
      if (requiresEmailVerification) {
        // TODO: Send verification email
        logger.info('Email verification required', { userId: user.id, email: user.email });
      }

      // Auto-login if password was set
      let tokens: TokenPair | undefined;
      let sessionId: string | undefined;

      if (passwordHash) {
        const session = await sessionService.createSession({
          userId: user.id,
          ipAddress,
          userAgent: 'Registration',
          deviceName: 'Web',
          deviceType: 'desktop',
        });

        tokens = await jwtService.generateTokenPair(
          user.id,
          session.id,
          user.roles
        );

        sessionId = session.id;

        // Update session with tokens
        await sessionService.updateSession(session.id, {
          refreshToken: tokens.refreshToken,
          accessTokenHash: jwtService.hashToken(tokens.accessToken),
        });
      }

      logger.info('User registered successfully', {
        userId: user.id,
        username: user.username,
        autoLogin: !!tokens,
      });

      return {
        user,
        tokens,
        sessionId,
        requiresEmailVerification,
      };
    } catch (error) {
      logger.error('Registration failed', error, { username: input.username });
      throw error;
    }
  }

  /**
   * Login with credentials
   */
  async login(
    input: UserAuthInput,
    ipAddress: string,
    userAgent?: string,
    deviceFingerprint?: string
  ): Promise<LoginResult> {
    try {
      // Find user by identifier
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: input.identifier },
            { username: input.identifier },
            { discordId: input.identifier },
          ],
          deletedAt: null,
        },
        include: {
          profile: true,
        },
      });

      if (!user) {
        // Log failed attempt
        await this.logLoginAttempt({
          identifier: input.identifier,
          success: false,
          failureReason: 'User not found',
          ipAddress,
          userAgent,
        });

        throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
      }

      // Check if user is banned or suspended
      if (user.status === UserStatus.BANNED) {
        throw new AuthError('Account is banned', 'ACCOUNT_BANNED');
      }

      if (user.status === UserStatus.SUSPENDED) {
        throw new AuthError('Account is suspended', 'ACCOUNT_SUSPENDED');
      }

      // Verify password
      if (!user.passwordHash) {
        throw new AuthError('Password login not enabled', 'PASSWORD_NOT_SET');
      }

      const isValidPassword = await PasswordUtils.verify(
        input.password!,
        user.passwordHash
      );

      if (!isValidPassword) {
        // Log failed attempt
        await this.logLoginAttempt({
          identifier: input.identifier,
          userId: user.id,
          success: false,
          failureReason: 'Invalid password',
          ipAddress,
          userAgent,
        });

        throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
      }

      // Check 2FA if enabled
      if (user.twoFactorEnabled) {
        if (!input.twoFactorCode) {
          throw new AuthError('Two-factor authentication required', 'REQUIRES_2FA');
        }

        // TODO: Verify 2FA code
        const is2FAValid = await this.verify2FACode(user.id, input.twoFactorCode);
        if (!is2FAValid) {
          throw new AuthError('Invalid 2FA code', 'INVALID_2FA_CODE');
        }
      }

      // Create session
      const session = await sessionService.createSession({
        userId: user.id,
        ipAddress,
        userAgent,
        deviceFingerprint,
        deviceName: this.extractDeviceName(userAgent),
        deviceType: this.detectDeviceType(userAgent),
      });

      // Generate tokens
      const tokens = await jwtService.generateTokenPair(
        user.id,
        session.id,
        user.roles,
        undefined,
        deviceFingerprint
      );

      // Update session with tokens
      await sessionService.updateSession(session.id, {
        refreshToken: tokens.refreshToken,
        accessTokenHash: jwtService.hashToken(tokens.accessToken),
        tokenFamily: jwtService.generateTokenFamily(),
      });

      // Update user last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Log successful login
      await this.logLoginAttempt({
        identifier: input.identifier,
        userId: user.id,
        success: true,
        ipAddress,
        userAgent,
        deviceFingerprint,
      });

      // Log audit event
      await auditService.log({
        userId: user.id,
        action: AuditAction.LOGIN_SUCCESS,
        entityType: 'user',
        entityId: user.id,
        details: {
          method: 'password',
          ipAddress,
          userAgent,
        },
        ipAddress,
        sessionId: session.id,
      });

      logger.info('User logged in successfully', {
        userId: user.id,
        username: user.username,
        sessionId: session.id,
      });

      return {
        user,
        tokens,
        sessionId: session.id,
      };
    } catch (error) {
      logger.error('Login failed', error, { identifier: input.identifier });
      throw error;
    }
  }

  /**
   * Logout user session
   */
  async logout(sessionId: string, userId: string): Promise<void> {
    try {
      // Revoke session
      await sessionService.revokeSession(sessionId, 'User logout');

      // Log audit event
      await auditService.log({
        userId,
        action: AuditAction.LOGOUT,
        entityType: 'session',
        entityId: sessionId,
        details: {
          reason: 'User initiated logout',
        },
        sessionId,
      });

      logger.info('User logged out successfully', { userId, sessionId });
    } catch (error) {
      logger.error('Logout failed', error, { userId, sessionId });
      throw error;
    }
  }

  /**
   * Logout all user sessions
   */
  async logoutAllSessions(userId: string, currentSessionId?: string): Promise<void> {
    try {
      // Get all active sessions
      const sessions = await prisma.session.findMany({
        where: {
          userId,
          status: SessionStatus.ACTIVE,
        },
      });

      // Revoke all sessions
      for (const session of sessions) {
        if (session.id !== currentSessionId) {
          await sessionService.revokeSession(
            session.id,
            'User requested logout from all devices'
          );
        }
      }

      // Revoke current session last
      if (currentSessionId) {
        await sessionService.revokeSession(
          currentSessionId,
          'User requested logout from all devices'
        );
      }

      logger.info('All user sessions logged out', {
        userId,
        sessionCount: sessions.length,
      });
    } catch (error) {
      logger.error('Logout all sessions failed', error, { userId });
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(
    refreshToken: string,
    deviceFingerprint?: string
  ): Promise<TokenPair> {
    try {
      // Verify refresh token
      const decoded = await jwtService.verifyRefreshToken(refreshToken, deviceFingerprint);

      // Get session
      const session = await sessionService.getSession(decoded.sid);
      if (!session) {
        throw new AuthError('Session not found', 'SESSION_NOT_FOUND');
      }

      // Validate session
      if (session.status !== SessionStatus.ACTIVE) {
        throw new AuthError('Session is not active', 'SESSION_INACTIVE');
      }

      if (session.refreshToken !== refreshToken) {
        // Possible token reuse attack
        await sessionService.revokeSession(
          session.id,
          'Refresh token reuse detected'
        );
        throw new AuthError('Invalid refresh token', 'TOKEN_REUSE_DETECTED');
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Generate new token pair
      const tokens = await jwtService.generateTokenPair(
        user.id,
        session.id,
        user.roles,
        undefined,
        deviceFingerprint
      );

      // Update session with new tokens
      await sessionService.updateSession(session.id, {
        refreshToken: tokens.refreshToken,
        accessTokenHash: jwtService.hashToken(tokens.accessToken),
        lastActivityAt: new Date(),
      });

      // Log audit event
      await auditService.log({
        userId: user.id,
        action: AuditAction.SESSION_REFRESHED,
        entityType: 'session',
        entityId: session.id,
        details: {
          tokenFamily: session.tokenFamily,
        },
        sessionId: session.id,
      });

      logger.debug('Token refreshed successfully', {
        userId: user.id,
        sessionId: session.id,
      });

      return tokens;
    } catch (error) {
      logger.error('Token refresh failed', error);
      throw error;
    }
  }

  /**
   * Verify 2FA code
   */
  private async verify2FACode(userId: string, code: string): Promise<boolean> {
    // TODO: Implement 2FA verification
    // This would typically use a library like speakeasy to verify TOTP codes
    logger.warn('2FA verification not yet implemented', { userId });
    return true; // Placeholder
  }

  /**
   * Log login attempt
   */
  private async logLoginAttempt(data: {
    identifier: string;
    userId?: string;
    success: boolean;
    failureReason?: string;
    ipAddress: string;
    userAgent?: string;
    deviceFingerprint?: string;
  }): Promise<void> {
    try {
      const identifierType = data.identifier.includes('@')
        ? 'email'
        : /^\d+$/.test(data.identifier)
        ? 'discord_id'
        : 'username';

      await prisma.loginAttempt.create({
        data: {
          id: uuidv4(),
          userId: data.userId,
          identifier: data.identifier,
          identifierType,
          success: data.success,
          failureReason: data.failureReason,
          failureCode: data.failureReason?.toUpperCase().replace(/ /g, '_'),
          authMethod: 'password',
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          deviceFingerprint: data.deviceFingerprint,
          riskScore: this.calculateRiskScore(data),
          attemptedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to log login attempt', error, data);
    }
  }

  /**
   * Calculate risk score for login attempt
   */
  private calculateRiskScore(data: {
    success: boolean;
    ipAddress: string;
    userAgent?: string;
  }): number {
    let score = 0;

    if (!data.success) {
      score += 30;
    }

    // TODO: Add more risk factors
    // - Check if IP is in suspicious list
    // - Check recent failed attempts from IP
    // - Check if user agent is suspicious
    // - Check geolocation anomalies

    return Math.min(100, score);
  }

  /**
   * Extract device name from user agent
   */
  private extractDeviceName(userAgent?: string): string {
    if (!userAgent) return 'Unknown Device';

    // Simple extraction - could be enhanced
    if (userAgent.includes('Chrome')) return 'Chrome Browser';
    if (userAgent.includes('Firefox')) return 'Firefox Browser';
    if (userAgent.includes('Safari')) return 'Safari Browser';
    if (userAgent.includes('Edge')) return 'Edge Browser';

    return 'Web Browser';
  }

  /**
   * Detect device type from user agent
   */
  private detectDeviceType(userAgent?: string): 'mobile' | 'desktop' | 'tablet' | 'unknown' {
    if (!userAgent) return 'unknown';

    const ua = userAgent.toLowerCase();

    if (/mobile|android|iphone/.test(ua)) return 'mobile';
    if (/ipad|tablet/.test(ua)) return 'tablet';
    if (/windows|mac|linux/.test(ua)) return 'desktop';

    return 'unknown';
  }
}

// Export singleton instance
export const authService = new AuthenticationService();