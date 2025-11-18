/**
 * Session Management Utilities
 *
 * Handles user session storage in Redis with automatic expiration
 * and secure token management.
 */

import crypto from 'crypto';

import { sessionCache } from './cache.js';
import { redisConfig } from '../config/redis.js';
import { logger } from '../utils/logger.js';

export interface SessionData {
  userId: string;
  discordId: string;
  username: string;
  email?: string;
  roles?: string[];
  createdAt: Date;
  lastActivity: Date;
  metadata?: Record<string, unknown>;
}

export interface SessionInfo {
  sessionId: string;
  data: SessionData;
  expiresAt: Date;
}

export class SessionManager {
  private readonly ttl: number;

  constructor(ttl?: number) {
    this.ttl = ttl || redisConfig.sessionTTL;
  }

  /**
   * Generate a secure session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create a new session
   */
  async create(data: SessionData): Promise<SessionInfo> {
    const sessionId = this.generateSessionId();
    const sessionKey = `session:${sessionId}`;

    const sessionData: SessionData = {
      ...data,
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    const success = await sessionCache.set(sessionKey, sessionData, this.ttl);

    if (!success) {
      throw new Error('Failed to create session');
    }

    const expiresAt = new Date(Date.now() + this.ttl * 1000);

    logger.info(`Session created for user ${data.userId} (${sessionId})`);

    return {
      sessionId,
      data: sessionData,
      expiresAt,
    };
  }

  /**
   * Get session by ID
   */
  async get(sessionId: string): Promise<SessionInfo | null> {
    const sessionKey = `session:${sessionId}`;
    const data = await sessionCache.get<SessionData>(sessionKey);

    if (!data) {
      return null;
    }

    const ttl = await sessionCache.ttl(sessionKey);
    const expiresAt = ttl > 0 ? new Date(Date.now() + ttl * 1000) : new Date();

    return {
      sessionId,
      data,
      expiresAt,
    };
  }

  /**
   * Update session data and refresh TTL
   */
  async update(sessionId: string, updates: Partial<SessionData>): Promise<boolean> {
    const sessionKey = `session:${sessionId}`;
    const existing = await sessionCache.get<SessionData>(sessionKey);

    if (!existing) {
      logger.warn(`Attempted to update non-existent session: ${sessionId}`);
      return false;
    }

    const updated: SessionData = {
      ...existing,
      ...updates,
      lastActivity: new Date(),
    };

    const success = await sessionCache.set(sessionKey, updated, this.ttl);

    if (success) {
      logger.debug(`Session updated: ${sessionId}`);
    }

    return success;
  }

  /**
   * Touch session (update last activity and refresh TTL)
   */
  async touch(sessionId: string): Promise<boolean> {
    return this.update(sessionId, { lastActivity: new Date() });
  }

  /**
   * Extend session TTL
   */
  async extend(sessionId: string, additionalSeconds?: number): Promise<boolean> {
    const sessionKey = `session:${sessionId}`;
    const ttl = additionalSeconds || this.ttl;

    const success = await sessionCache.expire(sessionKey, ttl);

    if (success) {
      logger.debug(`Session TTL extended: ${sessionId} (+${ttl}s)`);
    }

    return success;
  }

  /**
   * Destroy session
   */
  async destroy(sessionId: string): Promise<boolean> {
    const sessionKey = `session:${sessionId}`;
    const deleted = await sessionCache.delete(sessionKey);

    if (deleted > 0) {
      logger.info(`Session destroyed: ${sessionId}`);
      return true;
    }

    return false;
  }

  /**
   * Destroy all sessions for a user
   */
  async destroyAllForUser(_userId: string): Promise<number> {
    // This requires scanning all sessions, which is inefficient
    // In production, maintain a separate index of user sessions
    logger.warn('destroyAllForUser requires session indexing - not implemented');
    return 0;
  }

  /**
   * Get all active sessions (for monitoring)
   */
  async getAllActive(): Promise<SessionInfo[]> {
    // This would require key scanning which is inefficient
    // In production, use a separate index or sorted set
    logger.warn('getAllActive requires session indexing - not implemented');
    return [];
  }

  /**
   * Check if session exists
   */
  async exists(sessionId: string): Promise<boolean> {
    const sessionKey = `session:${sessionId}`;
    return sessionCache.exists(sessionKey);
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
  }> {
    // This would require key scanning
    // In production, maintain counters separately
    return {
      totalSessions: 0,
      activeSessions: 0,
    };
  }

  /**
   * Clean up expired sessions
   * Note: Redis automatically removes expired keys, but this can be used
   * for additional cleanup logic
   */
  async cleanup(): Promise<void> {
    logger.info('Session cleanup triggered (Redis handles expiration automatically)');
  }
}

// Export default session manager instance
export const sessionManager = new SessionManager();