/**
 * License Key Validation Service
 *
 * Handles validation of license keys
 */

import { v4 as uuidv4 } from 'uuid';
import { LicenseKeyStatus, ActivationStatus } from '@prisma/client';
import { prisma } from '../../database/client.js';
import { logger } from '../../logging/logger.js';
import { ValidationError } from '../../errors/index.js';
import {
  ValidateLicenseKeyInput,
  LicenseKeyValidationResult,
  LicenseKeyWithRelations,
  LicenseKeyValidation,
} from '../../database/types/license.types.js';
import { auditService } from '../../services/audit.service.js';
import { AuditAction } from '@prisma/client';

export class KeyValidatorService {
  /**
   * Validate a license key
   */
  async validateKey(
    input: ValidateLicenseKeyInput
  ): Promise<LicenseKeyValidationResult> {
    try {
      // Find the license key
      const licenseKey = await prisma.licenseKey.findUnique({
        where: { key: input.key },
        include: {
          owner: {
            select: {
              id: true,
              username: true,
              email: true,
              discordId: true,
            },
          },
          activations: {
            where: {
              status: ActivationStatus.ACTIVE,
            },
          },
        },
      }) as LicenseKeyWithRelations;

      if (!licenseKey) {
        await this.logValidation(input, false, 'Key not found');
        return {
          valid: false,
          reason: 'Invalid license key',
          code: 'INVALID_KEY',
        };
      }

      // Check key status
      const statusCheck = this.checkKeyStatus(licenseKey);
      if (!statusCheck.valid) {
        await this.logValidation(input, false, statusCheck.reason!, licenseKey.id);
        return statusCheck;
      }

      // Check expiration
      const expirationCheck = this.checkExpiration(licenseKey);
      if (!expirationCheck.valid) {
        await this.logValidation(input, false, expirationCheck.reason!, licenseKey.id);
        return expirationCheck;
      }

      // Check validity period
      const validityCheck = this.checkValidityPeriod(licenseKey);
      if (!validityCheck.valid) {
        await this.logValidation(input, false, validityCheck.reason!, licenseKey.id);
        return validityCheck;
      }

      // Check IP whitelist
      if (licenseKey.ipWhitelist && licenseKey.ipWhitelist.length > 0) {
        const ipCheck = this.checkIpWhitelist(licenseKey, input.ipAddress);
        if (!ipCheck.valid) {
          await this.logValidation(input, false, ipCheck.reason!, licenseKey.id);
          return ipCheck;
        }
      }

      // Check hardware ID if required
      if (licenseKey.requiresHardwareId || input.hardwareId) {
        const hardwareCheck = await this.checkHardwareId(licenseKey, input.hardwareId);
        if (!hardwareCheck.valid) {
          await this.logValidation(input, false, hardwareCheck.reason!, licenseKey.id);
          return hardwareCheck;
        }
      }

      // Find active activation for this hardware ID (if provided)
      let activation = null;
      if (input.hardwareId) {
        activation = licenseKey.activations?.find(
          a => a.hardwareId === input.hardwareId && a.status === ActivationStatus.ACTIVE
        );
      }

      // Update last validated timestamp
      await prisma.licenseKey.update({
        where: { id: licenseKey.id },
        data: { lastValidatedAt: new Date() },
      });

      // Update activation last seen
      if (activation) {
        await prisma.activation.update({
          where: { id: activation.id },
          data: { lastSeenAt: new Date() },
        });
      }

      // Calculate remaining activations
      const remainingActivations = licenseKey.maxActivations - licenseKey.currentActivations;

      // Calculate expiration time
      const expiresIn = licenseKey.expiresAt
        ? Math.floor((new Date(licenseKey.expiresAt).getTime() - Date.now()) / 1000)
        : null;

      // Log successful validation
      await this.logValidation(input, true, 'Valid', licenseKey.id, activation?.id);

      return {
        valid: true,
        licenseKey,
        activation: activation || undefined,
        remainingActivations: remainingActivations > 0 ? remainingActivations : 0,
        expiresIn: expiresIn || undefined,
        features: licenseKey.features as Record<string, any> || {},
        metadata: licenseKey.metadata as Record<string, any> || {},
      };
    } catch (error) {
      logger.error('License key validation error', error, input);
      return {
        valid: false,
        reason: 'Validation error',
        code: 'VALIDATION_ERROR',
      };
    }
  }

