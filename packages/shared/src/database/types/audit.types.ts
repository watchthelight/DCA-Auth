/**
 * Audit Type Definitions
 *
 * TypeScript types and interfaces for Audit-related database models
 */

import {
  AuditLog,
  AuditAction,
  LoginAttempt,
  SecurityEvent,
  SecurityEventType,
  SecuritySeverity,
} from '@prisma/client';

/**
 * Audit log with user relation
 */
export interface AuditLogWithUser extends AuditLog {
  user?: {
    id: string;
    username: string;
    email?: string | null;
    discordId: string;
  } | null;
}

/**
 * Audit log creation input
 */
export interface CreateAuditLogInput {
  userId?: string;
  action: AuditAction;
  category?: string;
  entityType?: string;
  entityId?: string;
  details: Record<string, any>;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  changes?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  correlationId?: string;
  requestId?: string;
  serviceName?: string;
  environment?: string;
  version?: string;
}

/**
 * Login attempt creation input
 */
export interface CreateLoginAttemptInput {
  userId?: string;
  identifier: string;
  identifierType: 'email' | 'username' | 'discord_id';
  success: boolean;
  failureReason?: string;
  failureCode?: string;
  authMethod: 'password' | 'oauth' | 'token' | 'magic_link' | '2fa';
  provider?: 'discord' | 'google' | 'github' | 'local';
  ipAddress: string;
  userAgent?: string;
  deviceFingerprint?: string;
  country?: string;
  countryName?: string;
  city?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  riskScore?: number;
  riskFactors?: string[];
}

/**
 * Security event creation input
 */
export interface CreateSecurityEventInput {
  type: SecurityEventType;
  severity: SecuritySeverity;
  title: string;
  description: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  details: Record<string, any>;
  indicators?: string[];
  affectedResources?: string[];
  actionTaken?: string;
  automated?: boolean;
  status?: 'open' | 'investigating' | 'resolved' | 'false_positive';
}

/**
 * Security event update input
 */
export interface UpdateSecurityEventInput {
  status?: 'open' | 'investigating' | 'resolved' | 'false_positive';
  resolved?: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
  actionTaken?: string;
  acknowledgedAt?: Date;
}

/**
 * Audit log search filters
 */
export interface AuditLogSearchFilters {
  userId?: string;
  action?: AuditAction | AuditAction[];
  category?: string | string[];
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  sessionId?: string;
  correlationId?: string;
  serviceName?: string;
  environment?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  search?: string;
}

/**
 * Login attempt search filters
 */
export interface LoginAttemptSearchFilters {
  userId?: string;
  identifier?: string;
  identifierType?: string;
  success?: boolean;
  authMethod?: string;
  provider?: string;
  ipAddress?: string;
  country?: string;
  riskScoreMin?: number;
  riskScoreMax?: number;
  attemptedAfter?: Date;
  attemptedBefore?: Date;
}

/**
 * Security event search filters
 */
export interface SecurityEventSearchFilters {
  type?: SecurityEventType | SecurityEventType[];
  severity?: SecuritySeverity | SecuritySeverity[];
  userId?: string;
  status?: string | string[];
  resolved?: boolean;
  automated?: boolean;
  detectedAfter?: Date;
  detectedBefore?: Date;
  search?: string;
}

/**
 * Pagination options for audit logs
 */
export interface AuditLogPaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated audit log response
 */
export interface PaginatedAuditLogResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Audit log statistics
 */
export interface AuditLogStatistics {
  totalLogs: number;
  logsByAction: Record<string, number>;
  logsByCategory: Record<string, number>;
  logsByService: Record<string, number>;
  recentActivity: Array<{
    hour: string;
    count: number;
  }>;
  topUsers: Array<{
    userId: string;
    username?: string;
    actionCount: number;
  }>;
  topEntities: Array<{
    entityType: string;
    entityId: string;
    actionCount: number;
  }>;
}

/**
 * Login attempt statistics
 */
export interface LoginAttemptStatistics {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  successRate: number;
  attemptsByMethod: Record<string, number>;
  attemptsByProvider: Record<string, number>;
  failureReasons: Record<string, number>;
  suspiciousAttempts: number;
  blockedIPs: string[];
  recentFailures: Array<{
    identifier: string;
    count: number;
    lastAttempt: Date;
  }>;
}

/**
 * Security event statistics
 */
export interface SecurityEventStatistics {
  totalEvents: number;
  openEvents: number;
  resolvedEvents: number;
  eventsByType: Record<SecurityEventType, number>;
  eventsBySeverity: Record<SecuritySeverity, number>;
  averageResolutionTime: number;
  automatedResponseRate: number;
  topThreats: Array<{
    type: SecurityEventType;
    count: number;
    severity: SecuritySeverity;
  }>;
  recentEvents: Array<{
    id: string;
    type: SecurityEventType;
    severity: SecuritySeverity;
    title: string;
    detectedAt: Date;
  }>;
}

/**
 * Compliance report data
 */
