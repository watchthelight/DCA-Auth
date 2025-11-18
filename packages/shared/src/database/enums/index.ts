/**
 * Database Enums
 *
 * Re-export of Prisma enums with additional utilities and constants
 */

export {
  UserRole,
  UserStatus,
  SessionStatus,
  AuditAction,
  SecurityEventType,
  SecuritySeverity,
} from '@prisma/client';

import {
  UserRole,
  UserStatus,
  SessionStatus,
  AuditAction,
  SecurityEventType,
  SecuritySeverity,
} from '@prisma/client';

/**
 * User role display names
 */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.USER]: 'User',
  [UserRole.PREMIUM]: 'Premium User',
  [UserRole.MODERATOR]: 'Moderator',
  [UserRole.ADMIN]: 'Administrator',
  [UserRole.SUPER_ADMIN]: 'Super Administrator',
};

/**
 * User role descriptions
 */
export const USER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  [UserRole.USER]: 'Basic user with standard permissions',
  [UserRole.PREMIUM]: 'Premium user with enhanced features and priority support',
  [UserRole.MODERATOR]: 'Community moderator with user management capabilities',
  [UserRole.ADMIN]: 'System administrator with full management access',
  [UserRole.SUPER_ADMIN]: 'Super administrator with unrestricted system access',
};

/**
 * User role colors (for UI)
 */
export const USER_ROLE_COLORS: Record<UserRole, string> = {
  [UserRole.USER]: '#6B7280',        // Gray
  [UserRole.PREMIUM]: '#10B981',     // Green
  [UserRole.MODERATOR]: '#3B82F6',   // Blue
  [UserRole.ADMIN]: '#F59E0B',       // Amber
  [UserRole.SUPER_ADMIN]: '#EF4444', // Red
};

/**
 * User status display names
 */
export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: 'Active',
  [UserStatus.INACTIVE]: 'Inactive',
  [UserStatus.SUSPENDED]: 'Suspended',
  [UserStatus.BANNED]: 'Banned',
};

/**
 * User status colors (for UI)
 */
export const USER_STATUS_COLORS: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: '#10B981',    // Green
  [UserStatus.INACTIVE]: '#6B7280',  // Gray
  [UserStatus.SUSPENDED]: '#F59E0B', // Amber
  [UserStatus.BANNED]: '#EF4444',    // Red
};

/**
 * Session status display names
 */
export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  [SessionStatus.ACTIVE]: 'Active',
  [SessionStatus.EXPIRED]: 'Expired',
  [SessionStatus.REVOKED]: 'Revoked',
};

/**
 * Session status colors (for UI)
 */
export const SESSION_STATUS_COLORS: Record<SessionStatus, string> = {
  [SessionStatus.ACTIVE]: '#10B981',  // Green
  [SessionStatus.EXPIRED]: '#6B7280', // Gray
  [SessionStatus.REVOKED]: '#EF4444', // Red
};

/**
 * Audit action display names
 */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  // Authentication
  [AuditAction.LOGIN_SUCCESS]: 'Successful Login',
  [AuditAction.LOGIN_FAILED]: 'Failed Login',
  [AuditAction.LOGOUT]: 'Logout',
  [AuditAction.SESSION_CREATED]: 'Session Created',
  [AuditAction.SESSION_REFRESHED]: 'Session Refreshed',
  [AuditAction.SESSION_REVOKED]: 'Session Revoked',
  [AuditAction.PASSWORD_RESET_REQUESTED]: 'Password Reset Requested',
  [AuditAction.PASSWORD_CHANGED]: 'Password Changed',
  [AuditAction.EMAIL_VERIFIED]: 'Email Verified',

  // User Management
  [AuditAction.USER_CREATED]: 'User Created',
  [AuditAction.USER_UPDATED]: 'User Updated',
  [AuditAction.USER_DELETED]: 'User Deleted',
  [AuditAction.USER_SUSPENDED]: 'User Suspended',
  [AuditAction.USER_REACTIVATED]: 'User Reactivated',
  [AuditAction.USER_BANNED]: 'User Banned',
  [AuditAction.PROFILE_UPDATED]: 'Profile Updated',

  // Role Management
  [AuditAction.ROLE_ASSIGNED]: 'Role Assigned',
  [AuditAction.ROLE_REMOVED]: 'Role Removed',
  [AuditAction.PERMISSIONS_CHANGED]: 'Permissions Changed',

  // License Keys
  [AuditAction.KEY_GENERATED]: 'Key Generated',
  [AuditAction.KEY_ACTIVATED]: 'Key Activated',
  [AuditAction.KEY_VALIDATED]: 'Key Validated',
  [AuditAction.KEY_REVOKED]: 'Key Revoked',
  [AuditAction.KEY_EXPIRED]: 'Key Expired',
  [AuditAction.KEY_TRANSFERRED]: 'Key Transferred',

  // Admin Actions
  [AuditAction.ADMIN_ACCESS]: 'Admin Access',
  [AuditAction.SETTINGS_CHANGED]: 'Settings Changed',
  [AuditAction.DATA_EXPORTED]: 'Data Exported',
  [AuditAction.DATA_IMPORTED]: 'Data Imported',
  [AuditAction.SYSTEM_CONFIG_CHANGED]: 'System Config Changed',
};