  /**
   * Check key status
   */
  private checkKeyStatus(licenseKey: LicenseKeyWithRelations): LicenseKeyValidationResult {
    switch (licenseKey.status) {
      case LicenseKeyStatus.ACTIVE:
        return { valid: true };

      case LicenseKeyStatus.INACTIVE:
        return {
          valid: false,
          reason: 'License key is not activated',
          code: 'KEY_INACTIVE',
        };

      case LicenseKeyStatus.SUSPENDED:
        return {
          valid: false,
          reason: 'License key is suspended',
          code: 'KEY_SUSPENDED',
        };

      case LicenseKeyStatus.REVOKED:
        return {
          valid: false,
          reason: 'License key has been revoked',
          code: 'KEY_REVOKED',
        };

      case LicenseKeyStatus.EXPIRED:
        // Check if within grace period
        if (LicenseKeyValidation.isInGracePeriod(licenseKey)) {
          return {
            valid: true,
            responseData: { inGracePeriod: true }
          };
        }
        return {
          valid: false,
          reason: 'License key has expired',
          code: 'KEY_EXPIRED',
        };

      case LicenseKeyStatus.EXHAUSTED:
        return {
          valid: false,
          reason: 'All activations have been used',
          code: 'KEY_EXHAUSTED',
        };

      default:
        return {
          valid: false,
          reason: 'Invalid key status',
          code: 'INVALID_STATUS',
        };
    }
  }

  /**
   * Check expiration
   */
  private checkExpiration(licenseKey: LicenseKeyWithRelations): LicenseKeyValidationResult {
    if (!licenseKey.expiresAt) {
      return { valid: true };
    }

    const now = new Date();
    const expiresAt = new Date(licenseKey.expiresAt);

    if (now > expiresAt) {
      // Check grace period
      if (licenseKey.gracePeriodDays > 0) {
        const gracePeriodEnd = new Date(expiresAt);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + licenseKey.gracePeriodDays);

        if (now <= gracePeriodEnd) {
          const daysRemaining = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return {
            valid: true,
            responseData: {
              inGracePeriod: true,
              gracePeriodDaysRemaining: daysRemaining,
            },
          };
        }
      }

      return {
        valid: false,
        reason: 'License key has expired',
        code: 'KEY_EXPIRED',
      };
    }

