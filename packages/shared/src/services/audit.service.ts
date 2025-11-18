/**
 * Audit Service
 *
 * Handles audit logging for compliance and security tracking
 */

import { v4 as uuidv4 } from 'uuid';
import { AuditLog, AuditAction } from '@prisma/client';
import { prisma } from '../database/client.js';
import { logger } from '../logging/logger.js';
import {
  CreateAuditLogInput,
  AuditLogSearchFilters,
  PaginatedAuditLogResponse,
  EntityAuditTrail,
  ComplianceReport,
} from '../database/types/audit.types.js';
import { getCorrelationId } from '../logging/middleware/correlation.js';

export class AuditService {
  /**
   * Log an audit event
   */
  async log(input: CreateAuditLogInput): Promise<AuditLog> {
    try {
      const auditLog = await prisma.auditLog.create({
        data: {
          id: uuidv4(),
          userId: input.userId,
          action: input.action,
          category: input.category || this.getActionCategory(input.action),
          entityType: input.entityType,
          entityId: input.entityId,
          details: input.details || {},
          oldValues: input.oldValues,
          newValues: input.newValues,
          changes: input.changes || this.calculateChanges(input.oldValues, input.newValues),
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          sessionId: input.sessionId,
          correlationId: input.correlationId || getCorrelationId(),
          requestId: input.requestId,
          serviceName: input.serviceName || 'api',
          environment: input.environment || process.env.NODE_ENV || 'development',
          version: input.version || process.env.APP_VERSION,
          createdAt: new Date(),
        },
      });

      logger.audit(input.action, {
        auditLogId: auditLog.id,
        userId: auditLog.userId,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
      });

      return auditLog;
    } catch (error) {
      logger.error('Failed to create audit log', error, input);
      // Don't throw - audit logging should not break the application
      return null as any;
    }
  }

