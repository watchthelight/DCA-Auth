/**
 * Authentication Middleware
 *
 * Express middleware for protecting routes and handling authentication
 */

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { jwtService } from '../services/jwt.service.js';
import { sessionService } from '../services/session.service.js';
import { prisma } from '../../database/client.js';
import { logger } from '../../logging/logger.js';
import { AuthError, ForbiddenError } from '../../errors/index.js';
import { hasRole, hasAnyRole } from '../../database/types/user.types.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      session?: SessionInfo;
      token?: string;
    }
  }
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  email?: string | null;
  discordId: string;
  roles: UserRole[];
  status: string;
}

export interface SessionInfo {
  id: string;
  deviceType?: string;
  ipAddress: string;
  lastActivityAt: Date;
}

/**
 * Extract token from request
 */
function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }
  }

  // Check query parameter (for WebSocket connections)
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }

  // Check cookies
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }

  return null;
}

/**
 * Extract device fingerprint from request
 */
function extractFingerprint(req: Request): string | undefined {
  return req.headers['x-device-fingerprint'] as string | undefined;
}

/**
 * Authenticate request
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new AuthError('No authentication token provided', 'NO_TOKEN');
    }

    const fingerprint = extractFingerprint(req);

    // Verify token
    const decoded = await jwtService.verifyAccessToken(token, fingerprint);

    // Validate session
    const validationResult = await sessionService.validateSession(decoded.sid, {
      checkExpiry: true,
      checkIdle: true,
      updateActivity: true,
    });

    if (!validationResult.valid) {
      throw new AuthError(
        `Session ${validationResult.reason}`,
        'INVALID_SESSION'
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        username: true,
        email: true,
        discordId: true,
        roles: true,
        status: true,
      },
    });

    if (!user) {
      throw new AuthError('User not found', 'USER_NOT_FOUND');
    }

    // Check user status
    if (user.status === 'BANNED') {
      throw new AuthError('Account is banned', 'ACCOUNT_BANNED');
    }

    if (user.status === 'SUSPENDED') {
      throw new AuthError('Account is suspended', 'ACCOUNT_SUSPENDED');
    }

    // Attach user and session to request
    req.user = user;
    req.session = {
      id: decoded.sid,
      deviceType: validationResult.session?.deviceType,
      ipAddress: validationResult.session?.ipAddress || req.ip,
      lastActivityAt: validationResult.session?.lastActivityAt || new Date(),
    };
    req.token = token;

    logger.debug('Request authenticated', {
      userId: user.id,
      sessionId: decoded.sid,
      path: req.path,
    });

    next();
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(401).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    } else {
      logger.error('Authentication error', error);
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: 'Authentication failed',
        },
      });
    }
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function authenticateOptional(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

  try {
    const fingerprint = extractFingerprint(req);
    const decoded = await jwtService.verifyAccessToken(token, fingerprint);

    const validationResult = await sessionService.validateSession(decoded.sid, {
      checkExpiry: true,
      checkIdle: true,
      updateActivity: true,
    });

    if (validationResult.valid) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        select: {
          id: true,
          username: true,
          email: true,
          discordId: true,
          roles: true,
          status: true,
        },
      });

      if (user && user.status === 'ACTIVE') {
        req.user = user;
        req.session = {
          id: decoded.sid,
          deviceType: validationResult.session?.deviceType,
          ipAddress: validationResult.session?.ipAddress || req.ip,
          lastActivityAt: validationResult.session?.lastActivityAt || new Date(),
        };
        req.token = token;
      }
    }
  } catch {
    // Ignore errors in optional authentication
  }

  next();
}

/**
 * Require specific role
 */
export function requireRole(role: UserRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    if (!hasRole(req.user.roles, role)) {
      logger.warn('Access denied - insufficient role', {
        userId: req.user.id,
        requiredRole: role,
        userRoles: req.user.roles,
        path: req.path,
      });

      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_ROLE',
          message: `Role ${role} required`,
        },
      });
    }

    next();
  };
}

/**
 * Require any of specified roles
 */
export function requireAnyRole(roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    if (!hasAnyRole(req.user.roles, roles)) {
      logger.warn('Access denied - missing required roles', {
        userId: req.user.id,
        requiredRoles: roles,
        userRoles: req.user.roles,
        path: req.path,
      });

      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_ROLE',
          message: `One of these roles required: ${roles.join(', ')}`,
        },
      });
    }

    next();
  };
}

/**
 * Require admin access
 */
export const requireAdmin = requireAnyRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]);

/**
 * Require moderator access
 */
export const requireModerator = requireAnyRole([
  UserRole.MODERATOR,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
]);

/**
 * Check if user can access a resource
 */
export function canAccessResource(
  resourceOwnerId: string,
  allowRoles?: UserRole[]
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
    }

    // Check if user owns the resource
    if (req.user.id === resourceOwnerId) {
      return next();
    }

    // Check if user has override role
    if (allowRoles && hasAnyRole(req.user.roles, allowRoles)) {
      return next();
    }

    // Check if user is admin
    if (hasAnyRole(req.user.roles, [UserRole.ADMIN, UserRole.SUPER_ADMIN])) {
      return next();
    }

    logger.warn('Access denied to resource', {
      userId: req.user.id,
      resourceOwnerId,
      path: req.path,
    });

    return res.status(403).json({
      error: {
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to access this resource',
      },
    });
  };
}

/**
 * Validate API key (for service-to-service auth)
 */
export async function validateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({
      error: {
        code: 'NO_API_KEY',
        message: 'API key required',
      },
    });
  }

  // TODO: Implement API key validation
  // This would typically check against a database of valid API keys

  if (apiKey !== config.auth.apiKey) {
    logger.warn('Invalid API key attempt', {
      apiKey: apiKey.substring(0, 8) + '...',
      ip: req.ip,
    });

    return res.status(401).json({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
      },
    });
  }

  next();
}

/**
 * Refresh token middleware
 */
export async function refreshTokenMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const refreshToken = req.body.refreshToken || req.cookies?.refresh_token;

    if (!refreshToken) {
      return res.status(400).json({
        error: {
          code: 'NO_REFRESH_TOKEN',
          message: 'Refresh token required',
        },
      });
    }

    const fingerprint = extractFingerprint(req);

    // Use auth service to refresh token
    const tokens = await authService.refreshToken(refreshToken, fingerprint);

    // Set cookies if using cookie auth
    if (req.cookies?.refresh_token) {
      res.cookie('access_token', tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: tokens.expiresIn * 1000,
      });

      res.cookie('refresh_token', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    }

    res.json(tokens);
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(401).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    } else {
      logger.error('Token refresh error', error);
      res.status(401).json({
        error: {
          code: 'REFRESH_FAILED',
          message: 'Failed to refresh token',
        },
      });
    }
  }
}

/**
 * Logout middleware
 */
export async function logoutMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user || !req.session) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Not authenticated',
        },
      });
    }

    await authService.logout(req.session.id, req.user.id);

    // Clear cookies if using cookie auth
    if (req.cookies?.access_token) {
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', error);
    res.status(500).json({
      error: {
        code: 'LOGOUT_FAILED',
        message: 'Failed to logout',
      },
    });
  }
}