/**
 * User Type Definitions
 *
 * TypeScript types and interfaces for User-related database models
 */

import { User, UserProfile, UserRole, UserStatus } from '@prisma/client';

/**
 * User with all relations
 */
export interface UserWithRelations extends User {
  profile?: UserProfile | null;
  sessions?: SessionInfo[];
  auditLogs?: AuditLogEntry[];
}

/**
 * User creation input
 */
export interface CreateUserInput {
  discordId: string;
  username: string;
  discriminator: string;
  email?: string;
  avatarHash?: string;
  roles?: UserRole[];
  metadata?: Record<string, any>;
}

/**
 * User update input
 */
export interface UpdateUserInput {
  username?: string;
  email?: string;
  avatarHash?: string;
  status?: UserStatus;
  roles?: UserRole[];
  metadata?: Record<string, any>;
  preferences?: Record<string, any>;
}

/**
 * User profile creation input
 */
export interface CreateUserProfileInput {
  userId: string;
  globalName?: string;
  accentColor?: number;
  banner?: string;
  locale?: string;
  premiumType?: number;
  bio?: string;
  timezone?: string;
  dateFormat?: string;
  language?: string;
  emailNotifications?: boolean;
  discordNotifications?: boolean;
  licenseExpireNotifications?: boolean;
  website?: string;
  company?: string;
  jobTitle?: string;
}

/**
 * User profile update input
 */
export interface UpdateUserProfileInput {
  globalName?: string;
  bio?: string;
  timezone?: string;
  dateFormat?: string;
  language?: string;
  emailNotifications?: boolean;
  discordNotifications?: boolean;
  licenseExpireNotifications?: boolean;
  website?: string;
  company?: string;
  jobTitle?: string;
}

/**
 * User authentication input
 */
export interface UserAuthInput {
  identifier: string; // Can be email, username, or Discord ID
  password?: string;
  twoFactorCode?: string;
}

/**
 * User registration input
 */
export interface UserRegistrationInput extends CreateUserInput {
  password?: string;
  acceptedTerms: boolean;
  marketingConsent?: boolean;
}

/**
 * Discord OAuth user data
 */
export interface DiscordUserData {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string | null;
  email?: string | null;
  verified?: boolean;
  global_name?: string | null;
  accent_color?: number | null;
  banner?: string | null;
  locale?: string;
  premium_type?: number;
  public_flags?: number;
  flags?: number;
}

/**
 * User search filters
 */
export interface UserSearchFilters {
  username?: string;
  email?: string;
  discordId?: string;
  status?: UserStatus | UserStatus[];
  roles?: UserRole | UserRole[];
  isEmailVerified?: boolean;
  isBanned?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
  lastLoginAfter?: Date;
  lastLoginBefore?: Date;
  search?: string; // General search term
}

/**
 * User pagination options
 */
export interface UserPaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'lastLoginAt' | 'username' | 'email';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated user response
 */
export interface PaginatedUserResponse {
  users: User[];
  total: number;
  page: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * User statistics
 */
export interface UserStatistics {
  totalUsers: number;
  activeUsers: number;
  bannedUsers: number;
  verifiedUsers: number;
  usersByRole: Record<UserRole, number>;
  usersByStatus: Record<UserStatus, number>;
  newUsersToday: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  activeSessionsCount: number;
}

/**
 * User security settings
 */
export interface UserSecuritySettings {
  userId: string;
  twoFactorEnabled: boolean;
  passwordLastChanged?: Date;
  requirePasswordChange: boolean;
  trustedDevices: string[];
  securityQuestions?: Array<{
    question: string;
    answerHash: string;
  }>;
}

/**
 * User permission check
 */
export interface UserPermissionCheck {
  userId: string;
  resource: string;
  action: string;
  allowed: boolean;
  roles: UserRole[];
  reason?: string;
}

/**
 * User session info (minimal)
 */
export interface SessionInfo {
  id: string;
  deviceName?: string;
  deviceType?: string;
  ipAddress: string;
  location?: string;
  lastActivityAt: Date;
  createdAt: Date;
}

/**
 * Audit log entry (minimal)
 */
export interface AuditLogEntry {
  id: string;
  action: string;
  details: Record<string, any>;
  createdAt: Date;
}

/**
 * User export data (GDPR compliance)
 */
export interface UserExportData {
  user: User;
  profile?: UserProfile | null;
  sessions: SessionInfo[];
  auditLogs: AuditLogEntry[];
  loginAttempts: Array<{
    attemptedAt: Date;
    success: boolean;
    ipAddress: string;
  }>;
  createdAt: Date;
  exportedAt: Date;
}

/**
 * User role helpers
 */
export const USER_ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.USER]: 0,
  [UserRole.PREMIUM]: 1,
  [UserRole.MODERATOR]: 2,
  [UserRole.ADMIN]: 3,
  [UserRole.SUPER_ADMIN]: 4,
};

/**
 * Check if user has required role
 */
export function hasRole(userRoles: UserRole[], requiredRole: UserRole): boolean {
  return userRoles.some(role =>
    USER_ROLE_HIERARCHY[role] >= USER_ROLE_HIERARCHY[requiredRole]
  );
}

/**
 * Check if user has any of the required roles
 */
export function hasAnyRole(userRoles: UserRole[], requiredRoles: UserRole[]): boolean {
  return requiredRoles.some(role => hasRole(userRoles, role));
}

/**
 * Get highest user role
 */
export function getHighestRole(userRoles: UserRole[]): UserRole {
  return userRoles.reduce((highest, role) =>
    USER_ROLE_HIERARCHY[role] > USER_ROLE_HIERARCHY[highest] ? role : highest,
    UserRole.USER
  );
}

/**
 * User validation schemas (for use with validation libraries)
 */
export const UserValidation = {
  username: {
    min: 3,
    max: 32,
    pattern: /^[a-zA-Z0-9_-]+$/,
  },
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  password: {
    min: 8,
    max: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: true,
  },
  discordId: {
    pattern: /^\d{17,19}$/,
  },
};