export interface ComplianceReport {
  period: {
    start: Date;
    end: Date;
  };
  auditCoverage: {
    totalActions: number;
    loggedActions: number;
    coveragePercentage: number;
  };
  userActivity: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    deletedUsers: number;
  };
  dataChanges: {
    creates: number;
    updates: number;
    deletes: number;
    sensitiveChanges: number;
  };
  securityIncidents: {
    total: number;
    resolved: number;
    criticalCount: number;
    averageResolutionTime: number;
  };
  authentication: {
    totalLogins: number;
    failedLogins: number;
    suspiciousLogins: number;
    passwordResets: number;
  };
  compliance: {
    gdprRequests: number;
    dataExports: number;
    dataDeletions: number;
    consentUpdates: number;
  };
}

/**
 * Audit trail for specific entity
 */
export interface EntityAuditTrail {
  entityType: string;
  entityId: string;
  history: Array<{
    id: string;
    action: AuditAction;
    userId?: string;
    username?: string;
    changes?: Record<string, any>;
    timestamp: Date;
  }>;
  created?: {
    by: string;
    at: Date;
    initialValues: Record<string, any>;
  };
  lastModified?: {
    by: string;
    at: Date;
  };
  deleted?: {
    by: string;
    at: Date;
  };
}

/**
 * Risk assessment based on login attempts
 */
export interface RiskAssessment {
  userId?: string;
  identifier: string;
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: Array<{
    factor: string;
    weight: number;
    description: string;
  }>;
  recommendations: string[];
  shouldBlock: boolean;
  requiresMFA: boolean;
  requiresCaptcha: boolean;
}

/**
 * Security incident response
 */
export interface IncidentResponse {
  eventId: string;
  responseType: 'automatic' | 'manual';
  actions: Array<{
    action: string;
    timestamp: Date;
    result: 'success' | 'failure' | 'pending';
    details?: Record<string, any>;
  }>;
  notifications: Array<{
    recipient: string;
    method: 'email' | 'discord' | 'webhook' | 'sms';
    sentAt: Date;
    status: 'sent' | 'failed' | 'pending';
  }>;
  escalated: boolean;
  escalationLevel?: number;
  assignedTo?: string;
  notes?: string;
}

/**
 * Audit log export format
 */
export interface AuditLogExport {
  exportId: string;
  exportedAt: Date;
  exportedBy: string;
  filters: AuditLogSearchFilters;
  format: 'json' | 'csv' | 'pdf';
  logs: Array<{
    id: string;
    timestamp: Date;
    action: string;
    user?: string;
    entityType?: string;
    entityId?: string;
    details: Record<string, any>;
    ipAddress?: string;
  }>;
  summary: {
    totalRecords: number;
    dateRange: {
      start: Date;
      end: Date;
    };
    uniqueUsers: number;
    uniqueActions: number;
  };
}

/**
 * Audit action categories
 */
export const AUDIT_CATEGORIES = {
  AUTHENTICATION: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_CHANGED'],
  USER_MANAGEMENT: ['USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_SUSPENDED', 'USER_BANNED'],
  ROLE_MANAGEMENT: ['ROLE_ASSIGNED', 'ROLE_REMOVED', 'PERMISSIONS_CHANGED'],
  LICENSE_MANAGEMENT: ['KEY_GENERATED', 'KEY_ACTIVATED', 'KEY_VALIDATED', 'KEY_REVOKED', 'KEY_EXPIRED'],
  ADMIN: ['ADMIN_ACCESS', 'SETTINGS_CHANGED', 'DATA_EXPORTED', 'SYSTEM_CONFIG_CHANGED'],
} as const;

/**
 * Helper functions for audit logs
 */
export const AuditHelpers = {
  /**
   * Get category for audit action
   */
  getActionCategory(action: AuditAction): string | undefined {
    for (const [category, actions] of Object.entries(AUDIT_CATEGORIES)) {
      if (actions.includes(action)) {
        return category;
      }
    }
    return undefined;
  },

  /**
   * Check if action is sensitive
   */
  isSensitiveAction(action: AuditAction): boolean {
    const sensitiveActions: AuditAction[] = [
      AuditAction.USER_DELETED,
      AuditAction.PERMISSIONS_CHANGED,
      AuditAction.DATA_EXPORTED,
      AuditAction.SYSTEM_CONFIG_CHANGED,
    ];
    return sensitiveActions.includes(action);
  },

  /**
   * Format audit log for display
   */
  formatAuditLog(log: AuditLog): string {
    const timestamp = new Date(log.createdAt).toISOString();
    const user = log.userId || 'System';
    const entity = log.entityId ? `${log.entityType}:${log.entityId}` : '';
    return `[${timestamp}] ${user} performed ${log.action} ${entity}`.trim();
  },

  /**
   * Calculate risk score for login attempt
   */
  calculateRiskScore(attempt: LoginAttempt): number {
    let score = 0;

    // Failed attempt adds to risk
    if (!attempt.success) score += 20;

    // Multiple failures from same IP
    if (attempt.riskFactors?.includes('multiple_failures')) score += 30;

    // Unknown location
    if (attempt.riskFactors?.includes('unknown_location')) score += 15;

    // VPN/Proxy usage
    if (attempt.riskFactors?.includes('vpn_detected')) score += 10;

    // Suspicious timing
    if (attempt.riskFactors?.includes('suspicious_timing')) score += 10;

    // Device mismatch
    if (attempt.riskFactors?.includes('device_mismatch')) score += 15;

    return Math.min(score, 100);
  },
};