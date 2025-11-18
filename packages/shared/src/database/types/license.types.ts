/**
 * License Key Type Definitions
 *
 * TypeScript types and interfaces for License Key management
 */

import {
  LicenseKey,
  LicenseKeyStatus,
  LicenseKeyType,
  Activation,
  ActivationStatus,
  KeyValidation,
  KeyTransfer,
} from '@prisma/client';

/**
 * License Key with all relations
 */
export interface LicenseKeyWithRelations extends LicenseKey {
  owner?: {
    id: string;
    username: string;
    email?: string | null;
    discordId: string;
  } | null;
  createdBy?: {
    id: string;
    username: string;
  };
  activations?: Activation[];
  validations?: KeyValidation[];
  transfers?: KeyTransfer[];
}

/**
 * License Key creation input
 */
export interface CreateLicenseKeyInput {
  type: LicenseKeyType;
  name?: string;
  description?: string;
  ownerId?: string;
  maxActivations?: number;
  allowMultipleIps?: boolean;
  validFrom?: Date;
  expiresAt?: Date;
  trialDays?: number;
  gracePeriodDays?: number;
  features?: Record<string, any>;
  metadata?: Record<string, any>;
  tags?: string[];
  productId?: string;
  planId?: string;
  customerId?: string;
  ipWhitelist?: string[];
  domainWhitelist?: string[];
  requiresHardwareId?: boolean;
}

/**
 * License Key update input
 */
export interface UpdateLicenseKeyInput {
  name?: string;
  description?: string;
  status?: LicenseKeyStatus;
  maxActivations?: number;
  expiresAt?: Date;
  features?: Record<string, any>;
  metadata?: Record<string, any>;
  tags?: string[];
  ipWhitelist?: string[];
  domainWhitelist?: string[];
}

/**
 * License Key generation options
 */
export interface GenerateLicenseKeyOptions {
  format?: 'uuid' | 'custom' | 'short';
  prefix?: string;
  suffix?: string;
  segments?: number;
  segmentLength?: number;
  separator?: string;
  uppercase?: boolean;
  excludeAmbiguous?: boolean; // Exclude O, 0, I, 1, etc.
}

/**
 * License Key activation input
 */
export interface ActivateLicenseKeyInput {
  key: string;
  userId?: string;
  hardwareId?: string;
  machineId?: string;
  hostname?: string;
  platform?: string;
  ipAddress: string;
  location?: string;
  userAgent?: string;
  appVersion?: string;
  deviceInfo?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * License Key validation input
 */
export interface ValidateLicenseKeyInput {
  key: string;
  hardwareId?: string;
  ipAddress: string;
  userAgent?: string;
  appVersion?: string;
  validationType?: 'online' | 'offline' | 'heartbeat';
}

/**
 * License Key validation result
 */
export interface LicenseKeyValidationResult {
  valid: boolean;
  licenseKey?: LicenseKeyWithRelations;
  activation?: Activation;
  reason?: string;
  code?: string;
  remainingActivations?: number;
  expiresIn?: number; // Seconds until expiration
  features?: Record<string, any>;
  metadata?: Record<string, any>;
  responseData?: Record<string, any>;
}

/**
 * License Key transfer input
 */
export interface TransferLicenseKeyInput {
  licenseKeyId: string;
  fromUserId: string;
  toUserId: string;
  reason?: string;
  notes?: string;
  metadata?: Record<string, any>;
  requireApproval?: boolean;
}

/**
 * License Key search filters
 */
export interface LicenseKeySearchFilters {
  key?: string;
  shortKey?: string;
  type?: LicenseKeyType | LicenseKeyType[];
  status?: LicenseKeyStatus | LicenseKeyStatus[];
  ownerId?: string;
  createdById?: string;
  productId?: string;
  planId?: string;
  customerId?: string;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  expiresAfter?: Date;
  expiresBefore?: Date;
  search?: string; // General search term
}

/**
 * License Key pagination options
 */
export interface LicenseKeyPaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'expiresAt' | 'name' | 'status';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated License Key response
 */
export interface PaginatedLicenseKeyResponse {
  keys: LicenseKeyWithRelations[];
  total: number;
  page: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * License Key statistics
 */
export interface LicenseKeyStatistics {
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
  revokedKeys: number;
  suspendedKeys: number;
  totalActivations: number;
  averageActivationsPerKey: number;
  keysByType: Record<LicenseKeyType, number>;
  keysByStatus: Record<LicenseKeyStatus, number>;
  recentActivations: number; // Last 24 hours
  expiringKeys: number; // Next 30 days
  revenue?: {
    total: number;
    recurring: number;
    oneTime: number;
  };
}

/**
 * Activation with relations
 */
export interface ActivationWithRelations extends Activation {
  licenseKey?: LicenseKey;
  user?: {
    id: string;
    username: string;
    email?: string | null;
  } | null;
}

/**
 * Activation search filters
 */
export interface ActivationSearchFilters {
  licenseKeyId?: string;
  userId?: string;
  status?: ActivationStatus | ActivationStatus[];
  hardwareId?: string;
  machineId?: string;
  platform?: string;
  ipAddress?: string;
  activatedAfter?: Date;
  activatedBefore?: Date;
  lastSeenAfter?: Date;
  lastSeenBefore?: Date;
}

/**
 * Hardware ID info
 */
export interface HardwareIdInfo {
  hardwareId: string;
  machineId?: string;
  hostname?: string;
  platform?: string;
  cpuInfo?: {
    manufacturer: string;
    brand: string;
    cores: number;
  };
  memoryInfo?: {
    total: number;
    available: number;
  };
  diskInfo?: Array<{
    model: string;
    size: number;
    type: string;
  }>;
  networkInterfaces?: Array<{
    name: string;
    mac: string;
    ip: string;
  }>;
}

/**
 * License Key feature flags
 */
export interface LicenseKeyFeatures {
  maxUsers?: number;
  maxProjects?: number;
  maxStorage?: number; // In GB
  apiAccess?: boolean;
  premiumSupport?: boolean;
  customBranding?: boolean;
  advancedAnalytics?: boolean;
  exportData?: boolean;
  webhooks?: boolean;
  sso?: boolean;
  customDomain?: boolean;
  [key: string]: any; // Allow custom features
}

/**
 * License Key validation helpers
 */
export const LicenseKeyValidation = {
  /**
   * Check if license key is expired
   */
  isExpired(key: LicenseKey): boolean {
    if (!key.expiresAt) return false;
    return new Date() > new Date(key.expiresAt);
  },

  /**
   * Check if license key is within grace period
   */
  isInGracePeriod(key: LicenseKey): boolean {
    if (!key.expiresAt || key.gracePeriodDays === 0) return false;
    const gracePeriodEnd = new Date(key.expiresAt);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + key.gracePeriodDays);
    return new Date() <= gracePeriodEnd;
  },

