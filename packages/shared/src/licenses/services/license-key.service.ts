/**
 * License Key Service
 *
 * Main service for license key management
 */

import { v4 as uuidv4 } from 'uuid';
import {
  LicenseKey,
  LicenseKeyStatus,
  LicenseKeyType,
  ActivationStatus,
  AuditAction,
  KeyTransfer,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../database/client.js';
import { logger } from '../../logging/logger.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../errors/index.js';
import {
  CreateLicenseKeyInput,
  UpdateLicenseKeyInput,
  LicenseKeyWithRelations,
  LicenseKeySearchFilters,
  LicenseKeyPaginationOptions,
  PaginatedLicenseKeyResponse,
  LicenseKeyStatistics,
  ActivateLicenseKeyInput,
  TransferLicenseKeyInput,
  isValidStatusTransition,
  LICENSE_KEY_TYPE_PROPERTIES,
} from '../../database/types/license.types.js';
import { keyGeneratorService } from './key-generator.service.js';
import { keyValidatorService } from './key-validator.service.js';
import { auditService } from '../../services/audit.service.js';

export class LicenseKeyService {
  /**
   * Create a new license key
   */
  async createLicenseKey(
    input: CreateLicenseKeyInput,
    createdById: string
  ): Promise<LicenseKeyWithRelations> {
    try {
      // Validate input based on license type
      this.validateLicenseKeyInput(input);

      // Generate key
      const key = keyGeneratorService.generateKey({
        format: 'custom',
        segments: 4,
        segmentLength: 5,
        excludeAmbiguous: true,
      });

      // Generate short key
      const shortKey = keyGeneratorService.generateShortKey();

      // Calculate trial expiration if applicable
      let expiresAt = input.expiresAt;
      if (input.type === LicenseKeyType.TRIAL && input.trialDays) {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + input.trialDays);
        expiresAt = expiresAt && expiresAt < trialEnd ? expiresAt : trialEnd;
      }

      // Create license key
      const licenseKey = await prisma.licenseKey.create({
        data: {
          id: uuidv4(),
          key,
          shortKey,
          type: input.type,
          status: LicenseKeyStatus.INACTIVE,
          name: input.name,
          description: input.description,
          ownerId: input.ownerId,
          createdById,
          maxActivations: input.maxActivations || 1,
          currentActivations: 0,
          allowMultipleIps: input.allowMultipleIps || false,
          validFrom: input.validFrom,
          expiresAt,
          trialDays: input.trialDays,
          gracePeriodDays: input.gracePeriodDays || 0,
          features: input.features || {},
          metadata: input.metadata || {},
          tags: input.tags || [],
          productId: input.productId,
          planId: input.planId,
          customerId: input.customerId,
          ipWhitelist: input.ipWhitelist || [],
          domainWhitelist: input.domainWhitelist || [],
          requiresHardwareId: input.requiresHardwareId || false,
        },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              email: true,
              discordId: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      // Log audit event
      await auditService.log({
        userId: createdById,
        action: AuditAction.KEY_GENERATED,
        entityType: 'license_key',
        entityId: licenseKey.id,
        details: {
          key: keyGeneratorService.obfuscateKey(key),
          type: input.type,
          ownerId: input.ownerId,
          maxActivations: input.maxActivations,
        },
      });

      logger.info('License key created', {
        keyId: licenseKey.id,
        type: licenseKey.type,
        createdById,
      });

      return licenseKey as LicenseKeyWithRelations;
    } catch (error) {
      logger.error('Failed to create license key', error, input);
      throw error;
    }
  }

  /**
   * Update a license key
   */
  async updateLicenseKey(
    keyId: string,
    input: UpdateLicenseKeyInput,
    updatedById: string
  ): Promise<LicenseKeyWithRelations> {
    try {
      // Get current key
      const currentKey = await this.getLicenseKey(keyId);

      // Validate status transition if status is being updated
      if (input.status && input.status !== currentKey.status) {
        if (!isValidStatusTransition(currentKey.status, input.status)) {
          throw new ValidationError(
            `Invalid status transition from ${currentKey.status} to ${input.status}`,
            [{ field: 'status', message: 'Invalid status transition' }]
          );
        }
      }

      // Prepare update data
      const updateData: Prisma.LicenseKeyUpdateInput = {
        ...input,
        updatedAt: new Date(),
      };

      // Handle status-specific updates
      if (input.status === LicenseKeyStatus.REVOKED && currentKey.status !== LicenseKeyStatus.REVOKED) {
        updateData.revokedAt = new Date();
      }

      // Update license key
      const licenseKey = await prisma.licenseKey.update({
        where: { id: keyId },
        data: updateData,
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              email: true,
              discordId: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      // Log audit event
      await auditService.log({
        userId: updatedById,
        action: AuditAction.USER_UPDATED,
        entityType: 'license_key',
        entityId: keyId,
        details: {
          updates: Object.keys(input),
        },
        oldValues: currentKey,
        newValues: licenseKey,
      });

      logger.info('License key updated', {
        keyId,
        updates: Object.keys(input),
        updatedById,
      });

      return licenseKey as LicenseKeyWithRelations;
    } catch (error) {
      logger.error('Failed to update license key', error, { keyId, input });
      throw error;
    }
  }

  /**
   * Get a license key by ID or key
   */
  async getLicenseKey(identifier: string): Promise<LicenseKeyWithRelations> {
    const licenseKey = await prisma.licenseKey.findFirst({
      where: {
        OR: [
          { id: identifier },
          { key: identifier },
          { shortKey: identifier },
        ],
      },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            email: true,
            discordId: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
          },
        },
        activations: {
          where: {
            status: ActivationStatus.ACTIVE,
          },
        },
        _count: {
          select: {
            activations: true,
            validations: true,
            transfers: true,
          },
        },
      },
    });

    if (!licenseKey) {
      throw new NotFoundError('License key not found');
    }

    return licenseKey as LicenseKeyWithRelations;
  }

  /**
   * Search license keys
   */
  async searchLicenseKeys(
    filters: LicenseKeySearchFilters,
    options: LicenseKeyPaginationOptions = {}
  ): Promise<PaginatedLicenseKeyResponse> {
    const {
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = options;

    // Build where clause
    const where: Prisma.LicenseKeyWhereInput = {};

    if (filters.key) where.key = { contains: filters.key };
    if (filters.shortKey) where.shortKey = filters.shortKey;
    if (filters.type) {
      where.type = Array.isArray(filters.type)
        ? { in: filters.type }
        : filters.type;
    }
    if (filters.status) {
      where.status = Array.isArray(filters.status)
        ? { in: filters.status }
        : filters.status;
    }
    if (filters.ownerId) where.ownerId = filters.ownerId;
    if (filters.createdById) where.createdById = filters.createdById;
    if (filters.productId) where.productId = filters.productId;
    if (filters.planId) where.planId = filters.planId;
    if (filters.customerId) where.customerId = filters.customerId;

    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    if (filters.createdAfter || filters.createdBefore) {
      where.createdAt = {};
      if (filters.createdAfter) where.createdAt.gte = filters.createdAfter;
      if (filters.createdBefore) where.createdAt.lte = filters.createdBefore;
    }

    if (filters.expiresAfter || filters.expiresBefore) {
      where.expiresAt = {};
      if (filters.expiresAfter) where.expiresAt.gte = filters.expiresAfter;
      if (filters.expiresBefore) where.expiresAt.lte = filters.expiresBefore;
    }

    if (filters.search) {
      where.OR = [
        { key: { contains: filters.search } },
        { shortKey: { contains: filters.search } },
        { name: { contains: filters.search } },
        { description: { contains: filters.search } },
      ];
    }

    // Get total count
    const total = await prisma.licenseKey.count({ where });

    // Get paginated results
    const keys = await prisma.licenseKey.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            email: true,
            discordId: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
          },
        },
        _count: {
          select: {
            activations: true,
            validations: true,
          },
        },
      },
    });

    const pages = Math.ceil(total / limit);

    return {
      keys: keys as LicenseKeyWithRelations[],
      total,
      page,
      pages,
      hasNext: page < pages,
      hasPrev: page > 1,
    };
  }

  /**
   * Activate a license key
   */
  async activateLicenseKey(
    input: ActivateLicenseKeyInput
  ): Promise<{
    licenseKey: LicenseKeyWithRelations;
    activation: any;
  }> {
    try {
      // Validate the license key first
      const validationResult = await keyValidatorService.validateKey({
        key: input.key,
        hardwareId: input.hardwareId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        appVersion: input.appVersion,
      });

      if (!validationResult.valid) {
        throw new ValidationError(
          validationResult.reason || 'Invalid license key',
          [{ field: 'key', message: validationResult.code || 'INVALID_KEY' }]
        );
      }

      const licenseKey = validationResult.licenseKey!;

      // Check if already activated for this hardware
      if (input.hardwareId) {
        const existingActivation = await prisma.activation.findUnique({
          where: {
            licenseKeyId_hardwareId: {
              licenseKeyId: licenseKey.id,
              hardwareId: input.hardwareId,
            },
          },
        });

        if (existingActivation && existingActivation.status === ActivationStatus.ACTIVE) {
          return {
            licenseKey: licenseKey as LicenseKeyWithRelations,
            activation: existingActivation,
          };
        }
      }

      // Check activation limit
      if (licenseKey.currentActivations >= licenseKey.maxActivations) {
        throw new ValidationError('Maximum activations reached', [
          { field: 'key', message: 'MAX_ACTIVATIONS_REACHED' }
        ]);
      }

      // Create activation
      const activation = await prisma.activation.create({
        data: {
          id: uuidv4(),
          licenseKeyId: licenseKey.id,
          userId: input.userId,
          status: ActivationStatus.ACTIVE,
          hardwareId: input.hardwareId,
          machineId: input.machineId,
          hostname: input.hostname,
          platform: input.platform,
          ipAddress: input.ipAddress,
          location: input.location,
          userAgent: input.userAgent,
          appVersion: input.appVersion,
          deviceInfo: input.deviceInfo || {},
          metadata: input.metadata || {},
          activatedAt: new Date(),
          lastSeenAt: new Date(),
          expiresAt: licenseKey.expiresAt,
        },
      });

      // Update license key
      await prisma.licenseKey.update({
        where: { id: licenseKey.id },
        data: {
          status: LicenseKeyStatus.ACTIVE,
          currentActivations: { increment: 1 },
          firstActivatedAt: licenseKey.firstActivatedAt || new Date(),
        },
      });

      // Log audit event
      await auditService.log({
        userId: input.userId,
        action: AuditAction.KEY_ACTIVATED,
        entityType: 'license_key',
        entityId: licenseKey.id,
        details: {
          activationId: activation.id,
          hardwareId: input.hardwareId,
          ipAddress: input.ipAddress,
        },
        ipAddress: input.ipAddress,
      });

      logger.info('License key activated', {
        keyId: licenseKey.id,
        activationId: activation.id,
        userId: input.userId,
      });

      // Refetch with relations
      const updatedKey = await this.getLicenseKey(licenseKey.id);

      return {
        licenseKey: updatedKey,
        activation,
      };
    } catch (error) {
      logger.error('Failed to activate license key', error, input);
      throw error;
    }
  }

  /**
   * Deactivate an activation
   */
  async deactivateActivation(
    activationId: string,
    reason?: string
  ): Promise<void> {
    try {
      const activation = await prisma.activation.findUnique({
        where: { id: activationId },
      });

      if (!activation) {
        throw new NotFoundError('Activation not found');
      }

      // Update activation
      await prisma.activation.update({
        where: { id: activationId },
        data: {
          status: ActivationStatus.DEACTIVATED,
          deactivatedAt: new Date(),
        },
      });

      // Decrement activation count
      await prisma.licenseKey.update({
        where: { id: activation.licenseKeyId },
        data: {
          currentActivations: { decrement: 1 },
        },
      });

      logger.info('Activation deactivated', {
        activationId,
        reason,
      });
    } catch (error) {
      logger.error('Failed to deactivate activation', error, { activationId });
      throw error;
    }
  }

  /**
   * Transfer license key to another user
   */
  async transferLicenseKey(
    input: TransferLicenseKeyInput,
    transferredById: string
  ): Promise<KeyTransfer> {
    try {
      const licenseKey = await this.getLicenseKey(input.licenseKeyId);

      // Check if transfer is allowed
      const typeProps = LICENSE_KEY_TYPE_PROPERTIES[licenseKey.type];
      if (!typeProps.allowsTransfer) {
        throw new ValidationError('License type does not allow transfers', [
          { field: 'type', message: 'TRANSFER_NOT_ALLOWED' }
        ]);
      }

      // Create transfer record
      const transfer = await prisma.keyTransfer.create({
        data: {
          id: uuidv4(),
          licenseKeyId: input.licenseKeyId,
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          transferredById,
          reason: input.reason,
          notes: input.notes,
          metadata: input.metadata || {},
          ipAddress: '0.0.0.0', // Should be passed from request
          approved: !input.requireApproval,
          transferredAt: new Date(),
        },
      });

      // Update license key owner if approved
      if (!input.requireApproval) {
        await prisma.licenseKey.update({
          where: { id: input.licenseKeyId },
          data: { ownerId: input.toUserId },
        });
      }

      // Log audit event
      await auditService.log({
        userId: transferredById,
        action: AuditAction.KEY_TRANSFERRED,
        entityType: 'license_key',
        entityId: input.licenseKeyId,
        details: {
          transferId: transfer.id,
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          reason: input.reason,
        },
      });

      logger.info('License key transferred', {
        keyId: input.licenseKeyId,
        transferId: transfer.id,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
      });

      return transfer;
    } catch (error) {
      logger.error('Failed to transfer license key', error, input);
      throw error;
    }
  }

  /**
   * Get license key statistics
   */
  async getStatistics(): Promise<LicenseKeyStatistics> {
    const [
      totalKeys,
      activeKeys,
      expiredKeys,
      revokedKeys,
      suspendedKeys,
      totalActivations,
      keysByType,
      keysByStatus,
    ] = await Promise.all([
      prisma.licenseKey.count(),
      prisma.licenseKey.count({ where: { status: LicenseKeyStatus.ACTIVE } }),
      prisma.licenseKey.count({ where: { status: LicenseKeyStatus.EXPIRED } }),
      prisma.licenseKey.count({ where: { status: LicenseKeyStatus.REVOKED } }),
      prisma.licenseKey.count({ where: { status: LicenseKeyStatus.SUSPENDED } }),
      prisma.activation.count({ where: { status: ActivationStatus.ACTIVE } }),
      prisma.licenseKey.groupBy({
        by: ['type'],
        _count: true,
      }),
      prisma.licenseKey.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]);

    // Recent activations (last 24 hours)
    const recentActivations = await prisma.activation.count({
      where: {
        activatedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    // Expiring keys (next 30 days)
    const expiringKeys = await prisma.licenseKey.count({
      where: {
        status: { not: LicenseKeyStatus.REVOKED },
        expiresAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    });

    // Convert group by results to record
    const typeRecord = keysByType.reduce((acc, item) => {
      acc[item.type] = item._count;
      return acc;
    }, {} as Record<LicenseKeyType, number>);

    const statusRecord = keysByStatus.reduce((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<LicenseKeyStatus, number>);

    const averageActivationsPerKey = totalKeys > 0
      ? Math.round(totalActivations / totalKeys * 100) / 100
      : 0;

    return {
      totalKeys,
      activeKeys,
      expiredKeys,
      revokedKeys,
      suspendedKeys,
      totalActivations,
      averageActivationsPerKey,
      keysByType: typeRecord,
      keysByStatus: statusRecord,
      recentActivations,
      expiringKeys,
    };
  }

  /**
   * Validate license key input
   */
  private validateLicenseKeyInput(input: CreateLicenseKeyInput): void {
    const typeProps = LICENSE_KEY_TYPE_PROPERTIES[input.type];

    // Validate expiration
    if (!typeProps.allowsExpiration && input.expiresAt) {
      throw new ValidationError('License type does not allow expiration', [
        { field: 'expiresAt', message: 'Expiration not allowed for this type' }
      ]);
    }

    // Validate trial period
    if (input.type !== LicenseKeyType.TRIAL && input.trialDays) {
      throw new ValidationError('Trial days only allowed for trial licenses', [
        { field: 'trialDays', message: 'Invalid for non-trial license' }
      ]);
    }

    // Validate activation limit
    if (input.maxActivations && input.maxActivations < 1) {
      throw new ValidationError('Max activations must be at least 1', [
        { field: 'maxActivations', message: 'Invalid activation limit' }
      ]);
    }
  }
}

// Export singleton instance
export const licenseKeyService = new LicenseKeyService();