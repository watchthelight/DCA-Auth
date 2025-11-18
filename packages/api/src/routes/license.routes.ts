/**
 * License Key Management Routes
 *
 * Handles license key CRUD, activation, and validation
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { LicenseKeyType, LicenseKeyStatus, UserRole, AuditAction } from '@prisma/client';
import { prisma } from '@dca-auth/shared/database/client';
import {
  authenticate,
  requireAdmin,
  requireModerator,
} from '@dca-auth/shared/auth';
import {
  licenseKeyService,
  keyValidatorService,
} from '@dca-auth/shared/licenses';
import { logger } from '@dca-auth/shared/logging/logger';
import { ValidationError, NotFoundError, ForbiddenError } from '@dca-auth/shared/errors';
import { auditService } from '@dca-auth/shared/services/audit.service';
import {
  CreateLicenseKeyInput,
  UpdateLicenseKeyInput,
  ActivateLicenseKeyInput,
  ValidateLicenseKeyInput,
  TransferLicenseKeyInput,
  LicenseKeyFilters,
  LicenseKeyPaginationOptions,
} from '@dca-auth/shared/database/types/license.types';

const router = Router();

/**
 * POST /api/licenses
 * Create a new license key (admin only)
 */
router.post('/',
  authenticate,
  requireAdmin,
  [
    body('type').isIn(Object.values(LicenseKeyType)),
    body('ownerId').optional().isUUID(),
    body('name').optional().isString().isLength({ min: 1, max: 255 }),
    body('maxActivations').optional().isInt({ min: 1 }),
    body('expiresAt').optional().isISO8601(),
    body('features').optional().isObject(),
    body('restrictions').optional().isObject(),
    body('metadata').optional().isObject(),
    body('autoActivate').optional().isBoolean(),
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

      const licenseKey = await licenseKeyService.createLicenseKey(
        req.body as CreateLicenseKeyInput,
        req.user!.id
      );

      logger.info('License key created', {
        licenseKeyId: licenseKey.id,
        type: licenseKey.type,
        createdBy: req.user!.id,
        correlationId: (req as any).correlationId,
      });

      res.status(201).json(licenseKey);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/licenses
 * List license keys
 */
router.get('/',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'expiresAt', 'name', 'type', 'status']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
    query('type').optional().isIn(Object.values(LicenseKeyType)),
    query('status').optional().isIn(Object.values(LicenseKeyStatus)),
    query('ownerId').optional().isUUID(),
    query('search').optional().isString(),
    query('isExpired').optional().isBoolean(),
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

      // Check permissions - users can only see their own licenses unless admin/moderator
      const isModerator = req.user!.roles.includes(UserRole.MODERATOR) ||
                         req.user!.roles.includes(UserRole.ADMIN) ||
                         req.user!.roles.includes(UserRole.SUPER_ADMIN);

      const filters: LicenseKeyFilters = {
        type: req.query.type as LicenseKeyType,
        status: req.query.status as LicenseKeyStatus,
        ownerId: isModerator ? req.query.ownerId as string : req.user!.id,
        search: req.query.search as string,
        isExpired: req.query.isExpired === 'true',
      };

      const options: LicenseKeyPaginationOptions = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
        sortBy: (req.query.sortBy as any) || 'createdAt',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      };

      // Build where clause
      const where: any = {};
      if (filters.type) where.type = filters.type;
      if (filters.status) where.status = filters.status;
      if (filters.ownerId) where.ownerId = filters.ownerId;
      if (filters.isExpired) {
        where.expiresAt = { lt: new Date() };
      }
      if (filters.search) {
        where.OR = [
          { shortKey: { contains: filters.search, mode: 'insensitive' } },
          { name: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      // Get total count
      const total = await prisma.licenseKey.count({ where });

      // Get license keys
      const licenseKeys = await prisma.licenseKey.findMany({
        where,
        orderBy: { [options.sortBy!]: options.sortOrder },
        skip: (options.page! - 1) * options.limit!,
        take: options.limit,
        select: {
          id: true,
          key: isModerator, // Only show full key to moderators
          shortKey: true,
          type: true,
          status: true,
          name: true,
          maxActivations: true,
          currentActivations: true,
          expiresAt: true,
          createdAt: true,
          owner: {
            select: {
              id: true,
              username: true,
              discordId: true,
            },
          },
          _count: {
            select: {
              activations: true,
            },
          },
        },
      });

      const pages = Math.ceil(total / options.limit!);

      res.json({
        licenseKeys,
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
 * GET /api/licenses/:id
 * Get license key details
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

      const licenseKey = await prisma.licenseKey.findUnique({
        where: { id },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              discordId: true,
            },
          },
          activations: {
            orderBy: { activatedAt: 'desc' },
            take: 10,
          },
          transfers: {
            orderBy: { transferredAt: 'desc' },
            take: 5,
            include: {
              fromUser: {
                select: {
                  id: true,
                  username: true,
                },
              },
              toUser: {
                select: {
                  id: true,
                  username: true,
                },
              },
            },
          },
          _count: {
            select: {
              activations: true,
              transfers: true,
            },
          },
        },
      });

      if (!licenseKey) {
        throw new NotFoundError('License key not found');
      }

      // Check permissions
      const isOwner = licenseKey.ownerId === req.user!.id;
      const isModerator = req.user!.roles.includes(UserRole.MODERATOR) ||
                         req.user!.roles.includes(UserRole.ADMIN) ||
                         req.user!.roles.includes(UserRole.SUPER_ADMIN);

      if (!isOwner && !isModerator) {
        throw new ForbiddenError('You do not have permission to view this license key');
      }

      // Hide full key from non-moderators
      if (!isModerator) {
        delete (licenseKey as any).key;
      }

      res.json(licenseKey);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/licenses/:id
 * Update license key
 */
router.patch('/:id',
  authenticate,
  requireAdmin,
  param('id').isUUID(),
  [
    body('name').optional().isString().isLength({ min: 1, max: 255 }),
    body('status').optional().isIn(Object.values(LicenseKeyStatus)),
    body('maxActivations').optional().isInt({ min: 1 }),
    body('expiresAt').optional().isISO8601(),
    body('features').optional().isObject(),
    body('restrictions').optional().isObject(),
    body('metadata').optional().isObject(),
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

      const licenseKey = await licenseKeyService.updateLicenseKey(
        id,
        req.body as UpdateLicenseKeyInput,
        req.user!.id
      );

      logger.info('License key updated', {
        licenseKeyId: id,
        updatedBy: req.user!.id,
        fields: Object.keys(req.body),
        correlationId: (req as any).correlationId,
      });

      res.json(licenseKey);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/licenses/:id
 * Delete license key (soft delete)
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

      await licenseKeyService.deleteLicenseKey(id, req.user!.id);

      logger.info('License key deleted', {
        licenseKeyId: id,
        deletedBy: req.user!.id,
        correlationId: (req as any).correlationId,
      });

      res.json({ message: 'License key deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/licenses/validate
 * Validate a license key
 */
router.post('/validate',
  [
    body('key').isString().notEmpty(),
    body('hardwareId').optional().isString(),
    body('metadata').optional().isObject(),
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

      const validation = await keyValidatorService.validateKey(
        req.body as ValidateLicenseKeyInput
      );

      logger.info('License key validated', {
        valid: validation.isValid,
        key: req.body.key.substring(0, 8) + '...',
        correlationId: (req as any).correlationId,
      });

      res.json(validation);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/licenses/activate
 * Activate a license key
 */
router.post('/activate',
  authenticate,
  [
    body('key').isString().notEmpty(),
    body('hardwareId').isString().notEmpty(),
    body('deviceName').optional().isString(),
    body('metadata').optional().isObject(),
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

      const input: ActivateLicenseKeyInput = {
        ...req.body,
        userId: req.user!.id,
        ipAddress: req.ip,
      };

      const result = await licenseKeyService.activateLicenseKey(input);

      logger.info('License key activated', {
        licenseKeyId: result.licenseKey.id,
        activationId: result.activation.id,
        userId: req.user!.id,
        correlationId: (req as any).correlationId,
      });

      res.json({
        licenseKey: {
          id: result.licenseKey.id,
          type: result.licenseKey.type,
          status: result.licenseKey.status,
          expiresAt: result.licenseKey.expiresAt,
        },
        activation: result.activation,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/licenses/:id/deactivate
 * Deactivate a license key activation
 */
router.post('/:id/deactivate',
  authenticate,
  param('id').isUUID(),
  body('hardwareId').isString().notEmpty(),
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
      const { hardwareId } = req.body;

      // Find the activation
      const activation = await prisma.licenseActivation.findFirst({
        where: {
          licenseKeyId: id,
          hardwareId,
          userId: req.user!.id,
          status: 'ACTIVE',
        },
      });

      if (!activation) {
        throw new NotFoundError('Active activation not found');
      }

      // Deactivate
      await prisma.licenseActivation.update({
        where: { id: activation.id },
        data: {
          status: 'DEACTIVATED',
          deactivatedAt: new Date(),
        },
      });

      // Update license key activation count
      await prisma.licenseKey.update({
        where: { id },
        data: {
          currentActivations: {
            decrement: 1,
          },
        },
      });

      // Log audit event
      await auditService.log({
        userId: req.user!.id,
        action: AuditAction.LICENSE_DEACTIVATED,
        entityType: 'license_activation',
        entityId: activation.id,
        details: {
          licenseKeyId: id,
          hardwareId,
        },
        ipAddress: req.ip,
      });

      logger.info('License key deactivated', {
        licenseKeyId: id,
        activationId: activation.id,
        correlationId: (req as any).correlationId,
      });

      res.json({ message: 'License key deactivated successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/licenses/:id/transfer
 * Transfer license key ownership
 */
router.post('/:id/transfer',
  authenticate,
  param('id').isUUID(),
  body('toUserId').isUUID(),
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
      const { toUserId } = req.body;

      const input: TransferLicenseKeyInput = {
        licenseKeyId: id,
        fromUserId: req.user!.id,
        toUserId,
        transferredBy: req.user!.id,
      };

      const licenseKey = await licenseKeyService.transferLicenseKey(input);

      logger.info('License key transferred', {
        licenseKeyId: id,
        fromUserId: req.user!.id,
        toUserId,
        correlationId: (req as any).correlationId,
      });

      res.json(licenseKey);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/licenses/:id/revoke
 * Revoke a license key
 */
router.post('/:id/revoke',
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

      const licenseKey = await licenseKeyService.revokeLicenseKey(id, reason, req.user!.id);

      logger.info('License key revoked', {
        licenseKeyId: id,
        revokedBy: req.user!.id,
        reason,
        correlationId: (req as any).correlationId,
      });

      res.json(licenseKey);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/licenses/:id/reactivate
 * Reactivate a revoked license key
 */
router.post('/:id/reactivate',
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

      const licenseKey = await licenseKeyService.reactivateLicenseKey(id, req.user!.id);

      logger.info('License key reactivated', {
        licenseKeyId: id,
        reactivatedBy: req.user!.id,
        correlationId: (req as any).correlationId,
      });

      res.json(licenseKey);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/licenses/:id/activations
 * Get license key activations
 */
router.get('/:id/activations',
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

      // Check if user owns this license or is admin
      const licenseKey = await prisma.licenseKey.findUnique({
        where: { id },
        select: { ownerId: true },
      });

      if (!licenseKey) {
        throw new NotFoundError('License key not found');
      }

      const isOwner = licenseKey.ownerId === req.user!.id;
      const isAdmin = req.user!.roles.includes(UserRole.ADMIN) ||
                     req.user!.roles.includes(UserRole.SUPER_ADMIN);

      if (!isOwner && !isAdmin) {
        throw new ForbiddenError('You do not have permission to view these activations');
      }

      const activations = await prisma.licenseActivation.findMany({
        where: { licenseKeyId: id },
        orderBy: { activatedAt: 'desc' },
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

      res.json(activations);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/licenses/batch
 * Create multiple license keys (admin only)
 */
router.post('/batch',
  authenticate,
  requireAdmin,
  [
    body('count').isInt({ min: 1, max: 100 }),
    body('type').isIn(Object.values(LicenseKeyType)),
    body('name').optional().isString(),
    body('maxActivations').optional().isInt({ min: 1 }),
    body('expiresAt').optional().isISO8601(),
    body('features').optional().isObject(),
    body('restrictions').optional().isObject(),
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

      const { count, ...keyData } = req.body;
      const licenseKeys = [];

      for (let i = 0; i < count; i++) {
        const nameWithIndex = keyData.name ? `${keyData.name} #${i + 1}` : undefined;
        const licenseKey = await licenseKeyService.createLicenseKey(
          { ...keyData, name: nameWithIndex },
          req.user!.id
        );
        licenseKeys.push(licenseKey);
      }

      logger.info('Batch license keys created', {
        count,
        type: keyData.type,
        createdBy: req.user!.id,
        correlationId: (req as any).correlationId,
      });

      res.status(201).json({
        count: licenseKeys.length,
        licenseKeys,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;