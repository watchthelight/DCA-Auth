/**
 * User Management Routes
 *
 * Handles user CRUD operations
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { UserRole, UserStatus } from '@prisma/client';
import { prisma } from '@dca-auth/shared/database/client';
import {
  authenticate,
  requireAdmin,
  requireModerator,
  canAccessResource,
} from '@dca-auth/shared/auth';
import { logger } from '@dca-auth/shared/logging/logger';
import { ValidationError, NotFoundError, ForbiddenError } from '@dca-auth/shared/errors';
import { auditService } from '@dca-auth/shared/services/audit.service';
import { AuditAction } from '@prisma/client';
import {
  UserSearchFilters,
  UserPaginationOptions,
  UpdateUserInput,
} from '@dca-auth/shared/database/types/user.types';

const router = Router();

/**
 * GET /api/users
 * List users (admin/moderator only)
 */
router.get('/',
  authenticate,
  requireModerator,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'lastLoginAt', 'username', 'email']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
    query('status').optional().isIn(Object.values(UserStatus)),
    query('role').optional().isIn(Object.values(UserRole)),
    query('search').optional().isString(),
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

      const filters: UserSearchFilters = {
        status: req.query.status as UserStatus,
        roles: req.query.role as UserRole,
        search: req.query.search as string,
        isEmailVerified: req.query.emailVerified === 'true' ? true : undefined,
        isBanned: req.query.banned === 'true' ? true : undefined,
      };

      const options: UserPaginationOptions = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
        sortBy: (req.query.sortBy as any) || 'createdAt',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      };

      // Build where clause
      const where: any = {};
      if (filters.status) where.status = filters.status;
      if (filters.roles) where.roles = { has: filters.roles };
      if (filters.isEmailVerified !== undefined) where.isEmailVerified = filters.isEmailVerified;
      if (filters.isBanned !== undefined) where.isBanned = filters.isBanned;
      if (filters.search) {
        where.OR = [
          { username: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
          { discordId: { contains: filters.search } },
        ];
      }

      // Get total count
      const total = await prisma.user.count({ where });

      // Get users
      const users = await prisma.user.findMany({
        where,
        orderBy: { [options.sortBy!]: options.sortOrder },
        skip: (options.page! - 1) * options.limit!,
        take: options.limit,
        select: {
          id: true,
          discordId: true,
          username: true,
          discriminator: true,
          email: true,
          avatarHash: true,
          status: true,
          roles: true,
          isEmailVerified: true,
          isBanned: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              sessions: true,
              ownedLicenses: true,
            },
          },
        },
      });

      const pages = Math.ceil(total / options.limit!);

      res.json({
        users,
        pagination: {
          total,
          page: options.page,
          pages,
          limit: options.limit,
          hasNext: options.page! < pages,
          hasPrev: options.page! > 1,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/users/:id
 * Get user by ID
 */
router.get('/:id',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid parameters', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const { id } = req.params;

      // Check if user can access this resource
      const isOwner = req.user!.id === id;
      const isModerator = req.user!.roles.includes(UserRole.MODERATOR) ||
                         req.user!.roles.includes(UserRole.ADMIN) ||
                         req.user!.roles.includes(UserRole.SUPER_ADMIN);

      if (!isOwner && !isModerator) {
        throw new ForbiddenError('You do not have permission to view this user');
      }

      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          profile: true,
          _count: {
            select: {
              sessions: true,
              ownedLicenses: true,
              activations: true,
            },
          },
        },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Remove sensitive data if not owner or admin
      if (!isOwner && !req.user!.roles.includes(UserRole.ADMIN)) {
        delete (user as any).passwordHash;
        delete (user as any).twoFactorSecret;
        delete (user as any).metadata;
      }

      res.json(user);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/users/:id
 * Update user
 */
router.patch('/:id',
  authenticate,
  param('id').isUUID(),
  [
    body('username').optional().isString().isLength({ min: 3, max: 32 }),
    body('email').optional().isEmail(),
    body('status').optional().isIn(Object.values(UserStatus)),
    body('roles').optional().isArray(),
    body('metadata').optional().isObject(),
    body('preferences').optional().isObject(),
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

      const { id } = req.params;
      const updateData: UpdateUserInput = req.body;

      // Check permissions
      const isOwner = req.user!.id === id;
      const isAdmin = req.user!.roles.includes(UserRole.ADMIN) ||
                     req.user!.roles.includes(UserRole.SUPER_ADMIN);

      // Only admins can update status and roles
      if ((updateData.status || updateData.roles) && !isAdmin) {
        throw new ForbiddenError('Only administrators can update user status and roles');
      }

      // Users can only update their own profile unless admin
      if (!isOwner && !isAdmin) {
        throw new ForbiddenError('You can only update your own profile');
      }

      // Get current user for audit
      const currentUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!currentUser) {
        throw new NotFoundError('User not found');
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
        include: {
          profile: true,
        },
      });

      // Log audit event
      await auditService.log({
        userId: req.user!.id,
        action: AuditAction.USER_UPDATED,
        entityType: 'user',
        entityId: id,
        details: {
          updatedFields: Object.keys(updateData),
          updatedBy: req.user!.username,
        },
        oldValues: currentUser,
        newValues: updateData,
        ipAddress: req.ip,
      });

      logger.info('User updated', {
        userId: id,
        updatedBy: req.user!.id,
        fields: Object.keys(updateData),
        correlationId: (req as any).correlationId,
      });

      res.json(updatedUser);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/users/:id
 * Delete user (soft delete)
 */
router.delete('/:id',
  authenticate,
  requireAdmin,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid parameters', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const { id } = req.params;

      // Prevent self-deletion
      if (req.user!.id === id) {
        throw new ValidationError('You cannot delete your own account', [
          { field: 'id', message: 'SELF_DELETION_NOT_ALLOWED' }
        ]);
      }

      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Soft delete
      await prisma.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: UserStatus.BANNED,
        },
      });

      // Revoke all sessions
      await prisma.session.updateMany({
        where: { userId: id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedReason: 'User account deleted',
        },
      });

      // Log audit event
      await auditService.log({
        userId: req.user!.id,
        action: AuditAction.USER_DELETED,
        entityType: 'user',
        entityId: id,
        details: {
          deletedUser: user.username,
          deletedBy: req.user!.username,
        },
        ipAddress: req.ip,
      });

      logger.info('User deleted', {
        userId: id,
        deletedBy: req.user!.id,
        correlationId: (req as any).correlationId,
      });

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/users/:id/ban
 * Ban user
 */
router.post('/:id/ban',
  authenticate,
  requireModerator,
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

      const user = await prisma.user.update({
        where: { id },
        data: {
          status: UserStatus.BANNED,
          isBanned: true,
          banReason: reason,
        },
      });

      // Revoke all sessions
      await prisma.session.updateMany({
        where: { userId: id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedReason: 'User banned',
        },
      });

      // Log audit event
      await auditService.log({
        userId: req.user!.id,
        action: AuditAction.USER_BANNED,
        entityType: 'user',
        entityId: id,
        details: {
          bannedUser: user.username,
          bannedBy: req.user!.username,
          reason,
        },
        ipAddress: req.ip,
      });

      logger.info('User banned', {
        userId: id,
        bannedBy: req.user!.id,
        reason,
        correlationId: (req as any).correlationId,
      });

      res.json({ message: 'User banned successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/users/:id/unban
 * Unban user
 */
router.post('/:id/unban',
  authenticate,
  requireModerator,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid parameters', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const { id } = req.params;

      const user = await prisma.user.update({
        where: { id },
        data: {
          status: UserStatus.ACTIVE,
          isBanned: false,
          banReason: null,
        },
      });

      // Log audit event
      await auditService.log({
        userId: req.user!.id,
        action: AuditAction.USER_REACTIVATED,
        entityType: 'user',
        entityId: id,
        details: {
          unbannedUser: user.username,
          unbannedBy: req.user!.username,
        },
        ipAddress: req.ip,
      });

      logger.info('User unbanned', {
        userId: id,
        unbannedBy: req.user!.id,
        correlationId: (req as any).correlationId,
      });

      res.json({ message: 'User unbanned successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/users/:id/sessions
 * Get user sessions
 */
router.get('/:id/sessions',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid parameters', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const { id } = req.params;

      // Check permissions
      const isOwner = req.user!.id === id;
      const isAdmin = req.user!.roles.includes(UserRole.ADMIN) ||
                     req.user!.roles.includes(UserRole.SUPER_ADMIN);

      if (!isOwner && !isAdmin) {
        throw new ForbiddenError('You can only view your own sessions');
      }

      const sessions = await prisma.session.findMany({
        where: {
          userId: id,
        },
        orderBy: {
          lastActivityAt: 'desc',
        },
        select: {
          id: true,
          status: true,
          deviceName: true,
          deviceType: true,
          ipAddress: true,
          location: true,
          createdAt: true,
          lastActivityAt: true,
          expiresAt: true,
        },
      });

      res.json(sessions);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/users/:id/licenses
 * Get user's license keys
 */
router.get('/:id/licenses',
  authenticate,
  param('id').isUUID(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid parameters', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const { id } = req.params;

      // Check permissions
      const isOwner = req.user!.id === id;
      const isAdmin = req.user!.roles.includes(UserRole.ADMIN) ||
                     req.user!.roles.includes(UserRole.SUPER_ADMIN);

      if (!isOwner && !isAdmin) {
        throw new ForbiddenError('You can only view your own licenses');
      }

      const licenses = await prisma.licenseKey.findMany({
        where: {
          ownerId: id,
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          key: true,
          shortKey: true,
          type: true,
          status: true,
          name: true,
          maxActivations: true,
          currentActivations: true,
          expiresAt: true,
          createdAt: true,
          _count: {
            select: {
              activations: true,
            },
          },
        },
      });

      res.json(licenses);
    } catch (error) {
      next(error);
    }
  }
);

export default router;