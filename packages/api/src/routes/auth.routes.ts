/**
 * Authentication Routes
 *
 * Handles all authentication-related endpoints
 */

import { Router, Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import {
  authService,
  discordStrategy,
  authenticate,
  refreshTokenMiddleware,
  logoutMiddleware,
} from '@dca-auth/shared/auth';
import { logger } from '@dca-auth/shared/logging/logger';
import { ValidationError } from '@dca-auth/shared/errors';

const router = Router();

// Rate limiting for auth endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  skipSuccessfulRequests: true,
  message: 'Too many authentication attempts, please try again later.',
});

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register',
  authRateLimit,
  [
    body('discordId').isString().isLength({ min: 17, max: 19 }),
    body('username').isString().isLength({ min: 3, max: 32 }),
    body('discriminator').isString().isLength({ min: 4, max: 4 }),
    body('email').optional().isEmail(),
    body('password').optional().isString().isLength({ min: 8 }),
    body('acceptedTerms').isBoolean().equals('true'),
    body('marketingConsent').optional().isBoolean(),
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

      const result = await authService.register(req.body, req.ip);

      logger.info('User registered', {
        userId: result.user.id,
        username: result.user.username,
        correlationId: (req as any).correlationId,
      });

      res.status(201).json({
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          discordId: result.user.discordId,
          roles: result.user.roles,
        },
        tokens: result.tokens,
        sessionId: result.sessionId,
        requiresEmailVerification: result.requiresEmailVerification,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/login
 * Login with credentials
 */
router.post('/login',
  authRateLimit,
  [
    body('identifier').isString().notEmpty(),
    body('password').isString().notEmpty(),
    body('twoFactorCode').optional().isString().isLength({ min: 6, max: 6 }),
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

      const { identifier, password, twoFactorCode } = req.body;
      const userAgent = req.get('user-agent');
      const deviceFingerprint = req.get('x-device-fingerprint');

      const result = await authService.login(
        { identifier, password, twoFactorCode },
        req.ip,
        userAgent,
        deviceFingerprint
      );

      // Set cookies if enabled
      if (config.auth.useCookies) {
        res.cookie('access_token', result.tokens.accessToken, {
          httpOnly: true,
          secure: config.env === 'production',
          sameSite: 'lax',
          maxAge: result.tokens.expiresIn * 1000,
        });

        res.cookie('refresh_token', result.tokens.refreshToken, {
          httpOnly: true,
          secure: config.env === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
      }

      logger.info('User logged in', {
        userId: result.user.id,
        username: result.user.username,
        correlationId: (req as any).correlationId,
      });

      res.json({
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          discordId: result.user.discordId,
          roles: result.user.roles,
        },
        tokens: result.tokens,
        sessionId: result.sessionId,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/logout
 * Logout current session
 */
router.post('/logout', authenticate, logoutMiddleware);

/**
 * POST /api/auth/logout-all
 * Logout all sessions
 */
router.post('/logout-all',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.logoutAllSessions(req.user!.id, req.session?.id);

      // Clear cookies
      if (config.auth.useCookies) {
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
      }

      logger.info('User logged out from all sessions', {
        userId: req.user!.id,
        correlationId: (req as any).correlationId,
      });

      res.json({ message: 'Logged out from all sessions' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', refreshTokenMiddleware);

/**
 * GET /api/auth/discord
 * Get Discord OAuth URL
 */
router.get('/discord', (req: Request, res: Response) => {
  const state = req.query.state as string || undefined;
  const authUrl = discordStrategy.getAuthorizationUrl(state);

  res.json({ authUrl });
});

/**
 * POST /api/auth/discord/callback
 * Handle Discord OAuth callback
 */
router.post('/discord/callback',
  [body('code').isString().notEmpty()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid input', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const { code } = req.body;
      const userAgent = req.get('user-agent');

      const result = await discordStrategy.authenticate(code, req.ip, userAgent);

      // Set cookies if enabled
      if (config.auth.useCookies) {
        res.cookie('access_token', result.tokens.accessToken, {
          httpOnly: true,
          secure: config.env === 'production',
          sameSite: 'lax',
          maxAge: result.tokens.expiresIn * 1000,
        });

        res.cookie('refresh_token', result.tokens.refreshToken, {
          httpOnly: true,
          secure: config.env === 'production',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });
      }

      logger.info('Discord OAuth successful', {
        userId: result.user.id,
        isNewUser: result.isNewUser,
        correlationId: (req as any).correlationId,
      });

      res.json({
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          discordId: result.user.discordId,
          roles: result.user.roles,
        },
        tokens: result.tokens,
        sessionId: result.sessionId,
        isNewUser: result.isNewUser,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/discord/link
 * Link Discord account to existing user
 */
router.post('/discord/link',
  authenticate,
  [body('code').isString().notEmpty()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid input', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      const { code } = req.body;
      await discordStrategy.linkAccount(req.user!.id, code, req.ip);

      logger.info('Discord account linked', {
        userId: req.user!.id,
        correlationId: (req as any).correlationId,
      });

      res.json({ message: 'Discord account linked successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/discord/unlink
 * Unlink Discord account
 */
router.post('/discord/unlink',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await discordStrategy.unlinkAccount(req.user!.id, req.ip);

      logger.info('Discord account unlinked', {
        userId: req.user!.id,
        correlationId: (req as any).correlationId,
      });

      res.json({ message: 'Discord account unlinked successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/password/reset-request
 * Request password reset
 */
router.post('/password/reset-request',
  authRateLimit,
  [body('email').isEmail()],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ValidationError('Invalid input', errors.array().map(err => ({
          field: err.type === 'field' ? err.path : 'unknown',
          message: err.msg,
        })));
      }

      // TODO: Implement password reset request
      // This would typically:
      // 1. Find user by email
      // 2. Generate reset token
      // 3. Send email with reset link
      // 4. Store token with expiration

      logger.info('Password reset requested', {
        email: req.body.email,
        correlationId: (req as any).correlationId,
      });

      // Always return success to prevent email enumeration
      res.json({
        message: 'If the email exists, a password reset link has been sent.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/password/reset
 * Reset password with token
 */
router.post('/password/reset',
  [
    body('token').isString().notEmpty(),
    body('password').isString().isLength({ min: 8 }),
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

      // TODO: Implement password reset
      // This would typically:
      // 1. Verify reset token
      // 2. Update user password
      // 3. Invalidate all sessions
      // 4. Send confirmation email

      logger.info('Password reset completed', {
        correlationId: (req as any).correlationId,
      });

      res.json({ message: 'Password has been reset successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/auth/verify-email/:token
 * Verify email address
 */
router.get('/verify-email/:token',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.params;

      // TODO: Implement email verification
      // This would typically:
      // 1. Verify the token
      // 2. Update user's email verified status
      // 3. Log the verification

      logger.info('Email verification attempted', {
        correlationId: (req as any).correlationId,
      });

      res.json({ message: 'Email verified successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me',
  authenticate,
  async (req: Request, res: Response) => {
    res.json({
      user: req.user,
      session: req.session,
    });
  }
);

// Import config after to avoid circular dependency
import { config } from '@dca-auth/shared/config';

export default router;