/**
 * Security event type display names
 */
export const SECURITY_EVENT_TYPE_LABELS: Record<SecurityEventType, string> = {
  [SecurityEventType.SUSPICIOUS_LOGIN]: 'Suspicious Login',
  [SecurityEventType.MULTIPLE_FAILED_ATTEMPTS]: 'Multiple Failed Attempts',
  [SecurityEventType.SESSION_HIJACK_ATTEMPT]: 'Session Hijack Attempt',
  [SecurityEventType.RATE_LIMIT_EXCEEDED]: 'Rate Limit Exceeded',
  [SecurityEventType.INVALID_TOKEN]: 'Invalid Token',
  [SecurityEventType.UNAUTHORIZED_ACCESS]: 'Unauthorized Access',
  [SecurityEventType.BRUTE_FORCE_ATTEMPT]: 'Brute Force Attempt',
  [SecurityEventType.ACCOUNT_TAKEOVER_ATTEMPT]: 'Account Takeover Attempt',
};

/**
 * Security severity display names
 */
export const SECURITY_SEVERITY_LABELS: Record<SecuritySeverity, string> = {
  [SecuritySeverity.LOW]: 'Low',
  [SecuritySeverity.MEDIUM]: 'Medium',
  [SecuritySeverity.HIGH]: 'High',
  [SecuritySeverity.CRITICAL]: 'Critical',
};

/**
 * Security severity colors (for UI)
 */
export const SECURITY_SEVERITY_COLORS: Record<SecuritySeverity, string> = {
  [SecuritySeverity.LOW]: '#10B981',     // Green
  [SecuritySeverity.MEDIUM]: '#F59E0B',   // Amber
  [SecuritySeverity.HIGH]: '#F97316',     // Orange
  [SecuritySeverity.CRITICAL]: '#EF4444', // Red
};

/**
 * Audit action categories
 */
