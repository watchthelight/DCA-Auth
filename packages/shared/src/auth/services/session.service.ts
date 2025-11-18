/**
 * Session Management Service
 *
 * Handles session creation, validation, and lifecycle management
 */

import { v4 as uuidv4 } from 'uuid';
import { Session, SessionStatus } from '@prisma/client';
import { prisma } from '../../database/client.js';
import { logger } from '../../logging/logger.js';
import { NotFoundError, AuthError } from '../../errors/index.js';
import {
  CreateSessionInput,
  UpdateSessionInput,
  SessionWithUser,
  SessionValidationResult,
  SessionSearchFilters,
  SessionStatistics,
} from '../../database/types/session.types.js';
import { config } from '../../config/index.js';

export class SessionService {
  private readonly sessionTimeout: number;
  private readonly idleTimeout: number;
  private readonly maxConcurrentSessions: number;

  constructor() {
    this.sessionTimeout = this.parseTimeToMs(config.auth.session.timeout);
    this.idleTimeout = this.parseTimeToMs(config.auth.session.idleTimeout);
    this.maxConcurrentSessions = config.auth.session.maxConcurrent;
  }

  /**
   * Create a new session
   */
  async createSession(input: CreateSessionInput): Promise<Session> {
    try {
      // Check concurrent session limit
      const activeSessions = await prisma.session.count({
        where: {
          userId: input.userId,
          status: SessionStatus.ACTIVE,
        },
      });

      if (activeSessions >= this.maxConcurrentSessions) {
        // Revoke oldest session
        const oldestSession = await prisma.session.findFirst({
          where: {
            userId: input.userId,
            status: SessionStatus.ACTIVE,
          },
          orderBy: {
            lastActivityAt: 'asc',
          },
        });

        if (oldestSession) {
          await this.revokeSession(
            oldestSession.id,
            'Maximum concurrent sessions exceeded'
          );
        }
      }

      // Create session
      const session = await prisma.session.create({
        data: {
          id: uuidv4(),
          userId: input.userId,
          refreshToken: input.refreshToken || `temp_${uuidv4()}`,
          accessTokenHash: input.accessTokenHash,
          tokenFamily: input.tokenFamily || uuidv4(),
          status: SessionStatus.ACTIVE,
          deviceName: input.deviceName,
          deviceType: input.deviceType || 'unknown',
          deviceInfo: input.deviceInfo || {},
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          location: input.location || (await this.getLocationFromIP(input.ipAddress)),
          fingerprint: input.fingerprint,
          expiresAt: input.expiresAt || new Date(Date.now() + this.sessionTimeout),
          idleTimeoutAt: new Date(Date.now() + this.idleTimeout),
          lastActivityAt: new Date(),
          createdAt: new Date(),
        },
      });

      logger.info('Session created', {
        sessionId: session.id,
        userId: session.userId,
        deviceType: session.deviceType,
      });

      return session;
    } catch (error) {
      logger.error('Failed to create session', error, input);
      throw error;
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionWithUser | null> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            discordId: true,
          },
        },
      },
    });

    return session;
  }

  /**
   * Update session
   */
  async updateSession(
    sessionId: string,
    input: UpdateSessionInput
  ): Promise<Session> {
    try {
      const session = await prisma.session.update({
        where: { id: sessionId },
        data: {
          ...input,
          lastActivityAt: new Date(),
          idleTimeoutAt: new Date(Date.now() + this.idleTimeout),
        },
      });

      logger.debug('Session updated', {
        sessionId,
        updates: Object.keys(input),
      });

      return session;
    } catch (error) {
      logger.error('Failed to update session', error, { sessionId });
      throw error;
    }
  }

  /**
   * Validate session
   */
  async validateSession(
    sessionId: string,
    options: {
      checkExpiry?: boolean;
      checkIdle?: boolean;
      updateActivity?: boolean;
    } = {}
  ): Promise<SessionValidationResult> {
    const {
      checkExpiry = true,
      checkIdle = true,
      updateActivity = true,
    } = options;

    const session = await this.getSession(sessionId);

    if (!session) {
      return {
        valid: false,
        reason: 'invalid',
      };
    }

    // Check if session is revoked
    if (session.status === SessionStatus.REVOKED) {
      return {
        valid: false,
        session,
        reason: 'revoked',
      };
    }

    // Check if session is expired
    if (checkExpiry && session.status === SessionStatus.EXPIRED) {
      return {
        valid: false,
        session,
        reason: 'expired',
      };
    }

    if (checkExpiry && new Date() > session.expiresAt) {
      await this.expireSession(sessionId);
      return {
        valid: false,
        session,
        reason: 'expired',
      };
    }

    // Check idle timeout
    if (checkIdle && session.idleTimeoutAt && new Date() > session.idleTimeoutAt) {
      await this.expireSession(sessionId);
      return {
        valid: false,
        session,
        reason: 'expired',
      };
    }

    // Check for suspicious activity
    const securityFlags = session.securityFlags || [];
    if (securityFlags.includes('suspicious') || securityFlags.includes('hijacked')) {
      return {
        valid: false,
        session,
        reason: 'suspicious',
        securityFlags,
      };
    }

    // Update last activity
    if (updateActivity) {
      await this.updateSession(sessionId, {
        lastActivityAt: new Date(),
        idleTimeoutAt: new Date(Date.now() + this.idleTimeout),
      });
    }

    return {
      valid: true,
      session,
    };
  }

  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string, reason: string): Promise<void> {
    try {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.REVOKED,
          revokedAt: new Date(),
          revokedReason: reason,
        },
      });

      logger.info('Session revoked', { sessionId, reason });
    } catch (error) {
      logger.error('Failed to revoke session', error, { sessionId });
      throw error;
    }
  }

  /**
   * Expire a session
   */
  async expireSession(sessionId: string): Promise<void> {
    try {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.EXPIRED,
        },
      });

      logger.debug('Session expired', { sessionId });
    } catch (error) {
      logger.error('Failed to expire session', error, { sessionId });
      throw error;
    }
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserSessions(
    userId: string,
    reason: string,
    exceptSessionId?: string
  ): Promise<void> {
    try {
      const whereClause: any = {
        userId,
        status: SessionStatus.ACTIVE,
      };

      if (exceptSessionId) {
        whereClause.id = { not: exceptSessionId };
      }

      await prisma.session.updateMany({
        where: whereClause,
        data: {
          status: SessionStatus.REVOKED,
          revokedAt: new Date(),
          revokedReason: reason,
        },
      });

      logger.info('All user sessions revoked', { userId, reason, exceptSessionId });
    } catch (error) {
      logger.error('Failed to revoke all user sessions', error, { userId });
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await prisma.session.updateMany({
        where: {
          status: SessionStatus.ACTIVE,
          OR: [
            { expiresAt: { lt: new Date() } },
            { idleTimeoutAt: { lt: new Date() } },
          ],
        },
        data: {
          status: SessionStatus.EXPIRED,
        },
      });

      if (result.count > 0) {
        logger.info('Expired sessions cleaned up', { count: result.count });
      }

      return result.count;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', error);
      throw error;
    }
  }

  /**
   * Get user's active sessions
   */
  async getUserSessions(
    userId: string,
    filters?: SessionSearchFilters
  ): Promise<Session[]> {
    const where: any = {
      userId,
      ...filters,
    };

    return prisma.session.findMany({
      where,
      orderBy: {
        lastActivityAt: 'desc',
      },
    });
  }

  /**
   * Get session statistics
   */
  async getStatistics(): Promise<SessionStatistics> {
    const [total, active, expired, revoked] = await Promise.all([
      prisma.session.count(),
      prisma.session.count({ where: { status: SessionStatus.ACTIVE } }),
      prisma.session.count({ where: { status: SessionStatus.EXPIRED } }),
      prisma.session.count({ where: { status: SessionStatus.REVOKED } }),
    ]);

    // Get device type distribution
    const deviceStats = await prisma.session.groupBy({
      by: ['deviceType'],
      _count: true,
      where: { status: SessionStatus.ACTIVE },
    });

    const sessionsByDevice = deviceStats.reduce((acc, stat) => {
      acc[stat.deviceType || 'unknown'] = stat._count;
      return acc;
    }, {} as Record<string, number>);

    // Calculate average session duration
    const sessions = await prisma.session.findMany({
      where: {
        status: { not: SessionStatus.ACTIVE },
        createdAt: { not: null },
        OR: [
          { revokedAt: { not: null } },
          { expiresAt: { not: null } },
        ],
      },
      select: {
        createdAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    });

    let totalDuration = 0;
    sessions.forEach((session) => {
      const endTime = session.revokedAt || session.expiresAt;
      const duration = endTime.getTime() - session.createdAt.getTime();
      totalDuration += duration;
    });

    const averageSessionDuration = sessions.length > 0
      ? Math.floor(totalDuration / sessions.length / 1000) // in seconds
      : 0;

    // Get unique users with active sessions
    const uniqueUsersResult = await prisma.session.groupBy({
      by: ['userId'],
      where: { status: SessionStatus.ACTIVE },
    });

    // Count suspicious sessions
    const suspiciousSessions = await prisma.session.count({
      where: {
        status: SessionStatus.ACTIVE,
        securityFlags: {
          hasSome: ['suspicious', 'anomaly', 'hijack_attempt'],
        },
      },
    });

    return {
      totalSessions: total,
      activeSessions: active,
      expiredSessions: expired,
      revokedSessions: revoked,
      sessionsByDevice,
      averageSessionDuration,
      uniqueUsers: uniqueUsersResult.length,
      suspiciousSessions,
    };
  }

  /**
   * Check for session anomalies
   */
  async checkSessionAnomalies(sessionId: string): Promise<string[]> {
    const anomalies: string[] = [];

    const session = await this.getSession(sessionId);
    if (!session) {
      return ['session_not_found'];
    }

    // Check for rapid location changes
    const recentSessions = await prisma.session.findMany({
      where: {
        userId: session.userId,
        createdAt: {
          gte: new Date(Date.now() - 2 * 60 * 60 * 1000), // Last 2 hours
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    // Simple location check (could be enhanced with actual geolocation)
    const locations = recentSessions.map(s => s.location).filter(Boolean);
    const uniqueLocations = [...new Set(locations)];
    if (uniqueLocations.length > 3) {
      anomalies.push('rapid_location_changes');
    }

    // Check for multiple IPs
    const ips = recentSessions.map(s => s.ipAddress);
    const uniqueIPs = [...new Set(ips)];
    if (uniqueIPs.length > 3) {
      anomalies.push('multiple_ip_addresses');
    }

    // Check for unusual activity patterns
    const activityTimes = recentSessions.map(s => s.lastActivityAt.getHours());
    const nightActivity = activityTimes.filter(h => h >= 2 && h <= 5);
    if (nightActivity.length > activityTimes.length / 2) {
      anomalies.push('unusual_activity_pattern');
    }

    if (anomalies.length > 0) {
      // Update session security flags
      await this.updateSession(sessionId, {
        securityFlags: [...(session.securityFlags || []), ...anomalies],
      });
    }

    return anomalies;
  }

  /**
   * Get location from IP address (placeholder)
   */
  private async getLocationFromIP(ipAddress: string): Promise<string | null> {
    // TODO: Implement actual IP geolocation
    // This would typically use a service like MaxMind or IP2Location

    // For local IPs, return local
    if (ipAddress.startsWith('192.168.') || ipAddress.startsWith('10.') || ipAddress === '127.0.0.1') {
      return 'Local Network';
    }

    return null;
  }

  /**
   * Parse time string to milliseconds
   */
  private parseTimeToMs(time: string): number {
    const match = time.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid time format: ${time}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Invalid time unit: ${unit}`);
    }
  }
}

// Export singleton instance
export const sessionService = new SessionService();