    return { valid: true };
  }

  /**
   * Check validity period
   */
  private checkValidityPeriod(licenseKey: LicenseKeyWithRelations): LicenseKeyValidationResult {
    if (!licenseKey.validFrom) {
      return { valid: true };
    }

    const now = new Date();
    const validFrom = new Date(licenseKey.validFrom);

    if (now < validFrom) {
      return {
        valid: false,
        reason: 'License key is not yet valid',
        code: 'KEY_NOT_YET_VALID',
      };
    }

    return { valid: true };
  }

  /**
   * Check IP whitelist
   */
  private checkIpWhitelist(
    licenseKey: LicenseKeyWithRelations,
    ipAddress: string
  ): LicenseKeyValidationResult {
    if (!licenseKey.ipWhitelist || licenseKey.ipWhitelist.length === 0) {
      return { valid: true };
    }

    // Check if IP is in whitelist (simple string match for now)
    // In production, use proper IP range checking
    const isWhitelisted = licenseKey.ipWhitelist.some(allowedIp => {
      if (allowedIp.includes('*')) {
        // Simple wildcard matching
        const pattern = allowedIp.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(ipAddress);
      }
      return allowedIp === ipAddress;
    });

    if (!isWhitelisted) {
      return {
        valid: false,
        reason: 'IP address not whitelisted',
        code: 'IP_NOT_WHITELISTED',
      };
    }

    return { valid: true };
  }

  /**
   * Check hardware ID
   */
  private async checkHardwareId(
    licenseKey: LicenseKeyWithRelations,
    hardwareId?: string
  ): Promise<LicenseKeyValidationResult> {
    if (!licenseKey.requiresHardwareId) {
      return { valid: true };
    }

    if (!hardwareId) {
      return {
        valid: false,
        reason: 'Hardware ID required',
        code: 'HARDWARE_ID_REQUIRED',
      };
    }

    // Check if hardware ID is associated with this license
    const activation = licenseKey.activations?.find(
      a => a.hardwareId === hardwareId
    );

    if (!activation) {
      // Check if we can create a new activation
      if (licenseKey.currentActivations >= licenseKey.maxActivations) {
        return {
          valid: false,
          reason: 'Maximum activations reached',
          code: 'MAX_ACTIVATIONS_REACHED',
        };
      }

      // Hardware ID not registered but can be activated
      return {
        valid: true,
        responseData: {
          requiresActivation: true,
          remainingActivations: licenseKey.maxActivations - licenseKey.currentActivations,
        },
      };
    }

    // Check activation status
    if (activation.status !== ActivationStatus.ACTIVE) {
      return {
        valid: false,
        reason: `Activation ${activation.status.toLowerCase()}`,
        code: `ACTIVATION_${activation.status}`,
      };
    }

    return { valid: true };
  }

  /**
   * Log validation attempt
   */
  private async logValidation(
    input: ValidateLicenseKeyInput,
    isValid: boolean,
    reason: string,
    licenseKeyId?: string,
    activationId?: string
  ): Promise<void> {
    try {
      if (licenseKeyId) {
        await prisma.keyValidation.create({
          data: {
            id: uuidv4(),
            licenseKeyId,
            activationId,
            isValid,
            reason: isValid ? undefined : reason,
            validationType: input.validationType || 'online',
            hardwareId: input.hardwareId,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            appVersion: input.appVersion,
            validatedAt: new Date(),
          },
        });

        // Log audit event for failed validations
        if (!isValid) {
          await auditService.log({
            action: AuditAction.KEY_VALIDATED,
            entityType: 'license_key',
            entityId: licenseKeyId,
            details: {
              valid: false,
              reason,
              hardwareId: input.hardwareId,
              ipAddress: input.ipAddress,
            },
            ipAddress: input.ipAddress,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to log validation', error);
    }
  }

  /**
   * Batch validate multiple keys
   */
  async validateBatch(
    keys: string[],
    commonInput: Omit<ValidateLicenseKeyInput, 'key'>
  ): Promise<Map<string, LicenseKeyValidationResult>> {
    const results = new Map<string, LicenseKeyValidationResult>();

    await Promise.all(
      keys.map(async (key) => {
        const result = await this.validateKey({
          ...commonInput,
          key,
        });
        results.set(key, result);
      })
    );

    return results;
  }

  /**
   * Validate offline activation code
   */
  async validateOfflineCode(
    key: string,
    hardwareId: string,
    offlineCode: string
  ): Promise<boolean> {
    // This would typically use a cryptographic algorithm
    // to verify the offline code without network access
    // For demo purposes, using a simple hash

    const expectedCode = this.generateOfflineValidationCode(key, hardwareId);
    return expectedCode === offlineCode;
  }

  /**
   * Generate offline validation code
   */
  private generateOfflineValidationCode(key: string, hardwareId: string): string {
    // In production, use a secure algorithm with a private key
    const combined = `${key}:${hardwareId}:${process.env.OFFLINE_SECRET || 'secret'}`;
    let hash = 0;

    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return Math.abs(hash).toString(36).toUpperCase().padStart(12, '0');
  }

  /**
   * Check if key needs renewal
   */
  async checkRenewalStatus(key: string): Promise<{
    needsRenewal: boolean;
    daysUntilExpiration?: number;
    isInGracePeriod?: boolean;
    canRenew?: boolean;
  }> {
    const licenseKey = await prisma.licenseKey.findUnique({
      where: { key },
    });

    if (!licenseKey) {
      return { needsRenewal: false, canRenew: false };
    }

    const daysUntilExpiration = LicenseKeyValidation.getDaysUntilExpiration(licenseKey);

    if (daysUntilExpiration === null) {
      // Perpetual license
      return { needsRenewal: false };
    }

    const needsRenewal = daysUntilExpiration <= 30; // Renewal notice 30 days before
    const isInGracePeriod = LicenseKeyValidation.isInGracePeriod(licenseKey);
    const canRenew = licenseKey.type === 'SUBSCRIPTION';

    return {
      needsRenewal,
      daysUntilExpiration,
      isInGracePeriod,
      canRenew,
    };
  }

  /**
   * Get validation statistics
   */
  async getValidationStats(licenseKeyId: string, days = 30): Promise<{
    totalValidations: number;
    successfulValidations: number;
    failedValidations: number;
    uniqueHardwareIds: number;
    uniqueIPs: number;
    validationsByType: Record<string, number>;
    failureReasons: Record<string, number>;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const validations = await prisma.keyValidation.findMany({
      where: {
        licenseKeyId,
        validatedAt: { gte: since },
      },
    });

    const stats = {
      totalValidations: validations.length,
      successfulValidations: validations.filter(v => v.isValid).length,
      failedValidations: validations.filter(v => !v.isValid).length,
      uniqueHardwareIds: new Set(validations.map(v => v.hardwareId).filter(Boolean)).size,
      uniqueIPs: new Set(validations.map(v => v.ipAddress)).size,
      validationsByType: {} as Record<string, number>,
      failureReasons: {} as Record<string, number>,
    };

    // Count by type
    validations.forEach(v => {
      stats.validationsByType[v.validationType] =
        (stats.validationsByType[v.validationType] || 0) + 1;

      if (!v.isValid && v.reason) {
        stats.failureReasons[v.reason] =
          (stats.failureReasons[v.reason] || 0) + 1;
      }
    });

    return stats;
  }
}

// Export singleton instance
export const keyValidatorService = new KeyValidatorService();