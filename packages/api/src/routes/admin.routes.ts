/**
 * Admin Routes
 *
 * System administration endpoints for monitoring and management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { query, param, body, validationResult } from 'express-validator';
import { AuditAction, UserRole } from '@prisma/client';
import { prisma } from '@dca-auth/shared/database/client';
import { authenticate, requireAdmin, requireSuperAdmin } from '@dca-auth/shared/auth';
import { logger } from '@dca-auth/shared/logging/logger';
import { ValidationError, NotFoundError } from '@dca-auth/shared/errors';
import { auditService } from '@dca-auth/shared/services/audit.service';
import { config } from '@dca-auth/shared/config';

const router = Router();

/**
 * GET /api/admin/stats
 * Get system statistics
 */
router.get('/stats',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [
        totalUsers,
        activeUsers,
        totalLicenses,
        activeLicenses,
        totalActivations,
        totalSessions,
        activeSessions,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({
          where: {
            lastLoginAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days
            },
          },
        }),
        prisma.licenseKey.count(),
        prisma.licenseKey.count({
          where: {
            status: 'ACTIVE',
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        }),
        prisma.licenseActivation.count({
          where: { status: 'ACTIVE' },
        }),
        prisma.session.count(),
        prisma.session.count({
          where: {
            status: 'ACTIVE',
            expiresAt: { gt: new Date() },
          },
        }),
      ]);

      // Get growth statistics
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [newUsersLast30Days, newLicensesLast30Days] = await Promise.all([
        prisma.user.count({
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
        prisma.licenseKey.count({
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
      ]);

      // Get revenue stats if applicable
      const revenueStats = await prisma.licenseKey.groupBy({
        by: ['type'],
        _count: {
          id: true,
        },
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
      });

      const stats = {
        users: {
          total: totalUsers,
          active: activeUsers,
          newLast30Days: newUsersLast30Days,
        },
        licenses: {
          total: totalLicenses,
          active: activeLicenses,
          newLast30Days: newLicensesLast30Days,
        },
        activations: {
          total: totalActivations,
        },
        sessions: {
          total: totalSessions,
          active: activeSessions,
        },
        revenue: {
          byType: revenueStats,
        },
        system: {
          version: config.app.version,
          environment: config.env,
          uptime: process.uptime(),
        },
      };

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/audit-logs
 * Get audit logs
 */
router.get('/audit-logs',
  authenticate,
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('userId').optional().isUUID(),
    query('action').optional().isIn(Object.values(AuditAction)),
    query('entityType').optional().isString(),
    query('entityId').optional().isString(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid query parameters', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      // Build where clause
      const where: any = {};
      if (req.query.userId) where.userId = req.query.userId;
      if (req.query.action) where.action = req.query.action;
      if (req.query.entityType) where.entityType = req.query.entityType;
      if (req.query.entityId) where.entityId = req.query.entityId;

      // Date range filter
      if (req.query.startDate || req.query.endDate) {
        where.createdAt = {};
        if (req.query.startDate) {
          where.createdAt.gte = new Date(req.query.startDate as string);
        }
        if (req.query.endDate) {
          where.createdAt.lte = new Date(req.query.endDate as string);
        }
      }

      // Get total count
      const total = await prisma.auditLog.count({ where });

      // Get audit logs
      const auditLogs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              discordId: true,
            },
          },
        },
      });

      const pages = Math.ceil(total / limit);

      res.json({
        auditLogs,
        pagination: {
          total,
          page,
          pages,
          limit,
          hasNext: page < pages,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/sessions
 * Get all active sessions
 */
router.get('/sessions',
  authenticate,
  requireAdmin,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['ACTIVE', 'EXPIRED', 'REVOKED']),
    query('userId').optional().isUUID(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid query parameters', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const where: any = {};
      if (req.query.status) where.status = req.query.status;
      if (req.query.userId) where.userId = req.query.userId;

      const total = await prisma.session.count({ where });

      const sessions = await prisma.session.findMany({
        where,
        orderBy: { lastActivityAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              discordId: true,
            },
          },
        },
      });

      const pages = Math.ceil(total / limit);

      res.json({
        sessions,
        pagination: {
          total,
          page,
          pages,
          limit,
          hasNext: page < pages,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/sessions/:id/revoke
 * Revoke a session
 */
router.post('/sessions/:id/revoke',
  authenticate,
  requireAdmin,
  param('id').isUUID(),
  body('reason').isString().notEmpty(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid input', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const { id } = req.params;
      const { reason } = req.body;

      const session = await prisma.session.findUnique({
        where: { id },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      await prisma.session.update({
        where: { id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedReason: reason,
        },
      });

      // Log audit event
      await auditService.log({
        userId: req.user!.id,
        action: AuditAction.SESSION_REVOKED,
        entityType: 'session',
        entityId: id,
        details: {
          sessionUserId: session.userId,
          reason,
          revokedBy: req.user!.username,
        },
        ipAddress: req.ip,
      });

      logger.info('Session revoked by admin', {
        sessionId: id,
        revokedBy: req.user!.id,
        reason,
        correlationId: (req as any).correlationId,
      });

      res.json({ message: 'Session revoked successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/config
 * Get system configuration (super admin only)
 */
router.get('/config',
  authenticate,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    // Return sanitized config (no secrets)
    const sanitizedConfig = {
      app: {
        name: config.app.name,
        version: config.app.version,
        env: config.env,
      },
      server: {
        port: config.server.port,
        host: config.server.host,
      },
      auth: {
        jwtAlgorithm: config.auth.jwtAlgorithm,
        jwtExpiresIn: config.auth.jwtExpiresIn,
        refreshTokenExpiresIn: config.auth.refreshTokenExpiresIn,
        sessionDuration: config.auth.sessionDuration,
        maxSessionsPerUser: config.auth.maxSessionsPerUser,
        useCookies: config.auth.useCookies,
      },
      discord: {
        clientId: config.discord.clientId,
        redirectUri: config.discord.redirectUri,
        scopes: config.discord.scopes,
      },
      features: config.features,
    };

    res.json(sanitizedConfig);
  }
);

/**
 * POST /api/admin/config
 * Update system configuration (super admin only)
 */
router.post('/config',
  authenticate,
  requireSuperAdmin,
  body('features').optional().isObject(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid input', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      // In production, this would update configuration storage
      // For now, we'll just log the attempt
      logger.warn('Configuration update attempted', {
        updatedBy: req.user!.id,
        changes: req.body,
        correlationId: (req as any).correlationId,
      });

      // Log audit event
      await auditService.log({
        userId: req.user!.id,
        action: AuditAction.CONFIG_UPDATED,
        entityType: 'system_config',
        entityId: 'global',
        details: {
          changes: req.body,
          updatedBy: req.user!.username,
        },
        ipAddress: req.ip,
      });

      res.json({
        message: 'Configuration update logged. Manual intervention required for production changes.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/roles
 * Get all role assignments
 */
router.get('/roles',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roleAssignments = await prisma.user.groupBy({
        by: ['roles'],
        _count: {
          id: true,
        },
      });

      // Get users by role
      const adminUsers = await prisma.user.findMany({
        where: {
          roles: {
            hasSome: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
          },
        },
        select: {
          id: true,
          username: true,
          discordId: true,
          roles: true,
        },
      });

      const moderatorUsers = await prisma.user.findMany({
        where: {
          roles: {
            has: UserRole.MODERATOR,
          },
        },
        select: {
          id: true,
          username: true,
          discordId: true,
          roles: true,
        },
      });

      res.json({
        summary: roleAssignments,
        admins: adminUsers,
        moderators: moderatorUsers,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/roles/assign
 * Assign role to user (super admin only)
 */
router.post('/roles/assign',
  authenticate,
  requireSuperAdmin,
  [
    body('userId').isUUID(),
    body('role').isIn(Object.values(UserRole)),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid input', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const { userId, role } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Add role if not already present
      const updatedRoles = user.roles.includes(role)
        ? user.roles
        : [...user.roles, role];

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          roles: updatedRoles,
        },
      });

      // Log audit event
      await auditService.log({
        userId: req.user!.id,
        action: AuditAction.ROLE_ASSIGNED,
        entityType: 'user',
        entityId: userId,
        details: {
          role,
          assignedTo: user.username,
          assignedBy: req.user!.username,
        },
        ipAddress: req.ip,
      });

      logger.info('Role assigned', {
        userId,
        role,
        assignedBy: req.user!.id,
        correlationId: (req as any).correlationId,
      });

      res.json(updatedUser);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/roles/revoke
 * Revoke role from user (super admin only)
 */
router.post('/roles/revoke',
  authenticate,
  requireSuperAdmin,
  [
    body('userId').isUUID(),
    body('role').isIn(Object.values(UserRole)),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid input', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const { userId, role } = req.body;

      // Prevent self-demotion for safety
      if (userId === req.user!.id) {
        throw new ValidationError('You cannot revoke your own roles', [
          { field: 'userId', message: 'SELF_DEMOTION_NOT_ALLOWED' }
        ]);
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Remove role
      const updatedRoles = user.roles.filter(r => r !== role);

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          roles: updatedRoles,
        },
      });

      // Log audit event
      await auditService.log({
        userId: req.user!.id,
        action: AuditAction.ROLE_REVOKED,
        entityType: 'user',
        entityId: userId,
        details: {
          role,
          revokedFrom: user.username,
          revokedBy: req.user!.username,
        },
        ipAddress: req.ip,
      });

      logger.info('Role revoked', {
        userId,
        role,
        revokedBy: req.user!.id,
        correlationId: (req as any).correlationId,
      });

      res.json(updatedUser);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/admin/reports/usage
 * Generate usage report
 */
router.get('/reports/usage',
  authenticate,
  requireAdmin,
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('groupBy').optional().isIn(['day', 'week', 'month']),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid query parameters', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date();

      // Get usage statistics
      const [
        userSignups,
        licenseCreations,
        licenseActivations,
        uniqueLogins,
      ] = await Promise.all([
        prisma.user.count({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        }),
        prisma.licenseKey.count({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        }),
        prisma.licenseActivation.count({
          where: {
            activatedAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        }),
        prisma.session.findMany({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          distinct: ['userId'],
          select: { userId: true },
        }).then(sessions => sessions.length),
      ]);

      const report = {
        period: {
          start: startDate,
          end: endDate,
        },
        metrics: {
          userSignups,
          licenseCreations,
          licenseActivations,
          uniqueLogins,
        },
      };

      res.json(report);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/admin/maintenance/cleanup
 * Clean up old data (super admin only)
 */
router.post('/maintenance/cleanup',
  authenticate,
  requireSuperAdmin,
  [
    body('expiredSessions').optional().isBoolean(),
    body('oldAuditLogs').optional().isBoolean(),
    body('daysToKeep').optional().isInt({ min: 30 }),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid input', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const { expiredSessions = true, oldAuditLogs = false, daysToKeep = 90 } = req.body;
      const results: any = {};

      // Clean up expired sessions
      if (expiredSessions) {
        const deleted = await prisma.session.deleteMany({
          where: {
            OR: [
              { expiresAt: { lt: new Date() } },
              { status: 'EXPIRED' },
            ],
          },
        });
        results.sessionsDeleted = deleted.count;
      }

      // Clean up old audit logs
      if (oldAuditLogs) {
        const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
        const deleted = await prisma.auditLog.deleteMany({
          where: {
            createdAt: { lt: cutoffDate },
          },
        });
        results.auditLogsDeleted = deleted.count;
      }

      // Log audit event
      await auditService.log({
        userId: req.user!.id,
        action: AuditAction.MAINTENANCE_PERFORMED,
        entityType: 'system',
        entityId: 'maintenance',
        details: {
          operations: req.body,
          results,
          performedBy: req.user!.username,
        },
        ipAddress: req.ip,
      });

      logger.info('Maintenance cleanup performed', {
        performedBy: req.user!.id,
        results,
        correlationId: (req as any).correlationId,
      });

      res.json({
        message: 'Cleanup completed successfully',
        results,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;