  /**
   * Check if license key can be activated
   */
  canActivate(key: LicenseKey): boolean {
    if (key.status !== LicenseKeyStatus.ACTIVE && key.status !== LicenseKeyStatus.INACTIVE) {
      return false;
    }
    if (this.isExpired(key) && !this.isInGracePeriod(key)) {
      return false;
    }
    if (key.maxActivations > 0 && key.currentActivations >= key.maxActivations) {
      return false;
    }
    if (key.validFrom && new Date() < new Date(key.validFrom)) {
      return false;
    }
    return true;
  },

  /**
   * Get days until expiration
   */
  getDaysUntilExpiration(key: LicenseKey): number | null {
    if (!key.expiresAt) return null;
    const now = new Date();
    const expires = new Date(key.expiresAt);
    const diff = expires.getTime() - now.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  },

  /**
   * Format license key for display
   */
  formatKey(key: string, options?: { segments?: number; separator?: string }): string {
    const segments = options?.segments || 4;
    const separator = options?.separator || '-';
    const segmentLength = Math.ceil(key.length / segments);
    const formatted = [];

    for (let i = 0; i < segments; i++) {
      const start = i * segmentLength;
      const end = start + segmentLength;
      formatted.push(key.substring(start, end));
    }

    return formatted.join(separator);
  },
};

/**
 * License Key status transitions
 */
export const LICENSE_KEY_STATUS_TRANSITIONS: Record<LicenseKeyStatus, LicenseKeyStatus[]> = {
  [LicenseKeyStatus.INACTIVE]: [
    LicenseKeyStatus.ACTIVE,
    LicenseKeyStatus.REVOKED,
  ],
  [LicenseKeyStatus.ACTIVE]: [
    LicenseKeyStatus.SUSPENDED,
    LicenseKeyStatus.EXPIRED,
    LicenseKeyStatus.REVOKED,
    LicenseKeyStatus.EXHAUSTED,
  ],
  [LicenseKeyStatus.SUSPENDED]: [
    LicenseKeyStatus.ACTIVE,
    LicenseKeyStatus.REVOKED,
  ],
  [LicenseKeyStatus.EXPIRED]: [
    LicenseKeyStatus.ACTIVE, // Can be renewed
    LicenseKeyStatus.REVOKED,
  ],
  [LicenseKeyStatus.EXHAUSTED]: [
    LicenseKeyStatus.ACTIVE, // If activations are increased
    LicenseKeyStatus.REVOKED,
  ],
  [LicenseKeyStatus.REVOKED]: [], // Terminal state
};

/**
 * Check if status transition is valid
 */
export function isValidStatusTransition(
  fromStatus: LicenseKeyStatus,
  toStatus: LicenseKeyStatus
): boolean {
  return LICENSE_KEY_STATUS_TRANSITIONS[fromStatus]?.includes(toStatus) || false;
}

/**
 * License Key type properties
 */
export const LICENSE_KEY_TYPE_PROPERTIES: Record<LicenseKeyType, {
  allowsExpiration: boolean;
  allowsActivationLimit: boolean;
  allowsTransfer: boolean;
  requiresHardwareBinding: boolean;
}> = {
  [LicenseKeyType.PERPETUAL]: {
    allowsExpiration: false,
    allowsActivationLimit: true,
    allowsTransfer: true,
    requiresHardwareBinding: true,
  },
  [LicenseKeyType.SUBSCRIPTION]: {
    allowsExpiration: true,
    allowsActivationLimit: true,
    allowsTransfer: true,
    requiresHardwareBinding: false,
  },
  [LicenseKeyType.TRIAL]: {
    allowsExpiration: true,
    allowsActivationLimit: true,
    allowsTransfer: false,
    requiresHardwareBinding: false,
  },
  [LicenseKeyType.VOLUME]: {
    allowsExpiration: true,
    allowsActivationLimit: true,
    allowsTransfer: false,
    requiresHardwareBinding: false,
  },
  [LicenseKeyType.FLOATING]: {
    allowsExpiration: true,
    allowsActivationLimit: true,
    allowsTransfer: false,
    requiresHardwareBinding: false,
  },
};