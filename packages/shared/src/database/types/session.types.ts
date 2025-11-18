/**
 * Session Type Definitions
 *
 * TypeScript types and interfaces for Session-related database models
 */

import { Session, SessionStatus } from '@prisma/client';

/**
 * Session with user relation
 */
export interface SessionWithUser extends Session {
  user?: {
    id: string;
    username: string;
    email?: string | null;
    discordId: string;
  };
}

/**
 * Session creation input
 */
export interface CreateSessionInput {
  userId: string;
  refreshToken: string;
  accessTokenHash?: string;
  tokenFamily?: string;
  deviceName?: string;
  deviceType?: 'mobile' | 'desktop' | 'tablet' | 'tv' | 'unknown';
  deviceInfo?: Record<string, any>;
  ipAddress: string;
  userAgent?: string;
  location?: string;
  fingerprint?: string;
  expiresAt: Date;
}

/**
 * Session update input
 */
export interface UpdateSessionInput {
  refreshToken?: string;
  accessTokenHash?: string;
  status?: SessionStatus;
  lastActivityAt?: Date;
  idleTimeoutAt?: Date;
  deviceInfo?: Record<string, any>;
  location?: string;
  securityFlags?: string[];
}

/**
 * Session refresh input
 */
export interface SessionRefreshInput {
  refreshToken: string;
  fingerprint?: string;
  ipAddress: string;
  userAgent?: string;
}

/**
 * Session refresh response
 */
export interface SessionRefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  sessionId: string;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  valid: boolean;
  session?: SessionWithUser;
  reason?: 'expired' | 'revoked' | 'invalid' | 'suspicious';
  requiresRefresh?: boolean;
  securityFlags?: string[];
}

/**
 * Session search filters
 */
export interface SessionSearchFilters {
  userId?: string;
  status?: SessionStatus | SessionStatus[];
  deviceType?: string;
  ipAddress?: string;
  tokenFamily?: string;
  activeOnly?: boolean;
  expiredOnly?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  lastActivityAfter?: Date;
  lastActivityBefore?: Date;
}

/**
 * Session pagination options
 */
export interface SessionPaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'lastActivityAt' | 'expiresAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated session response
 */
export interface PaginatedSessionResponse {
  sessions: Session[];
  total: number;
  page: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Session statistics
 */
export interface SessionStatistics {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  revokedSessions: number;
  sessionsByDevice: Record<string, number>;
  averageSessionDuration: number;
  uniqueUsers: number;
  suspiciousSessions: number;
}

/**
 * Device information
 */
export interface DeviceInfo {
  name?: string;
  type: 'mobile' | 'desktop' | 'tablet' | 'tv' | 'unknown';
  os?: string;
  osVersion?: string;
  browser?: string;
  browserVersion?: string;
  manufacturer?: string;
  model?: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
}

/**
 * Session location information
 */
export interface SessionLocation {
  ipAddress: string;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  isp?: string;
  isVpn?: boolean;
  isTor?: boolean;
  isProxy?: boolean;
  threatLevel?: 'low' | 'medium' | 'high';
}

/**
 * Session security analysis
 */
export interface SessionSecurityAnalysis {
  sessionId: string;
  riskScore: number; // 0-100
  riskFactors: string[];
  recommendations: string[];
  requiresAction: boolean;
  suggestedAction?: 'monitor' | 'verify' | 'revoke' | 'block';
  anomalies: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    detectedAt: Date;
  }>;
}

/**
 * Concurrent session limit configuration
 */
export interface SessionLimitConfig {
  maxConcurrentSessions: number;
  maxSessionsPerDevice: number;
  maxSessionsPerIp: number;
  sessionTimeout: number; // in seconds
  idleTimeout: number; // in seconds
  refreshTokenLifetime: number; // in seconds
  accessTokenLifetime: number; // in seconds
  allowMultipleDevices: boolean;
  enforceDeviceFingerprint: boolean;
}

/**
 * Session revocation input
 */
export interface SessionRevocationInput {
  sessionId?: string;
  userId?: string;
  tokenFamily?: string;
  reason: string;
  revokedBy: string;
  revokeAll?: boolean;
}

/**
 * Session activity log
 */
export interface SessionActivity {
  sessionId: string;
  action: 'created' | 'refreshed' | 'accessed' | 'expired' | 'revoked';
  timestamp: Date;
  ipAddress: string;
  userAgent?: string;
  details?: Record<string, any>;
}

/**
 * Token rotation tracking
 */
export interface TokenRotation {
  tokenFamily: string;
  currentToken: string;
  previousTokens: string[];
  rotationCount: number;
  lastRotatedAt: Date;
  suspiciousActivity: boolean;
}

/**
 * Session export data (for user data requests)
 */
export interface SessionExportData {
  id: string;
  status: SessionStatus;
  deviceName?: string;
  deviceType?: string;
  ipAddress: string;
  location?: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  activities: SessionActivity[];
}

/**
 * JWT token payload
 */
export interface TokenPayload {
  sub: string; // User ID
  sid: string; // Session ID
  jti: string; // JWT ID
  iat: number; // Issued at
  exp: number; // Expiration
  type: 'access' | 'refresh';
  roles?: string[];
  permissions?: string[];
  fingerprint?: string;
}

/**
 * Session validation helpers
 */
export const SessionValidation = {
  /**
   * Check if session is expired
   */
  isExpired(session: Session): boolean {
    return new Date() > new Date(session.expiresAt);
  },

  /**
   * Check if session is active
   */
  isActive(session: Session): boolean {
    return session.status === SessionStatus.ACTIVE && !this.isExpired(session);
  },

  /**
   * Check if session is idle
   */
  isIdle(session: Session, idleTimeout: number): boolean {
    const lastActivity = new Date(session.lastActivityAt);
    const idleTime = Date.now() - lastActivity.getTime();
    return idleTime > idleTimeout * 1000;
  },

  /**
   * Check if session is suspicious
   */
  isSuspicious(session: Session): boolean {
    return session.securityFlags.some(flag =>
      ['suspicious', 'anomaly', 'hijack_attempt'].includes(flag)
    );
  },

  /**
   * Calculate session duration
   */
  getDuration(session: Session): number {
    const start = new Date(session.createdAt);
    const end = session.revokedAt ? new Date(session.revokedAt) : new Date();
    return end.getTime() - start.getTime();
  },
};