  /**
   * Search audit logs
   */
  async searchLogs(
    filters: AuditLogSearchFilters,
    page = 1,
    limit = 50
  ): Promise<PaginatedAuditLogResponse> {
    const where: any = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.action) {
      where.action = Array.isArray(filters.action)
        ? { in: filters.action }
        : filters.action;
    }
    if (filters.category) {
      where.category = Array.isArray(filters.category)
        ? { in: filters.category }
        : filters.category;
    }
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.ipAddress) where.ipAddress = filters.ipAddress;
    if (filters.sessionId) where.sessionId = filters.sessionId;
    if (filters.correlationId) where.correlationId = filters.correlationId;
    if (filters.serviceName) where.serviceName = filters.serviceName;
    if (filters.environment) where.environment = filters.environment;

    if (filters.createdAfter || filters.createdBefore) {
      where.createdAt = {};
      if (filters.createdAfter) where.createdAt.gte = filters.createdAfter;
      if (filters.createdBefore) where.createdAt.lte = filters.createdBefore;
    }

    if (filters.search) {
      where.OR = [
        { details: { contains: filters.search } },
        { entityId: { contains: filters.search } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const pages = Math.ceil(total / limit);

    return {
      logs,
      total,
      page,
      pages,
      hasNext: page < pages,
      hasPrev: page > 1,
    };
  }

  /**
   * Get audit trail for a specific entity
   */
  async getEntityAuditTrail(
    entityType: string,
    entityId: string
  ): Promise<EntityAuditTrail> {
    const logs = await prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    const trail: EntityAuditTrail = {
      entityType,
      entityId,
      history: logs.map(log => ({
        id: log.id,
        action: log.action,
        userId: log.userId || undefined,
        username: log.user?.username,
        changes: log.changes as any,
        timestamp: log.createdAt,
      })),
    };

    // Find creation event
    const createLog = logs.find(log =>
      ['USER_CREATED', 'KEY_GENERATED'].includes(log.action)
    );
    if (createLog) {
      trail.created = {
        by: createLog.userId || 'system',
        at: createLog.createdAt,
        initialValues: createLog.newValues as any || {},
      };
    }

    // Find last modification
    const updateLog = logs
      .filter(log => ['USER_UPDATED', 'KEY_UPDATED', 'PROFILE_UPDATED'].includes(log.action))
      .pop();
    if (updateLog) {
      trail.lastModified = {
        by: updateLog.userId || 'system',
        at: updateLog.createdAt,
      };
    }

    // Find deletion event
    const deleteLog = logs.find(log =>
      ['USER_DELETED', 'KEY_REVOKED'].includes(log.action)
    );
    if (deleteLog) {
      trail.deleted = {
        by: deleteLog.userId || 'system',
        at: deleteLog.createdAt,
      };
    }

    return trail;
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {
    const where = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    // Get audit statistics
    const [totalActions, auditLogs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        select: {
          action: true,
          category: true,
          entityType: true,
        },
      }),
    ]);

    // Count actions by type
    const actionCounts = auditLogs.reduce((acc, log) => {
      const category = log.category || 'other';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get user activity
    const [totalUsers, newUsers, deletedUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          createdAt: where.createdAt,
        },
      }),
      prisma.auditLog.count({
        where: {
          ...where,
          action: AuditAction.USER_DELETED,
        },
      }),
    ]);

    const activeUsers = await prisma.session.groupBy({
      by: ['userId'],
      where: {
        createdAt: where.createdAt,
      },
    });

    // Data changes
    const creates = await prisma.auditLog.count({
      where: {
        ...where,
        action: {
          in: [
            AuditAction.USER_CREATED,
            AuditAction.KEY_GENERATED,
            AuditAction.SESSION_CREATED,
          ],
        },
      },
    });

    const updates = await prisma.auditLog.count({
      where: {
        ...where,
        action: {
          in: [
            AuditAction.USER_UPDATED,
            AuditAction.PROFILE_UPDATED,
            AuditAction.PERMISSIONS_CHANGED,
          ],
        },
      },
    });

    const deletes = await prisma.auditLog.count({
      where: {
        ...where,
        action: {
          in: [
            AuditAction.USER_DELETED,
            AuditAction.KEY_REVOKED,
            AuditAction.SESSION_REVOKED,
          ],
        },
      },
    });

    // Security incidents
    const [totalIncidents, resolvedIncidents, criticalIncidents] = await Promise.all([
      prisma.securityEvent.count({
        where: {
          detectedAt: where.createdAt,
        },
      }),
      prisma.securityEvent.count({
        where: {
          detectedAt: where.createdAt,
          resolved: true,
        },
      }),
      prisma.securityEvent.count({
        where: {
          detectedAt: where.createdAt,
          severity: 'CRITICAL',
        },
      }),
    ]);

    // Authentication statistics
    const [totalLogins, failedLogins, passwordResets] = await Promise.all([
      prisma.loginAttempt.count({
        where: {
          attemptedAt: where.createdAt,
          success: true,
        },
      }),
      prisma.loginAttempt.count({
        where: {
          attemptedAt: where.createdAt,
          success: false,
        },
      }),
      prisma.auditLog.count({
        where: {
          ...where,
          action: AuditAction.PASSWORD_RESET_REQUESTED,
        },
      }),
    ]);

    const suspiciousLogins = await prisma.loginAttempt.count({
      where: {
        attemptedAt: where.createdAt,
        riskScore: {
          gte: 70,
        },
      },
    });

    // GDPR compliance
    const dataExports = await prisma.auditLog.count({
      where: {
        ...where,
        action: AuditAction.DATA_EXPORTED,
      },
    });

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      auditCoverage: {
        totalActions,
        loggedActions: totalActions,
        coveragePercentage: 100, // Assuming all actions are logged
      },
      userActivity: {
        totalUsers,
        activeUsers: activeUsers.length,
        newUsers,
        deletedUsers,
      },
      dataChanges: {
        creates,
        updates,
        deletes,
        sensitiveChanges: actionCounts.role_management || 0,
      },
      securityIncidents: {
        total: totalIncidents,
        resolved: resolvedIncidents,
        criticalCount: criticalIncidents,
        averageResolutionTime: 0, // TODO: Calculate actual resolution time
      },
      authentication: {
        totalLogins,
        failedLogins,
        suspiciousLogins,
        passwordResets,
      },
      compliance: {
        gdprRequests: 0, // TODO: Track GDPR requests
        dataExports,
        dataDeletions: deletedUsers,
        consentUpdates: 0, // TODO: Track consent updates
      },
    };
  }

  /**
   * Get action category
   */
  private getActionCategory(action: AuditAction): string {
    const categories: Record<string, AuditAction[]> = {
      authentication: [
        AuditAction.LOGIN_SUCCESS,
        AuditAction.LOGIN_FAILED,
        AuditAction.LOGOUT,
        AuditAction.SESSION_CREATED,
        AuditAction.SESSION_REFRESHED,
        AuditAction.SESSION_REVOKED,
        AuditAction.PASSWORD_RESET_REQUESTED,
        AuditAction.PASSWORD_CHANGED,
        AuditAction.EMAIL_VERIFIED,
      ],
      user_management: [
        AuditAction.USER_CREATED,
        AuditAction.USER_UPDATED,
        AuditAction.USER_DELETED,
        AuditAction.USER_SUSPENDED,
        AuditAction.USER_REACTIVATED,
        AuditAction.USER_BANNED,
        AuditAction.PROFILE_UPDATED,
      ],
      role_management: [
        AuditAction.ROLE_ASSIGNED,
        AuditAction.ROLE_REMOVED,
        AuditAction.PERMISSIONS_CHANGED,
      ],
      license_management: [
        AuditAction.KEY_GENERATED,
        AuditAction.KEY_ACTIVATED,
        AuditAction.KEY_VALIDATED,
        AuditAction.KEY_REVOKED,
        AuditAction.KEY_EXPIRED,
        AuditAction.KEY_TRANSFERRED,
      ],
      admin: [
        AuditAction.ADMIN_ACCESS,
        AuditAction.SETTINGS_CHANGED,
        AuditAction.DATA_EXPORTED,
        AuditAction.DATA_IMPORTED,
        AuditAction.SYSTEM_CONFIG_CHANGED,
      ],
    };

    for (const [category, actions] of Object.entries(categories)) {
      if (actions.includes(action)) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Calculate changes between old and new values
   */
  private calculateChanges(
    oldValues?: Record<string, any> | null,
    newValues?: Record<string, any> | null
  ): Record<string, any> | null {
    if (!oldValues || !newValues) {
      return null;
    }

    const changes: Record<string, any> = {};

    // Find changed fields
    for (const key in newValues) {
      if (oldValues[key] !== newValues[key]) {
        changes[key] = {
          old: oldValues[key],
          new: newValues[key],
        };
      }
    }

    // Find removed fields
    for (const key in oldValues) {
      if (!(key in newValues)) {
        changes[key] = {
          old: oldValues[key],
          new: undefined,
        };
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }
}

// Export singleton instance
export const auditService = new AuditService();