export enum AuditCategory {
  AUTHENTICATION = 'authentication',
  USER_MANAGEMENT = 'user_management',
  ROLE_MANAGEMENT = 'role_management',
  LICENSE_MANAGEMENT = 'license_management',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

/**
 * Map audit actions to categories
 */
export const AUDIT_ACTION_CATEGORIES: Record<AuditAction, AuditCategory> = {
  // Authentication
  [AuditAction.LOGIN_SUCCESS]: AuditCategory.AUTHENTICATION,
  [AuditAction.LOGIN_FAILED]: AuditCategory.AUTHENTICATION,
  [AuditAction.LOGOUT]: AuditCategory.AUTHENTICATION,
  [AuditAction.SESSION_CREATED]: AuditCategory.AUTHENTICATION,
  [AuditAction.SESSION_REFRESHED]: AuditCategory.AUTHENTICATION,
  [AuditAction.SESSION_REVOKED]: AuditCategory.AUTHENTICATION,
  [AuditAction.PASSWORD_RESET_REQUESTED]: AuditCategory.AUTHENTICATION,
  [AuditAction.PASSWORD_CHANGED]: AuditCategory.AUTHENTICATION,
  [AuditAction.EMAIL_VERIFIED]: AuditCategory.AUTHENTICATION,

  // User Management
  [AuditAction.USER_CREATED]: AuditCategory.USER_MANAGEMENT,
  [AuditAction.USER_UPDATED]: AuditCategory.USER_MANAGEMENT,
  [AuditAction.USER_DELETED]: AuditCategory.USER_MANAGEMENT,
  [AuditAction.USER_SUSPENDED]: AuditCategory.USER_MANAGEMENT,
  [AuditAction.USER_REACTIVATED]: AuditCategory.USER_MANAGEMENT,
  [AuditAction.USER_BANNED]: AuditCategory.USER_MANAGEMENT,
  [AuditAction.PROFILE_UPDATED]: AuditCategory.USER_MANAGEMENT,

  // Role Management
  [AuditAction.ROLE_ASSIGNED]: AuditCategory.ROLE_MANAGEMENT,
  [AuditAction.ROLE_REMOVED]: AuditCategory.ROLE_MANAGEMENT,
  [AuditAction.PERMISSIONS_CHANGED]: AuditCategory.ROLE_MANAGEMENT,

  // License Keys
  [AuditAction.KEY_GENERATED]: AuditCategory.LICENSE_MANAGEMENT,
  [AuditAction.KEY_ACTIVATED]: AuditCategory.LICENSE_MANAGEMENT,
  [AuditAction.KEY_VALIDATED]: AuditCategory.LICENSE_MANAGEMENT,
  [AuditAction.KEY_REVOKED]: AuditCategory.LICENSE_MANAGEMENT,
  [AuditAction.KEY_EXPIRED]: AuditCategory.LICENSE_MANAGEMENT,
  [AuditAction.KEY_TRANSFERRED]: AuditCategory.LICENSE_MANAGEMENT,

  // Admin Actions
  [AuditAction.ADMIN_ACCESS]: AuditCategory.ADMIN,
  [AuditAction.SETTINGS_CHANGED]: AuditCategory.ADMIN,
  [AuditAction.DATA_EXPORTED]: AuditCategory.ADMIN,
  [AuditAction.DATA_IMPORTED]: AuditCategory.ADMIN,
  [AuditAction.SYSTEM_CONFIG_CHANGED]: AuditCategory.SYSTEM,
};

/**
 * Device type labels
 */
export const DEVICE_TYPE_LABELS: Record<string, string> = {
  mobile: 'Mobile',
  desktop: 'Desktop',
  tablet: 'Tablet',
  tv: 'TV',
  unknown: 'Unknown',
};

/**
 * Authentication method labels
 */
export const AUTH_METHOD_LABELS: Record<string, string> = {
  password: 'Password',
  oauth: 'OAuth',
  token: 'Token',
  magic_link: 'Magic Link',
  '2fa': 'Two-Factor',
};

/**
 * Provider labels
 */
export const PROVIDER_LABELS: Record<string, string> = {
  discord: 'Discord',
  google: 'Google',
  github: 'GitHub',
  local: 'Local',
};

/**
 * Helper function to get all values of an enum
 */
export function getEnumValues<T extends object>(enumObj: T): Array<T[keyof T]> {
  return Object.values(enumObj) as Array<T[keyof T]>;
}

/**
 * Helper function to check if a value is valid enum value
 */
export function isValidEnumValue<T extends object>(
  enumObj: T,
  value: unknown
): value is T[keyof T] {
  return Object.values(enumObj).includes(value);
}

/**
 * Helper function to get enum key by value
 */
export function getEnumKey<T extends object>(
  enumObj: T,
  value: T[keyof T]
): keyof T | undefined {
  const keys = Object.keys(enumObj) as Array<keyof T>;
  return keys.find(key => enumObj[key] === value);
}

/**
 * Critical audit actions that require immediate notification
 */
export const CRITICAL_AUDIT_ACTIONS: AuditAction[] = [
  AuditAction.USER_DELETED,
  AuditAction.PERMISSIONS_CHANGED,
  AuditAction.DATA_EXPORTED,
  AuditAction.SYSTEM_CONFIG_CHANGED,
  AuditAction.USER_BANNED,
];

/**
 * Security event types that require immediate response
 */
export const CRITICAL_SECURITY_EVENTS: SecurityEventType[] = [
  SecurityEventType.SESSION_HIJACK_ATTEMPT,
  SecurityEventType.BRUTE_FORCE_ATTEMPT,
  SecurityEventType.ACCOUNT_TAKEOVER_ATTEMPT,
];

/**
 * User roles that have admin privileges
 */
export const ADMIN_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

/**
 * User roles that have moderation privileges
 */
export const MODERATOR_ROLES: UserRole[] = [
  UserRole.MODERATOR,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

/**
 * User statuses that prevent login
 */
export const BLOCKED_STATUSES: UserStatus[] = [
  UserStatus.SUSPENDED,
  UserStatus.BANNED,
];

/**
 * Session statuses that are considered invalid
 */
export const INVALID_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.EXPIRED,
  SessionStatus.REVOKED,
];